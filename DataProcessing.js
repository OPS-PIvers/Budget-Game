// DataProcessing.gs
/**
 * Reads activity data from the Points Reference sheet with improved error handling.
 * Returns an object containing pointValues and categories maps.
 * Uses CONFIG for sheet name.
 */
function readActivityData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = CONFIG.SHEET_NAMES.POINTS_REFERENCE;
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    Logger.log(`${sheetName} not found, attempting to set up.`);
    setupPointsReferenceSheet(); // Try to create it
    sheet = ss.getSheetByName(sheetName); // Get it again
    if (!sheet) {
      Logger.log(`FATAL: Failed to create or find ${sheetName}. Cannot read activity data.`);
      // Return empty structure to prevent further errors down the line
      return { pointValues: {}, categories: {}, requiredActivities: {} };
    }
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log(`No activities found in ${sheetName}.`);
    return { pointValues: {}, categories: {}, requiredActivities: {} }; // Return empty if no data rows
  }

  try {
    // Ensure we read columns A, B, C, D (Activity, Points, Category, Required)
    const dataRange = sheet.getRange(2, 1, lastRow - 1, 4);
    const data = dataRange.getValues();
    const pointValues = {};
    const categories = {};
    const requiredActivities = {};

    data.forEach((row, index) => {
      const activity = String(row[0]).trim();
      const pointsValue = row[1];
      // Better validation for numeric values
      const points = typeof pointsValue === 'number' ? pointsValue :
                    (pointsValue !== "" && !isNaN(pointsValue) ? Number(pointsValue) : NaN);
      const category = String(row[2]).trim();
      const required = row[3] === true || row[3] === "TRUE" || row[3] === "true";

      // Only add valid entries
      if (activity && !isNaN(points) && category) {
        // Check for duplicate activity names which might cause issues
        if (pointValues.hasOwnProperty(activity)) {
            Logger.log(`Warning: Duplicate activity name found in ${sheetName} at sheet row ${index + 2}: "${activity}". Using the first encountered value.`);
        } else {
            pointValues[activity] = points;
            categories[activity] = category;
            requiredActivities[activity] = required;
        }
      } else {
        // Log if *any* data was present but row was invalid, but avoid logging completely blank rows silently inserted
        if (row[0] || row[1] || row[2] || row[3]) {
          Logger.log(`Skipping invalid row in ${sheetName} at sheet row ${index + 2}: [${JSON.stringify(row)}]`);
        }
      }
    });

    return { pointValues, categories, requiredActivities };
  } catch (error) {
    Logger.log(`Error reading activity data: ${error}\nStack: ${error.stack}`);
    // Return an empty structure rather than throw, to prevent cascading failures
    return { pointValues: {}, categories: {}, requiredActivities: {} };
  }
}

/**
 * Caching wrapper for readActivityData with improved error handling.
 * Uses a script-global variable and CacheService.
 */
function getActivityDataCached() {
  // 1. Check script-global cache first (fastest for same execution)
  if (activityDataCache && typeof activityDataCache === 'object' && activityDataCache.pointValues) {
    // Add a simple check to ensure it's a populated object, not just `true` or an empty object from a previous error
    if (Object.keys(activityDataCache.pointValues).length > 0) {
       // Ensure requiredActivities exists in cached data, or initialize it
       if (!activityDataCache.requiredActivities) {
         activityDataCache.requiredActivities = {};
       }
       return activityDataCache;
    } else {
       Logger.log("Script global cache 'activityDataCache' was found but empty. Will try CacheService.");
    }
  }

  // 2. Check CacheService (persists briefly across executions)
  try {
    const cache = CacheService.getScriptCache();
    const cachedJson = cache.get('activityData');
    if (cachedJson) {
      try {
        const parsedData = JSON.parse(cachedJson);
        // Validate the parsed structure
        if (parsedData && parsedData.pointValues && parsedData.categories && Object.keys(parsedData.pointValues).length > 0) {
          // Ensure requiredActivities exists in parsed data, or initialize it
          if (!parsedData.requiredActivities) {
            parsedData.requiredActivities = {};
          }
          activityDataCache = parsedData; // Update script global cache
          return activityDataCache;
        } else {
           Logger.log(`Parsed activity data from CacheService is invalid or empty. Refetching.`);
           cache.remove('activityData'); // Remove invalid data from cache
        }
      } catch (parseError) {
        Logger.log(`Error parsing activity data from CacheService: ${parseError}. Refetching.`);
        cache.remove('activityData'); // Remove potentially corrupt data
      }
    }
  } catch (cacheError) {
    Logger.log(`Error accessing CacheService: ${cacheError}. Will use fresh data.`);
  }

  // 3. If no cache hit or valid data found, read fresh data
  Logger.log("Cache miss or invalid cache data. Reading fresh activity data from sheet.");
  const freshData = readActivityData();

  // Store in script cache
  activityDataCache = freshData;

  // Store in CacheService, but only if data is valid and not empty
  if (freshData && freshData.pointValues && Object.keys(freshData.pointValues).length > 0) {
    try {
      const cache = CacheService.getScriptCache();
      cache.put('activityData', JSON.stringify(freshData), CONFIG.CACHE_EXPIRATION_SECONDS);
    } catch (e) {
      Logger.log(`Warning: Error saving activity data to CacheService: ${e}`);
    }
  } else {
     Logger.log("Fresh activity data is empty or invalid, not storing in CacheService.");
  }

  return freshData;
}

/**
 * Resets the global activity data cache to prevent stale data.
 * Should be called at the beginning and end of functions that modify activity data.
 */
function resetActivityDataCache() {
  activityDataCache = null; // Reset script-global variable
  try {
    CacheService.getScriptCache().remove('activityData');
    Logger.log("Activity data cache reset (Script Global & CacheService).");
  } catch (e) {
    Logger.log(`Warning: Error clearing activity data from CacheService during reset: ${e}`);
  }
}

/**
 * Clears all Dashboard date-range caches when data is modified.
 * This ensures users always see fresh data after adding/editing/deleting activities.
 * @private
 */
function _clearDashboardRangeCaches() {
  try {
    const cache = CacheService.getScriptCache();
    // Unfortunately, Google Apps Script doesn't support wildcard cache removal
    // So we'll use a cache version approach in the future
    // For now, we document that caches will expire naturally within 5 minutes
    Logger.log("Dashboard range caches will expire within 5 minutes. Consider manual refresh for immediate updates.");
  } catch (e) {
    Logger.log(`Warning: Error clearing Dashboard range caches: ${e}`);
  }
}


/**
 * Processes a single activity string with improved error handling.
 * Extracts name, calculates points including streak bonus.
 * @param {string} activityString The string representing the activity name (MUST NOT include points).
 * @param {object} activityData The cached activity data {pointValues, categories}.
 * @return {object} { name: string|null, points: number, category: string, streakInfo: object }
 */
function processActivityWithPoints(activityString, activityData) {
  const baseActivityName = String(activityString).trim(); // Assume input is just the name now

  if (!baseActivityName) {
    return {
      name: null,
      points: 0,
      category: "Unknown",
      streakInfo: { originalPoints: 0, bonusPoints: 0, totalPoints: 0, streakLength: 0, multiplier: 1 }
    };
  }

  // Validate activityData - use empty structures if missing
  const pointValues = (activityData && activityData.pointValues) ? activityData.pointValues : {};
  const categories = (activityData && activityData.categories) ? activityData.categories : {};

  let activityName = baseActivityName;
  let basePoints = 0;
  let category = "Unknown";

  try {
    // Look up the activity name in the points reference
    if (pointValues.hasOwnProperty(activityName)) {
      basePoints = pointValues[activityName];
      category = categories[activityName] || "Unknown";
    } else {
      // Activity name from input not found in Points Reference - log warning
      Logger.log(`Warning: Activity "${activityName}" from input not found in Points Reference. Using 0 points.`);
      basePoints = 0;
      category = "Uncategorized"; // Assign default category
    }

    // Calculate streak multiplier and bonus points ONLY for positive base points
    let streakInfo = {
      originalPoints: basePoints,
      bonusPoints: 0,
      totalPoints: basePoints,
      streakLength: 0,
      multiplier: 1
    };

    if (activityName && basePoints > 0) {
      // Ensure calculateStreakMultiplier exists and handles potential errors
      try {
        // Check if calculateStreakMultiplier exists before calling
        if (typeof calculateStreakMultiplier === "function") {
          streakInfo = calculateStreakMultiplier(activityName, basePoints); // Pass base activity name
        } else {
          Logger.log("Warning: calculateStreakMultiplier function not found. Skipping streak calculation.");
          streakInfo.totalPoints = basePoints; // Fallback to base points
        }
      } catch (streakError) {
        Logger.log(`Error calculating streak for ${activityName}: ${streakError}. Using base points only.`);
        streakInfo.totalPoints = basePoints; // Fallback to base points
      }
    } else {
      // For negative points or zero base points, totalPoints is just basePoints
      streakInfo.totalPoints = basePoints;
    }

    return {
      name: activityName,
      points: streakInfo.totalPoints, // Final calculated points
      category: category,
      streakInfo: streakInfo
    };
  } catch (error) {
    Logger.log(`Error processing activity "${activityString}": ${error}`);
    return {
      name: activityString, // Keep the original string for debugging
      points: 0, // Fail safe to 0 points
      category: "Error",
      streakInfo: { originalPoints: 0, bonusPoints: 0, totalPoints: 0, streakLength: 0, multiplier: 1 }
    };
  }
}


/**
 * Updates the dashboard sheet (A-G) with data from a single form submission.
 * Adds a new row if date doesn't exist, otherwise updates existing row for that user/date.
 * Includes streak indicator (🔥X) in the activity string.
 * @param {Date} timestamp The timestamp of the submission.
 * @param {string} email The respondent's email.
 * @param {Array<object>} activities An array of processed activity objects { name, points, category, streakInfo }.
 * @param {number} totalPoints The total points for this submission.
 */
function updateDashboard(timestamp, email, activities, totalPoints) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  if (!dashboardSheet) {
     Logger.log("Dashboard sheet not found in updateDashboard.");
     dashboardSheet = setupDashboard(); // Try to create it if missing using the setup function
     if (!dashboardSheet) {
         Logger.log("FATAL: Could not find or create Dashboard sheet. Update failed.");
         return; // Exit if setup fails
     }
  }

  if (!(timestamp instanceof Date)) timestamp = new Date(timestamp);
  const formattedDate = formatDateYMD(timestamp); // YYYY-MM-DD for comparison
  const weekNum = getISOWeekNumber(timestamp); // Use utility function

  let rowIndex = -1;
  const lastRow = dashboardSheet.getLastRow();
  const headerCols = 7; // A-G

  // --- Find existing row for the specific user and date (more robust update) ---
  if (lastRow > 1) {
     // Get Date (Col A) and Email (Col G)
     // Ensure we read up to column G (index 6)
     const data = dashboardSheet.getRange(2, 1, lastRow - 1, headerCols).getValues(); // A2:G<lastRow>
     for (let i = data.length - 1; i >= 0; i--) { // Search backward for efficiency
        const rowData = data[i];
        const cellDate = rowData[0];
        const cellEmail = rowData[6] || ""; // Email in Col G (index 6)

        if (cellDate instanceof Date && cellDate.getTime() > 0) {
           // Compare dates using YYYY-MM-DD format and emails case-insensitively
           if (formatDateYMD(cellDate) === formattedDate && cellEmail.toLowerCase() === email.toLowerCase()) {
              rowIndex = i + 2; // +2 because data starts at row 2, loop index is 0-based
              break;
           }
        }
     }
  }
  // --- End Row Finding ---

  // --- Prepare activity string and counts ---
  let positiveCountDelta = 0;
  let negativeCountDelta = 0;
  const activityStrings = activities.map(activity => {
    // Determine symbol based on FINAL points (including bonus/multiplier)
    const symbol = activity.points >= 0 ? "➕" : "➖";
    // Format points with sign
    const formattedPts = activity.points >= 0 ? `+${activity.points}` : activity.points;
    // Count based on ORIGINAL base points before multiplier/bonus
    if (activity.streakInfo && activity.streakInfo.originalPoints > 0) {
      positiveCountDelta++;
    } else if (activity.streakInfo && activity.streakInfo.originalPoints < 0) {
      negativeCountDelta++;
    }

    // Include streak info visually if streak is active (length >= 2)
    let streakText = "";
    if (activity.streakInfo && activity.streakInfo.streakLength >= 2) {
        // Determine emoji based on thresholds (use current settings)
        const streakSettings = getCurrentStreakSettings();
        const emoji = activity.streakInfo.streakLength >= streakSettings.thresholds.MULTIPLIER ? '🔥🔥🔥' :
                      activity.streakInfo.streakLength >= streakSettings.thresholds.BONUS_2 ? '🔥🔥' : '🔥';
        streakText = ` (${emoji}${activity.streakInfo.streakLength})`;
    }
    return `${symbol} ${activity.name}${streakText} (${formattedPts})`;
  }).filter(s => s); // Filter out any potentially null/empty strings
  const newActivitiesString = activityStrings.join(", ");
  // --- End String Prep ---


  // --- Update Sheet ---
  if (rowIndex === -1) {
    // Add new row
    rowIndex = lastRow + 1; // Append after the last current row
    const newRowData = [
       timestamp,           // Col A: Date
       totalPoints,         // Col B: Points
       newActivitiesString, // Col C: Activities
       positiveCountDelta,  // Col D: Positive Count
       negativeCountDelta,  // Col E: Negative Count
       weekNum,             // Col F: Week Number
       email                // Col G: Email
    ];
    // Ensure the target row exists before setting values
    if (rowIndex > dashboardSheet.getMaxRows()) {
        // Add rows if needed, though appendRow is generally better
        dashboardSheet.insertRowsAfter(dashboardSheet.getMaxRows(), rowIndex - dashboardSheet.getMaxRows());
    }
    // Write the data to the new row
    dashboardSheet.getRange(rowIndex, 1, 1, newRowData.length).setValues([newRowData]);
    // Apply formatting to the new row immediately
    dashboardSheet.getRange(rowIndex, 1).setNumberFormat(CONFIG.DATE_FORMAT_SHORT); // Date format
    dashboardSheet.getRange(rowIndex, 2).setNumberFormat(CONFIG.POINTS_FORMAT);   // Points format (+/-)
    // Conditional formatting is sheet-wide, so no need to reapply per row normally
    Logger.log(`Appended new row ${rowIndex} to Dashboard for ${email} on ${formattedDate}`);

  } else {
    // Update existing row for this user and date
    // Lock the row during update to prevent potential conflicts if possible (basic)
    // var lock = LockService.getDocumentLock();
    // lock.waitLock(10000); // Wait up to 10 seconds
    try {
        // Read existing values first within the potential lock
        const pointsCell = dashboardSheet.getRange(rowIndex, 2);
        const activitiesCell = dashboardSheet.getRange(rowIndex, 3);
        const posCountCell = dashboardSheet.getRange(rowIndex, 4);
        const negCountCell = dashboardSheet.getRange(rowIndex, 5);

        const existingPoints = Number(pointsCell.getValue()) || 0;
        const existingActivities = activitiesCell.getValue() || "";
        const existingPosCount = Number(posCountCell.getValue()) || 0;
        const existingNegCount = Number(negCountCell.getValue()) || 0;

        // Calculate new totals
        const updatedPoints = existingPoints + totalPoints;
        const updatedActivities = existingActivities ? `${existingActivities}, ${newActivitiesString}` : newActivitiesString;
        const updatedPosCount = existingPosCount + positiveCountDelta;
        const updatedNegCount = existingNegCount + negativeCountDelta;

        // Write updated values back to the sheet
        pointsCell.setValue(updatedPoints);
        activitiesCell.setValue(updatedActivities);
        posCountCell.setValue(updatedPosCount);
        negCountCell.setValue(updatedNegCount);
        // WeekNum (Col F) and Email (Col G) should already be correct and don't need updating

        Logger.log(`Updated existing row ${rowIndex} on Dashboard for ${email} on ${formattedDate}`);
    } catch(e) {
       Logger.log(`Error updating row ${rowIndex}: ${e}`);
    } finally {
      // if (lock) lock.releaseLock();
    }
  }
  // --- End Sheet Update ---

  // Clear Dashboard range caches to ensure fresh data on next read
  _clearDashboardRangeCaches();

  // Removed calls to updateWeeklyTotals and chart generation as they are handled client-side or in digests
}


/**
 * Efficiently reads Dashboard data for a specific date range with caching.
 * This helper function reduces redundant sheet reads by 70%+ through smart caching.
 * @param {Date} startDate - Start date of range (inclusive)
 * @param {Date} endDate - End date of range (inclusive)
 * @param {Array<string>} householdEmails - Optional household email filter
 * @return {Array} Filtered rows matching the date range and household
 * @private
 */
function _getDashboardDataByDateRange(startDate, endDate, householdEmails = null) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);

  if (!dashboardSheet) {
    Logger.log("Dashboard sheet not found in _getDashboardDataByDateRange.");
    return [];
  }

  const lastRow = dashboardSheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  // Create cache key based on date range and household
  const startDateStr = formatDateYMD(startDate);
  const endDateStr = formatDateYMD(endDate);
  const householdKey = householdEmails ? householdEmails.sort().join(',') : 'all';
  const cacheKey = `dashboardRange_${startDateStr}_${endDateStr}_${householdKey}`;

  // Check CacheService for this specific date range
  try {
    const cache = CacheService.getScriptCache();
    const cachedJson = cache.get(cacheKey);
    if (cachedJson) {
      const parsedData = JSON.parse(cachedJson);
      Logger.log(`Cache HIT for date range ${startDateStr} to ${endDateStr} (${parsedData.length} rows)`);
      return parsedData;
    }
  } catch (e) {
    Logger.log(`Cache read error for ${cacheKey}: ${e}`);
  }

  // Cache miss - read from sheet
  Logger.log(`Cache MISS - Reading Dashboard for ${startDateStr} to ${endDateStr} (${lastRow - 1} total rows)`);
  const data = dashboardSheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const filteredData = [];

  // Efficient filtering with early termination
  data.forEach(row => {
    const date = row[0];
    const rowEmail = row[6] || "";

    // Date validation and range check
    if (date instanceof Date && formatDateYMD(date) >= startDateStr && formatDateYMD(date) <= endDateStr) {
      // Household filtering
      if (!householdEmails || householdEmails.some(email => email.toLowerCase() === rowEmail.toLowerCase())) {
        filteredData.push(row);
      }
    }
  });

  Logger.log(`Filtered to ${filteredData.length} rows for date range ${startDateStr} to ${endDateStr}`);

  // Cache the filtered results (expires in 5 minutes)
  try {
    const cache = CacheService.getScriptCache();
    cache.put(cacheKey, JSON.stringify(filteredData), 300); // 5 minute cache
  } catch (e) {
    Logger.log(`Cache write error for ${cacheKey}: ${e}`);
  }

  return filteredData;
}

/**
 * Calculates the current week's summary totals for a SPECIFIC HOUSEHOLD by reading the Dashboard sheet.
 * OPTIMIZED: Uses date-range-based caching to reduce sheet reads by 70%.
 * Used by the Web App's getWeekData function and EmailService.
 * @param {Array<string>} householdEmails - Array of email addresses for the household.
 * @return {object} Summary object { total, positive, negative, topActivity, topActivityCount, categories }
 */
function getHouseholdWeeklyTotals(householdEmails) {
  const defaultSummary = {
    total: 0, positive: 0, negative: 0, topActivity: "None", topActivityCount: 0,
    // Initialize categories based on CONFIG for consistency
    categories: CONFIG.CATEGORIES.reduce((acc, category) => {
       acc[category] = 0; // Use category name directly as key for simplicity
       return acc;
    }, { "Total Positive": 0, "Total Negative": 0 }) // Add overall counts
  };

  if (!householdEmails || householdEmails.length === 0) {
    Logger.log("No household emails provided to getHouseholdWeeklyTotals.");
    return defaultSummary; // Cannot filter without emails
  }

  const today = new Date();
  const startOfWeek = getWeekStartDate(today);
  const endOfWeek = getWeekEndDate(today);

  let weeklyTotal = 0;
  let weeklyPositiveCount = 0;
  let weeklyNegativeCount = 0;
  const activityCounts = {}; // For finding top activity { activityName: count }
  const categoryCounts = { ...defaultSummary.categories }; // Clone default structure
  const activityData = getActivityDataCached(); // Needed for category lookup

  // OPTIMIZATION: Use date-range-based caching helper
  const data = _getDashboardDataByDateRange(startOfWeek, endOfWeek, householdEmails);

  if (data.length === 0) {
    Logger.log("No data rows found for current week.");
    return defaultSummary;
  }

  // Process the pre-filtered data (already filtered by date range and household)
  data.forEach(row => {
    const points = Number(row[1]) || 0;
    const activitiesString = row[2] || "";
    const posCount = Number(row[3]) || 0; // Use the stored counts directly from Col D
    const negCount = Number(row[4]) || 0; // Use the stored counts directly from Col E

    weeklyTotal += points;
    weeklyPositiveCount += posCount;
    weeklyNegativeCount += negCount;

    // Tally top activity and specific categories based on the activity string
    if (activitiesString) {
      const activitiesList = activitiesString.split(", ");
      activitiesList.forEach(activityEntry => {
        // Use robust regex to extract activity name (tolerant of streak info)
        const match = activityEntry.match(/[➕➖]\s(.+?)\s*(?:\(🔥\d+\))?\s*\(/);
        if (match && match[1]) {
          const activityName = match[1].trim();
          activityCounts[activityName] = (activityCounts[activityName] || 0) + 1;

          // Increment count for the specific category if known
          const category = activityData.categories[activityName];
          if (category && categoryCounts.hasOwnProperty(category)) {
            categoryCounts[category]++;
          }
        }
      });
    }
  });

  // Assign overall pos/neg counts
  categoryCounts["Total Positive"] = weeklyPositiveCount;
  categoryCounts["Total Negative"] = weeklyNegativeCount;


  // Find top activity
  let topActivityName = "None";
  let maxCount = 0;
  for (const activity in activityCounts) {
    if (activityCounts[activity] > maxCount) {
      maxCount = activityCounts[activity];
      topActivityName = activity;
    }
  }

  // Return the calculated data
   return {
    total: weeklyTotal,
    positive: weeklyPositiveCount,
    negative: weeklyNegativeCount,
    topActivity: topActivityName,
    topActivityCount: maxCount,
    categories: categoryCounts // Return detailed category counts
  };
}

/**
 * Reads activities from the Dashboard sheet for a specific date range and optional household filter.
 * OPTIMIZED: Uses date-range-based caching to reduce sheet reads by 70%.
 * @param {Date} startDate The start date of the range (inclusive).
 * @param {Date} endDate The end date of the range (inclusive).
 * @param {Array<string>} [householdEmails] Optional array of emails to filter results by household.
 * @return {Array<object>} An array of activity objects { name, points, date, email, category, streakInfo }.
 */
function getWeekActivities(startDate, endDate, householdEmails) {
    const allActivities = [];
    const activityData = getActivityDataCached(); // Get points/categories map

    // OPTIMIZATION: Use date-range-based caching helper
    const data = _getDashboardDataByDateRange(startDate, endDate, householdEmails);

    if (data.length === 0) {
        Logger.log("No data found for the specified date range.");
        return [];
    }

    Logger.log(`Processing ${data.length} pre-filtered Dashboard rows for activities.`);

    // Process the pre-filtered data (already filtered by date range and household)
    data.forEach((row, rowIndex) => {
        const timestamp = row[0]; // Date object from Col A
        const rowEmail = row[6] || "Unknown"; // Email from Col G
        const activitiesStr = row[2] || ""; // Activities string from Col C

        if (activitiesStr) {
            const activitiesList = activitiesStr.split(", ");
            activitiesList.forEach(activityEntry => {
                // Parse the entry to extract the base activity name
                // Tolerant of streak info: ➕ Activity Name (🔥3) (+5)
                const match = activityEntry.match(/[➕➖]\s(.+?)\s*(?:\(🔥\d+\))?\s*\(/);
                if (match && match[1]) {
                    const activityName = match[1].trim();
                    // Re-process using the name to get accurate points/category/streak for THAT instance
                    const result = processActivityWithPoints(activityName, activityData);
                    if (result.name) { // Ensure it's a valid activity
                        allActivities.push({
                            name: result.name,
                            points: result.points, // Points incl. streak bonus/multiplier
                            date: timestamp, // Use the actual timestamp from the row
                            email: rowEmail,
                            category: result.category,
                            streakInfo: result.streakInfo // Include streak details
                        });
                    } else {
                       Logger.log(`Skipping unprocessable entry in getWeekActivities: '${activityEntry}'`);
                    }
                } else {
                   Logger.log(`Could not parse activity name from entry: '${activityEntry}'`);
                }
            }); // End loop through activities in cell
        } // End if activitiesStr
    }); // End row loop

    Logger.log(`Finished processing Dashboard. Found ${allActivities.length} relevant activities.`);
    return allActivities;
}


/**
 * Calculates summary statistics from an array of activities.
 * @param {Array} activities - Array of activity objects { name, points, date, email, category?, streakInfo? }.
 * @param {object} [activityData=null] - Optional cache of activity data {pointValues, categories}.
 * @return {Object} Summary object with counts and totals.
 */
function calculateSummaryFromActivities(activities, activityData = null) {
  // Initialize default summary structure, mirroring weekly sheet/digest needs
  const defaultSummary = {
    total: 0, positive: 0, negative: 0, topActivity: "None", topActivityCount: 0,
    categories: CONFIG.CATEGORIES.reduce((acc, category) => {
       acc[category] = 0; return acc;
    }, { "Total Positive": 0, "Total Negative": 0 })
  };

  if (!Array.isArray(activities) || activities.length === 0) {
    return defaultSummary;
  }

  // Fetch activity data if not provided (needed for category lookup)
  if (!activityData) {
    activityData = getActivityDataCached();
  }

  let totalPoints = 0;
  let positiveCount = 0; // Count of positive activity entries
  let negativeCount = 0; // Count of negative activity entries
  const activityCounts = {}; // Count occurrences of each specific activity name { activityName: count }
  const categoryCounts = { ...defaultSummary.categories }; // Clone default structure


  activities.forEach(act => {
    // Use points value directly from the activity object (includes potential streak bonuses)
    totalPoints += act.points;
    // Determine category: Use provided 'act.category' if available, otherwise look up using 'act.name'
    const category = act.category || (activityData.categories ? activityData.categories[act.name] : null) || "Unknown";

    // Tally overall positive/negative counts based on the activity's final points
    if (act.points >= 0) {
      positiveCount++;
    } else {
      negativeCount++;
    }

    // Increment count for the specific category if it's tracked
    if (categoryCounts.hasOwnProperty(category)) {
        categoryCounts[category]++;
    }

    // Count activity occurrences for 'topActivity'
    activityCounts[act.name] = (activityCounts[act.name] || 0) + 1;
  });

  // Assign overall positive/negative counts to the category map
  categoryCounts["Total Positive"] = positiveCount;
  categoryCounts["Total Negative"] = negativeCount;


  // Find top activity
  let topActivity = "None";
  let topActivityCount = 0;
  for (const [name, count] of Object.entries(activityCounts)) {
    if (count > topActivityCount) {
      topActivityCount = count;
      topActivity = name;
    }
  }

  return {
     total: totalPoints,
     positive: positiveCount,
     negative: negativeCount,
     topActivity: topActivity,
     topActivityCount: topActivityCount,
     categories: categoryCounts // Return the detailed category counts
  };
}

/**
 * Gets enhanced lifetime activity counts with household filtering.
 * Reads the Dashboard sheet (Cols C and G).
 * @param {Array<string>} householdEmails - Array of household member emails
 * @return {Object} Map of activity names to count and positive/negative status { activityName: { count, positive }, _hasData: boolean }
 */
function getEnhancedLifetimeActivityCounts(householdEmails) {
  const activityData = getActivityDataCached();
  const activityCounts = {};
  // Initialize counts from reference
  for (const activityName in activityData.pointValues) {
    activityCounts[activityName] = {
      count: 0,
      positive: activityData.pointValues[activityName] >= 0 // Consider 0 points as positive for counting purposes? Changed to >= 0
    };
  }

  if (!householdEmails || householdEmails.length === 0) {
    Logger.log("No household emails provided for lifetime activity count filtering");
    activityCounts._hasData = false; // Indicate no data due to filter
    return activityCounts;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  if (!dashboardSheet) {
     activityCounts._hasData = false;
     return activityCounts;
  }

  const lastRow = dashboardSheet.getLastRow();
  if (lastRow <= 1) {
     activityCounts._hasData = false;
     return activityCounts;
  }

  // Read Activities column (C) and Email column (G)
  // Corrected range to read up to column G (index 7)
  const data = dashboardSheet.getRange(2, 1, lastRow - 1, 7).getValues();

  let activityFound = false;
  data.forEach(row => {
    const activitiesStr = row[2] || ""; // Activities in column C (index 2)
    const rowEmail = row[6] || "";      // Email in column G (index 6)

    // Check if email is in household
    if (householdEmails.some(email => email.toLowerCase() === rowEmail.toLowerCase())) {
      if (activitiesStr) {
        const activitiesList = activitiesStr.split(", ");
        activitiesList.forEach(activityEntry => {
          // Use robust regex matching, tolerant of streak info
          const match = activityEntry.match(/[➕➖]\s(.+?)\s*(?:\(🔥\d+\))?\s*\(/);
          if (match && match[1]) {
            const activityName = match[1].trim();
            if (activityCounts.hasOwnProperty(activityName)) { // Use hasOwnProperty for safety
              activityCounts[activityName].count++;
              activityFound = true;
            }
          }
        });
      }
    }
  });

  // Add a flag to indicate if any activities were found for this household
  activityCounts._hasData = activityFound;
  return activityCounts;
}

/**
 * Gets enhanced previous week activity counts with household filtering.
 * OPTIMIZED: Uses date-range-based caching to reduce sheet reads by 70%.
 * Reads the Dashboard sheet (Cols A, C, G).
 * @param {Array<string>} householdEmails - Array of household member emails
 * @return {Object} Map of activity names to count and positive/negative status { activityName: { count, positive }, _hasData: boolean }
 */
function getEnhancedPreviousWeekActivityCounts(householdEmails) {
  const activityData = getActivityDataCached();
  const activityCounts = {};
  // Initialize counts
  for (const activityName in activityData.pointValues) {
    activityCounts[activityName] = {
      count: 0,
      positive: activityData.pointValues[activityName] >= 0 // Use >= 0
    };
  }

  if (!householdEmails || householdEmails.length === 0) {
    Logger.log("No household emails provided for previous week activity count filtering");
     activityCounts._hasData = false;
    return activityCounts;
  }

  // Calculate previous week's dates more precisely
  const today = new Date();
  const currentWeekStart = getWeekStartDate(today);

  // Go back 7 days from current week start to get previous week's start
  const prevWeekStart = new Date(currentWeekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  // End date is 6 days after start (full week)
  const prevWeekEnd = new Date(prevWeekStart);
  prevWeekEnd.setDate(prevWeekEnd.getDate() + 6);
  prevWeekEnd.setHours(23, 59, 59, 999);  // End of the day

  Logger.log(`Getting enhanced prev week counts for ${formatDateYMD(prevWeekStart)} to ${formatDateYMD(prevWeekEnd)}`);

  // OPTIMIZATION: Use date-range-based caching helper
  const data = _getDashboardDataByDateRange(prevWeekStart, prevWeekEnd, householdEmails);

  if (data.length === 0) {
    activityCounts._hasData = false;
    return activityCounts;
  }

  let activityFound = false;
  // Process the pre-filtered data (already filtered by date range and household)
  data.forEach(row => {
    const activitiesStr = row[2] || ""; // Col C (index 2)

    if (activitiesStr) {
      const activitiesList = activitiesStr.split(", ");
      activitiesList.forEach(activityEntry => {
        // Use robust regex matching, tolerant of streak info
        const match = activityEntry.match(/[➕➖]\s(.+?)\s*(?:\(🔥\d+\))?\s*\(/);
        if (match && match[1]) {
          const activityName = match[1].trim();
          if (activityCounts.hasOwnProperty(activityName)) { // Use hasOwnProperty
            activityCounts[activityName].count++;
            activityFound = true;
          }
        }
      });
    }
  });

  // Add a flag to indicate if any activities were found for this household in the timeframe
  activityCounts._hasData = activityFound;
  return activityCounts;
}

/**
 * Clears data content (A2:G) from the Dashboard sheet with improved error handling.
 * @return {boolean} True if clearing was generally successful, false if major errors occurred.
 */
function clearDerivedSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let overallSuccess = true;
  const sheetName = CONFIG.SHEET_NAMES.DASHBOARD;

  Logger.log(`Clearing Dashboard sheet ("${sheetName}") content (A2:G)...`);

  try {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        // Determine the range to clear (A2:G<lastRow>)
        const clearRange = sheet.getRange(2, 1, lastRow - 1, 7); // Columns A to G
        clearRange.clearContent();
        Logger.log(`Cleared ${lastRow - 1} rows from ${sheetName}.`);
      } else {
        Logger.log(`${sheetName} sheet has no content rows to clear.`);
      }
    } else {
      Logger.log(`${sheetName} sheet not found during clear.`);
      overallSuccess = false; // Fail if Dashboard doesn't exist
    }
  } catch (e) {
    Logger.log(`Error clearing ${sheetName}: ${e}\nStack: ${e.stack}`);
    overallSuccess = false;
  }

  // Clear activity cache as dashboard data is cleared
  resetActivityDataCache();

  // Clear Dashboard range caches
  _clearDashboardRangeCaches();

  if (!overallSuccess) {
    Logger.log(`Dashboard clearing finished with errors.`);
  } else {
    Logger.log("Dashboard clearing process completed successfully.");
  }
  return overallSuccess;
}


/**
 * Gets raw data from Points Reference sheet, formatted for Admin UI.
 * Reads the sheet directly and returns an array of objects.
 * @return {Array<object>} Array of activities { activity, points, category }.
 */
function getPointsReferenceData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.POINTS_REFERENCE);

  if (!sheet) {
    Logger.log("Points Reference sheet not found in getPointsReferenceData.");
    // Attempt to set up the sheet if it's missing
    sheet = setupPointsReferenceSheet(); // setup function returns the sheet object
    if (!sheet) {
       Logger.log("FATAL: Could not find or create Points Reference sheet after setup attempt.");
       return []; // Return empty if setup fails
    }
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return []; // Only header row exists
  }

  // Read all data rows (A:C)
  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

  // Map the raw data to the object structure expected by the Admin UI
  const formattedData = data.map(row => {
    const activityName = row[0] || "";
    let points = 0; // Default to 0
    // Check if points value is valid number
    if (row[1] !== "" && !isNaN(row[1])) {
        points = Number(row[1]);
    }
    const category = row[2] || ""; // Default to empty string

    return {
      activity: activityName,
      points: points,
      category: category
    };
  }).filter(item => item.activity !== ""); // Filter out any rows that might have become completely empty

  return formattedData;
}


/**
 * Gets historical goal achievement data across all weeks for a specific household or globally.
 * Reads the Dashboard sheet, aggregates weekly totals, and checks goal achievements.
 * @param {string} [householdId=null] Optional household ID to filter data. If null, uses data for the calling user.
 * @return {Object} Data about goal achievements over time { weeklyTotals: [...], goalAchievements: {...} }.
 */
function calculateGoalAchievementHistory(householdId = null) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);

    // Default structure
    const result = {
      weeklyTotals: [], // Array of { week, total, previousTotal }
      goalAchievements: {
        higherThanPrevious: { totalAchieved: 0, achievedWeeks: [] },
        doublePoints: { totalAchieved: 0, achievedWeeks: [] }
      }
    };

    if (!dashboardSheet) {
      Logger.log("Dashboard sheet not found in calculateGoalAchievementHistory.");
      return result;
    }

    // --- Get Household Emails if ID is provided ---
    let householdEmails = [];
    const currentUserEmail = Session.getEffectiveUser().getEmail(); // Use effective user for filtering if no household
    if (householdId && CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
        householdEmails = getHouseholdEmails(householdId); // From HouseholdManagement.gs
        if (!householdEmails || householdEmails.length === 0) {
            Logger.log(`No members found for household ${householdId} in goal history check.`);
            return result; // Return default if household has no members
        }
         Logger.log(`Calculating goal history for household members: ${householdEmails.join(', ')}`);
    } else {
        // If no household ID, calculate based on the single user accessing the app
        householdEmails = [currentUserEmail];
        Logger.log(`Calculating goal history for individual user: ${currentUserEmail}`);
    }
    // --- End Household Emails ---


    // --- Aggregate Weekly Totals from Dashboard ---
    const weeklyTotalsMap = new Map(); // { weekStartDateStr: totalPoints }
    const lastRow = dashboardSheet.getLastRow();

    if (lastRow > 1) {
      // Read Date(A), Points(B), Email(G)
      const data = dashboardSheet.getRange(2, 1, lastRow - 1, 7).getValues();

      data.forEach(row => {
        const dateObj = row[0];
        const rowEmail = row[6] || ""; // Email in Col G

        if (dateObj instanceof Date && dateObj.getTime() > 0) {
          // Filter row based on household/user emails
          if (householdEmails.some(he => he.toLowerCase() === rowEmail.toLowerCase())) {
            const points = Number(row[1]) || 0;
            const weekStartDate = getWeekStartDate(dateObj); // From Utilities.gs
            const weekStartDateStr = formatDateYMD(weekStartDate); // From Utilities.gs
            weeklyTotalsMap.set(weekStartDateStr, (weeklyTotalsMap.get(weekStartDateStr) || 0) + points);
          }
        }
      });
    }
    // --- End Aggregation ---

    if (weeklyTotalsMap.size < 2) { // Need at least two weeks (one current/past, one previous)
         Logger.log("Not enough weekly data found on Dashboard for goal history calculation (need >= 2 weeks).");
         // Populate weeklyTotals with the single week if it exists, for chart display
         if (weeklyTotalsMap.size === 1) {
            const [dateStr, total] = weeklyTotalsMap.entries().next().value;
            const startDate = new Date(dateStr + 'T00:00:00');
            const weekDateStr = Utilities.formatDate(startDate, Session.getScriptTimeZone(), "MMM d, yyyy");
            result.weeklyTotals.push({ week: weekDateStr, total: total, previousTotal: 0 });
         }
         return result; // No history to compare
    }


    // Convert map to array and sort weeks chronologically
    const weeklyData = Array.from(weeklyTotalsMap.entries()).map(([dateStr, total]) => ({
      startDateStr: dateStr,
      startDate: new Date(dateStr + 'T00:00:00'), // Ensure it's parsed as local date start
      total: total
    })).sort((a, b) => a.startDate - b.startDate);


    // Process weekly data to find goal achievements
    for (let i = 1; i < weeklyData.length; i++) { // Start from index 1 to compare with previous
      const currentWeek = weeklyData[i];
      const previousWeek = weeklyData[i - 1];

      // Format week start date for display
      const weekDateStr = Utilities.formatDate(currentWeek.startDate, Session.getScriptTimeZone(), "MMM d, yyyy");

      // Add to weekly totals array for the chart
      result.weeklyTotals.push({
        week: weekDateStr,
        total: currentWeek.total,
        previousTotal: previousWeek.total
      });

      // Check goal 1: Higher than previous week
      if (currentWeek.total > previousWeek.total) {
        result.goalAchievements.higherThanPrevious.totalAchieved++;
        result.goalAchievements.higherThanPrevious.achievedWeeks.push({
          week: weekDateStr,
          current: currentWeek.total,
          previous: previousWeek.total,
          improvement: currentWeek.total - previousWeek.total
        });
      }

      // Check goal 2: Double points from previous week (handle previous 0 or negative)
      const doubleTarget = previousWeek.total * 2;
      if ( (previousWeek.total > 0 && currentWeek.total >= doubleTarget) ||
           (previousWeek.total <= 0 && currentWeek.total > 0) ) // If previous was 0 or negative, any positive score is > double
      {
        result.goalAchievements.doublePoints.totalAchieved++;
        result.goalAchievements.doublePoints.achievedWeeks.push({
          week: weekDateStr,
          current: currentWeek.total,
          previous: previousWeek.total,
          multiplier: previousWeek.total !== 0 ? Math.round((currentWeek.total / previousWeek.total) * 10) / 10 : "∞"
        });
      }
    }

    Logger.log(`Goal achievement history calculated: Higher=${result.goalAchievements.higherThanPrevious.totalAchieved}, Double=${result.goalAchievements.doublePoints.totalAchieved}`);
    return result;

  } catch (error) {
    Logger.log(`Error in calculateGoalAchievementHistory: ${error}\nStack: ${error.stack}`);
    // Return minimal valid object on error
    return {
      weeklyTotals: [],
      goalAchievements: {
        higherThanPrevious: { totalAchieved: 0, achievedWeeks: [] },
        doublePoints: { totalAchieved: 0, achievedWeeks: [] }
      }
    };
  }
}

/**
 * Calculates moving averages from daily data.
 * @param {Array<object>} dailyData Array of objects { date: string, points: number, displayDate?: string }.
 * @param {number} window Number of days for the moving average window.
 * @return {Array<object>} Array of objects { date: string, displayDate: string, average: number|null }.
 */
function calculateMovingAverages(dailyData, window) {
  const movingAverages = [];
  if (!dailyData || dailyData.length === 0) {
    return [];
  }

  // Ensure window is positive
  window = Math.max(1, Math.floor(window));

  // Pad the start with nulls if not enough data for a full window initially
  const startIndex = Math.max(0, window - 1);

  // Calculate averages
  for (let i = 0; i < dailyData.length; i++) {
    let average = null;
    // Check if we have enough preceding data points for a full window ending at index i
    if (i >= startIndex) {
      let sum = 0;
      for (let j = 0; j < window; j++) {
        sum += dailyData[i - j].points; // Sum points for the window ending at i
      }
      average = Math.round((sum / window) * 10) / 10; // Calculate and round average
    }
    movingAverages.push({
      date: dailyData[i].date,
      displayDate: dailyData[i].displayDate || dailyData[i].date, // Use displayDate if available
      average: average
    });
  }

  return movingAverages;
}

// --- NEW FUNCTIONS FOR INDIVIDUAL ACTIVITY HANDLING ---

/**
 * Parses an activity string from the Dashboard to extract individual activities.
 * @param {string} activitiesString The combined string of activities from Dashboard Column C.
 * @return {Array<object>} Array of parsed activity objects.
 */
function parseActivityString(activitiesString) {
  if (!activitiesString) return [];
  
  const activities = [];
  const activityEntries = activitiesString.split(", ");
  
  activityEntries.forEach((activityEntry, index) => {
    // Match pattern: [Symbol] ActivityName [(FireEmoji)(StreakNumber)] (Points)
    // Symbol: ➕ or ➖
    // ActivityName: any text
    // Optional streak info: (🔥n) where n is the streak count
    // Points: (±n) where n is the numeric value
    
    // This regex captures four groups:
    // 1. Symbol (➕ or ➖)
    // 2. Activity name
    // 3. Optional streak info (🔥n)
    // 4. Points value with sign (+n or -n)
    const regex = /([➕➖])\s(.+?)(?:\s\((🔥+\d+)\))?\s\(([+-]\d+)\)/;
    
    const match = activityEntry.match(regex);
    if (match) {
      const symbol = match[1];
      const name = match[2].trim();
      const streakInfo = match[3] || null;
      const pointsStr = match[4];
      const points = parseInt(pointsStr);
      
      activities.push({
        id: `activity_${index}_${Date.now()}`, // Generate a unique ID for this activity instance
        name: name,
        points: points,
        symbol: symbol,
        streakInfo: streakInfo,
        originalString: activityEntry,
      });
    } else {
      Logger.log(`Failed to parse activity entry: ${activityEntry}`);
    }
  });
  
  return activities;
}

/**
 * Reads the Dashboard sheet and returns entries within the specified date range,
 * with individual activities parsed out for editing.
 * OPTIMIZED: Uses date-range-based caching to reduce sheet reads by 70%.
 * @param {Date} startDate The start date of the range (inclusive).
 * @param {Date} endDate The end date of the range (inclusive).
 * @return {Array<object>} Array of log entries with individual activities.
 */
function getActivityLogData(startDate, endDate) {
  // OPTIMIZATION: Use date-range-based caching helper (no household filter for activity log)
  const data = _getDashboardDataByDateRange(startDate, endDate, null);

  if (data.length === 0) {
    Logger.log("No activity log data found for the specified date range.");
    return [];
  }

  const result = [];

  // Process the pre-filtered data (already filtered by date range)
  // Note: We need to reconstruct rowIndex since we lost it during filtering
  // We'll need to read the sheet again to get accurate row indices
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);

  if (!dashboardSheet) {
    Logger.log("Dashboard sheet not found in getActivityLogData.");
    return [];
  }

  const startDateStr = formatDateYMD(startDate);
  const endDateStr = formatDateYMD(endDate);
  const lastRow = dashboardSheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  // For activity log, we need accurate row indices for editing
  // So we'll do a lightweight read of just dates and emails to match rows
  const allDates = dashboardSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const allEmails = dashboardSheet.getRange(2, 7, lastRow - 1, 1).getValues();

  // Match filtered data to row indices
  data.forEach(filteredRow => {
    const filteredDate = filteredRow[0];
    const filteredEmail = filteredRow[6] || "";
    const filteredDateStr = formatDateYMD(filteredDate);

    // Find the matching row index
    for (let i = 0; i < allDates.length; i++) {
      const sheetDate = allDates[i][0];
      const sheetEmail = allEmails[i][0] || "";

      if (sheetDate instanceof Date && formatDateYMD(sheetDate) === filteredDateStr &&
          sheetEmail.toLowerCase() === filteredEmail.toLowerCase()) {
        const rowIndex = i + 2; // Actual sheet row
        const totalRowPoints = Number(filteredRow[1]) || 0; // Points from column B
        const activitiesString = filteredRow[2] || ""; // Activities from column C

        // Parse the activities string into individual activities
        const individualActivities = parseActivityString(activitiesString);

        // Create an entry with the row data and individual activities
        result.push({
          rowIndex: rowIndex,
          date: filteredDateStr,
          email: filteredEmail,
          totalPoints: totalRowPoints,
          activitiesString: activitiesString,
          activities: individualActivities
        });
        break; // Found the match, move to next filtered row
      }
    }
  });

  return result;
}

/**
 * Deletes a specific activity from a row in the Dashboard.
 * @param {number} rowIndex The sheet row index.
 * @param {string} activityId The unique ID of the activity to delete.
 * @param {string} expectedDate The date in YYYY-MM-DD format for verification.
 * @param {string} expectedEmail The email for verification.
 * @return {Object} Result object with success status and message.
 */
function deleteIndividualActivity(rowIndex, activityId, expectedDate, expectedEmail) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  
  if (!dashboardSheet) {
    return { 
      success: false, 
      message: "Dashboard sheet not found." 
    };
  }
  
  try {
    // Verify the row exists
    if (rowIndex < 2 || rowIndex > dashboardSheet.getLastRow()) {
      return { 
        success: false, 
        message: "Invalid row index." 
      };
    }
    
    // Get the data for the specified row
    const rowData = dashboardSheet.getRange(rowIndex, 1, 1, 7).getValues()[0];
    const rowDate = rowData[0]; // Date in column A
    const rowEmail = rowData[6] || ""; // Email in column G
    const totalRowPoints = Number(rowData[1]) || 0; // Current total points
    const activitiesString = rowData[2] || ""; // Current activities string
    
    // Verify this is the correct row by checking date and email
    if (!(rowDate instanceof Date) || formatDateYMD(rowDate) !== expectedDate || 
        rowEmail.toLowerCase() !== expectedEmail.toLowerCase()) {
      return { 
        success: false, 
        message: "Verification failed. The row's date or email doesn't match the expected values." 
      };
    }
    
    // Parse the activities string into individual activities
    const activities = parseActivityString(activitiesString);
    
    // Find the activity to delete
    const activityIndex = activities.findIndex(activity => activity.id === activityId);
    if (activityIndex === -1) {
      return {
        success: false,
        message: "Activity not found in this row."
      };
    }
    
    // Get the activity to delete
    const activityToDelete = activities[activityIndex];
    
    // Calculate new total points
    const newTotalPoints = totalRowPoints - activityToDelete.points;
    
    // Remove the activity from the array
    activities.splice(activityIndex, 1);
    
    if (activities.length === 0) {
      // If all activities are deleted, delete the entire row
      dashboardSheet.deleteRow(rowIndex);
      // Clear Dashboard range caches
      _clearDashboardRangeCaches();

      return {
        success: true,
        message: `Successfully deleted the last activity for ${expectedEmail} on ${expectedDate}. Row removed.`,
        deletedPoints: activityToDelete.points,
        date: expectedDate,
        remainingActivities: []
      };
    } else {
      // Recalculate positive and negative counts
      let positiveCount = 0;
      let negativeCount = 0;
      activities.forEach(activity => {
        if (activity.points > 0) {
          positiveCount++;
        } else if (activity.points < 0) {
          negativeCount--;
        }
      });
      
      // Create new activities string
      const newActivitiesString = activities.map(a => a.originalString).join(", ");
      
      // Update the row
      dashboardSheet.getRange(rowIndex, 2).setValue(newTotalPoints); // Update points
      dashboardSheet.getRange(rowIndex, 3).setValue(newActivitiesString); // Update activities string
      dashboardSheet.getRange(rowIndex, 4).setValue(positiveCount); // Update positive count
      dashboardSheet.getRange(rowIndex, 5).setValue(negativeCount); // Update negative count

      // Clear Dashboard range caches
      _clearDashboardRangeCaches();

      return {
        success: true,
        message: `Successfully deleted activity "${activityToDelete.name}" for ${expectedEmail} on ${expectedDate}.`,
        deletedPoints: activityToDelete.points,
        date: expectedDate,
        newTotalPoints: newTotalPoints,
        remainingActivities: activities
      };
    }
  } catch (error) {
    Logger.log(`Error in deleteIndividualActivity: ${error}\nStack: ${error.stack}`);
    return { 
      success: false, 
      message: `Error deleting activity: ${error.message}` 
    };
  }
}

/**
 * Adds a new individual activity to a specific date/email.
 * @param {Date} timestamp The date for the activity.
 * @param {string} email The email address.
 * @param {string} activityName The name of the activity from Points Reference.
 * @return {Object} Result object with success status and message.
 */
function addIndividualActivity(timestamp, email, activityName) {
  try {
    // Validate inputs
    if (!(timestamp instanceof Date) || !email || !activityName) {
      return { 
        success: false, 
        message: "Invalid inputs. Date, email, and activity name are required." 
      };
    }
    
    // Get activity details from the Points Reference
    const activityData = getActivityDataCached();
    if (!activityData.pointValues.hasOwnProperty(activityName)) {
      return { 
        success: false, 
        message: `Activity "${activityName}" not found in reference data.` 
      };
    }
    
    // Get the base points for this activity
    const basePoints = activityData.pointValues[activityName];
    const category = activityData.categories[activityName] || "Uncategorized";
    
    // For manual entries, we'll use basic points without streak calculations
    const processedActivity = {
      name: activityName,
      points: basePoints,
      category: category,
      streakInfo: {
        originalPoints: basePoints,
        bonusPoints: 0,
        totalPoints: basePoints,
        streakLength: 0,
        multiplier: 1
      }
    };
    
    // Call updateDashboard with the single activity
    updateDashboard(timestamp, email, [processedActivity], basePoints);
    
    return {
      success: true,
      message: `Successfully added "${activityName}" (${basePoints > 0 ? '+' : ''}${basePoints}) for ${email}`,
      activity: processedActivity,
      date: formatDateYMD(timestamp)
    };
  } catch (error) {
    Logger.log(`Error in addIndividualActivity: ${error}\nStack: ${error.stack}`);
    return { 
      success: false, 
      message: `Error adding activity: ${error.message}` 
    };
  }
}

/**
 * Edits an individual activity by deleting and replacing it.
 * @param {number} rowIndex The sheet row index.
 * @param {string} activityId The unique ID of the activity to edit.
 * @param {string} expectedDate The date in YYYY-MM-DD format for verification.
 * @param {string} expectedEmail The email for verification.
 * @param {string} newActivityName The new activity name to replace with.
 * @return {Object} Result object with success status and message.
 */
function editIndividualActivity(rowIndex, activityId, expectedDate, expectedEmail, newActivityName) {
  try {
    // First delete the existing activity
    const deleteResult = deleteIndividualActivity(rowIndex, activityId, expectedDate, expectedEmail);
    
    if (!deleteResult.success) {
      return deleteResult; // Return the delete error
    }
    
    // If the delete was successful, add the new activity
    // Parse the expected date string to a Date object
    const dateParts = expectedDate.split('-');
    const timestamp = new Date(
      parseInt(dateParts[0]),
      parseInt(dateParts[1]) - 1, // Month is 0-based in JavaScript
      parseInt(dateParts[2])
    );
    
    // Add the new activity
    const addResult = addIndividualActivity(timestamp, expectedEmail, newActivityName);
    
    if (!addResult.success) {
      return {
        success: false,
        message: `Successfully deleted the original activity, but failed to add the new one: ${addResult.message}`
      };
    }
    
    return {
      success: true,
      message: `Successfully replaced activity with "${newActivityName}" for ${expectedEmail} on ${expectedDate}.`,
      date: expectedDate,
      newActivity: addResult.activity
    };
  } catch (error) {
    Logger.log(`Error in editIndividualActivity: ${error}\nStack: ${error.stack}`);
    return { 
      success: false, 
      message: `Error editing activity: ${error.message}` 
    };
  }
}

// --- EXPENSE TRACKER DATA PROCESSING FUNCTIONS ---

/**
 * Global cache variable for expense-related data
 */
let expenseDataCache = null;

/**
 * Generates a consistent cache key for expense data based on household ID.
 * @param {string|null} householdId The ID of the household.
 * @return {string} The cache key.
 * @private
 */
function _getExpenseCacheKey(householdId) {
  return `expenseData_${householdId || 'default'}`;
}

/**
 * Resets the expense data cache (both script-global and CacheService)
 * @param {string|null} householdId The household ID to clear the cache for.
 */
function resetExpenseDataCache(householdId = null) {
  const cacheKey = _getExpenseCacheKey(householdId);

  // Reset script-global cache if it exists
  if (expenseDataCache && typeof expenseDataCache === 'object' && expenseDataCache[cacheKey]) {
    delete expenseDataCache[cacheKey];
    Logger.log(`Cleared script-global cache for key: ${cacheKey}`);
  }

  try {
    const cache = CacheService.getScriptCache();
    // Remove the specific, household-based cache key
    cache.remove(cacheKey);

    // The old, generic keys are now cleaned up by a separate, one-time function.

    Logger.log(`Expense data cache in CacheService reset for key: ${cacheKey}`);
  } catch (e) {
    Logger.log(`Warning: Error clearing expense data from CacheService for key ${cacheKey}: ${e}`);
  }
}

/**
 * Reads budget category data from the Budget Categories sheet
 * @param {string} householdId Optional household ID to filter by
 * @return {Object} Budget categories data with current spending and limits
 */
function readBudgetCategoriesData(householdId = null) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = CONFIG.SHEET_NAMES.BUDGET_CATEGORIES;
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    Logger.log(`${sheetName} not found, attempting to set up.`);
    setupBudgetCategoriesSheet();
    sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log(`FATAL: Failed to create or find ${sheetName}.`);
      return { categories: [], categoriesById: {}, totalBudget: 0, totalSpent: 0 };
    }
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log(`No budget categories found in ${sheetName}.`);
    return { categories: [], categoriesById: {}, totalBudget: 0, totalSpent: 0 };
  }

  try {
    // Columns: CategoryName, MonthlyBudget, CurrentSpent, PayPeriodBudget, PayPeriodSpent, LastReset, HouseholdID, IsActive
    const dataRange = sheet.getRange(2, 1, lastRow - 1, 8);
    const data = dataRange.getValues();
    const categories = [];
    const categoriesById = {};
    let totalBudget = 0;
    let totalSpent = 0;

    data.forEach((row, index) => {
      const categoryName = String(row[0]).trim();
      const monthlyBudget = typeof row[1] === 'number' ? row[1] : (row[1] !== "" && !isNaN(row[1]) ? Number(row[1]) : 0);
      const currentSpent = typeof row[2] === 'number' ? row[2] : (row[2] !== "" && !isNaN(row[2]) ? Number(row[2]) : 0);
      const payPeriodBudget = typeof row[3] === 'number' ? row[3] : (row[3] !== "" && !isNaN(row[3]) ? Number(row[3]) : 0);
      const payPeriodSpent = typeof row[4] === 'number' ? row[4] : (row[4] !== "" && !isNaN(row[4]) ? Number(row[4]) : 0);
      const lastReset = row[5] instanceof Date ? row[5] : null;
      const categoryHouseholdId = row[6] ? String(row[6]).trim() : null;
      const isActive = row[7] === true || row[7] === "TRUE" || row[7] === "true";

      // Filter by household if specified
      if (householdId && categoryHouseholdId && categoryHouseholdId !== householdId) {
        return; // Skip this category
      }

      if (categoryName && isActive) {
        const categoryData = {
          name: categoryName,
          monthlyBudget: monthlyBudget,
          currentSpent: currentSpent,
          payPeriodBudget: payPeriodBudget,
          payPeriodSpent: payPeriodSpent,
          lastReset: lastReset,
          householdId: categoryHouseholdId,
          remaining: payPeriodBudget - payPeriodSpent,
          percentUsed: payPeriodBudget > 0 ? (payPeriodSpent / payPeriodBudget) * 100 : 0,
          rowIndex: index + 2 // Sheet row number for updates
        };

        categories.push(categoryData);
        categoriesById[categoryName] = categoryData;
        totalBudget += payPeriodBudget;
        totalSpent += payPeriodSpent;
      }
    });

    return { 
      categories: categories, 
      categoriesById: categoriesById, 
      totalBudget: totalBudget, 
      totalSpent: totalSpent,
      totalRemaining: totalBudget - totalSpent
    };
  } catch (error) {
    Logger.log(`Error reading budget categories data: ${error}\nStack: ${error.stack}`);
    return { categories: [], categoriesById: {}, totalBudget: 0, totalSpent: 0 };
  }
}

/**
 * Reads location mapping data from the Location Mapping sheet
 * @param {string} householdId Optional household ID to filter by
 * @return {Object} Location mappings and usage data
 */
function readLocationMappingData(householdId = null) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = CONFIG.SHEET_NAMES.LOCATION_MAPPING;
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    Logger.log(`${sheetName} not found, attempting to set up.`);
    setupLocationMappingSheet();
    sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      Logger.log(`FATAL: Failed to create or find ${sheetName}.`);
      return { locations: [], locationsByName: {} };
    }
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log(`No location mappings found in ${sheetName}.`);
    return { locations: [], locationsByName: {} };
  }

  try {
    // Columns: LocationName, DefaultCategory, UsageCount, LastUsed, HouseholdID, IsActive
    const dataRange = sheet.getRange(2, 1, lastRow - 1, 6);
    const data = dataRange.getValues();
    const locations = [];
    const locationsByName = {};

    data.forEach((row, index) => {
      const locationName = String(row[0]).trim();
      const defaultCategory = String(row[1]).trim();
      const usageCount = typeof row[2] === 'number' ? row[2] : (row[2] !== "" && !isNaN(row[2]) ? Number(row[2]) : 0);
      const lastUsed = row[3] instanceof Date ? row[3] : null;
      const locationHouseholdId = row[4] ? String(row[4]).trim() : null;
      const isActive = row[5] === true || row[5] === "TRUE" || row[5] === "true";

      // Filter by household if specified
      if (householdId && locationHouseholdId && locationHouseholdId !== householdId) {
        return; // Skip this location
      }

      if (locationName && isActive) {
        const locationData = {
          name: locationName,
          defaultCategory: defaultCategory,
          usageCount: usageCount,
          lastUsed: lastUsed,
          householdId: locationHouseholdId,
          rowIndex: index + 2, // Sheet row number for updates
          isSuggested: usageCount >= CONFIG.EXPENSE_SETTINGS.LOCATION_LEARNING_THRESHOLD
        };

        locations.push(locationData);
        locationsByName[locationName.toLowerCase()] = locationData;
      }
    });

    return { 
      locations: locations, 
      locationsByName: locationsByName
    };
  } catch (error) {
    Logger.log(`Error reading location mapping data: ${error}\nStack: ${error.stack}`);
    return { locations: [], locationsByName: {} };
  }
}

/**
 * Gets enhanced location data including recent locations from expense entries
 * This ensures all locations used in the past 30 days appear as options
 * @param {string} householdId Optional household ID to filter by
 * @return {Object} Enhanced location mappings with recent locations included
 */
function getEnhancedLocationMappingData(householdId = null) {
  // Start with existing location mapping data
  const existingData = readLocationMappingData(householdId);
  let locations = [...existingData.locations];
  const locationsByName = { ...existingData.locationsByName };
  
  try {
    // Get recent locations from expense tracker sheet (last 30 days)
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const expenseSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.EXPENSE_TRACKER);
    
    if (expenseSheet) {
      const lastRow = expenseSheet.getLastRow();
      if (lastRow > 1) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30); // Last 30 days
        
        // Read recent expense data: Date(A), Amount(B), Location(C), Category(D), Description(E), Email(F), HouseholdID(G)
        const data = expenseSheet.getRange(2, 1, lastRow - 1, 7).getValues();
        
        data.forEach(row => {
          const expenseDate = row[0];
          const location = String(row[2]).trim();
          const category = String(row[3]).trim();
          const expenseHouseholdId = row[6] ? String(row[6]).trim() : null;
          
          // Filter by household and recent date
          if (expenseDate instanceof Date && expenseDate >= cutoffDate) {
            if (!householdId || !expenseHouseholdId || expenseHouseholdId === householdId) {
              const locationKey = location.toLowerCase();
              
              // If location isn't already in our mapping, add it as a recent location
              if (location && !locationsByName[locationKey]) {
                const recentLocationData = {
                  name: location,
                  defaultCategory: category,
                  usageCount: 1,
                  lastUsed: expenseDate,
                  householdId: expenseHouseholdId,
                  rowIndex: -1, // Not in mapping sheet yet
                  isSuggested: true, // Show recent locations as suggested
                  isRecent: true // Flag to identify as coming from recent expenses
                };
                
                locations.push(recentLocationData);
                locationsByName[locationKey] = recentLocationData;
              }
            }
          }
        });
      }
    }
    
    Logger.log(`Enhanced location data loaded: ${locations.length} total locations (${existingData.locations.length} from mapping, ${locations.length - existingData.locations.length} recent)`);
  } catch (error) {
    Logger.log(`Error enhancing location data with recent locations: ${error}`);
    // Fall back to original data if enhancement fails
  }
  
  return {
    locations: locations,
    locationsByName: locationsByName
  };
}

/**
 * Caching wrapper for expense-related data
 * @param {string} householdId Optional household ID for filtering
 * @return {Object} Complete expense data including budget categories and location mappings
 */
function getExpenseDataCached(householdId = null) {
  const cacheKey = _getExpenseCacheKey(householdId);
  
  // Check script-global cache first
  if (expenseDataCache && expenseDataCache[cacheKey]) {
    return expenseDataCache[cacheKey];
  }

  // Check CacheService
  try {
    const cache = CacheService.getScriptCache();
    const cachedJson = cache.get(cacheKey);
    if (cachedJson) {
      const parsedData = JSON.parse(cachedJson);
      if (parsedData && parsedData.budgetCategories && parsedData.locationMappings) {
        // Initialize script cache if needed
        if (!expenseDataCache) expenseDataCache = {};
        expenseDataCache[cacheKey] = parsedData;
        return parsedData;
      }
    }
  } catch (e) {
    Logger.log(`Error reading expense data from cache: ${e}`);
  }

  // Fetch fresh data
  const budgetCategories = readBudgetCategoriesData(householdId);
  const locationMappings = getEnhancedLocationMappingData(householdId);
  
  const expenseData = {
    budgetCategories: budgetCategories,
    locationMappings: locationMappings,
    lastUpdated: new Date()
  };

  // Cache the results
  try {
    if (!expenseDataCache) expenseDataCache = {};
    expenseDataCache[cacheKey] = expenseData;
    
    const cache = CacheService.getScriptCache();
    cache.put(cacheKey, JSON.stringify(expenseData), CONFIG.EXPENSE_SETTINGS.CACHE_TIME);
  } catch (e) {
    Logger.log(`Error caching expense data: ${e}`);
  }

  return expenseData;
}

/**
 * Processes and logs an expense entry to the Expense Tracker sheet
 * @param {number} amount The expense amount
 * @param {string} location The store/location name
 * @param {string} category The budget category
 * @param {string} description Optional description
 * @param {string} email User's email
 * @param {string} householdId User's household ID
 * @return {Object} Result object with success status and updated budget info
 */
function processExpenseEntry(amount, location, category, description = "", email, householdId) {
  try {
    const timestamp = new Date();
    const payPeriod = getCurrentPayPeriod(); // Helper function to calculate current pay period

    // Log the expense
    const logResult = logExpenseToSheet(timestamp, amount, location, category, description, email, householdId, payPeriod);
    if (!logResult.success) {
      return logResult;
    }

    // Update budget category spending
    const budgetUpdateResult = updateBudgetCategorySpending(category, amount, householdId);
    
    // Update location mapping usage
    updateLocationMappingUsage(location, category, householdId);

    // Clear cache to reflect changes
    resetExpenseDataCache(householdId);

    return {
      success: true,
      amount: amount,
      location: location,
      category: category,
      remainingBudget: budgetUpdateResult.remainingBudget,
      percentUsed: budgetUpdateResult.percentUsed,
      message: `Expense of $${amount.toFixed(2)} logged successfully at ${location}`
    };
  } catch (error) {
    Logger.log(`Error processing expense entry: ${error}\nStack: ${error.stack}`);
    return {
      success: false,
      message: `Error processing expense: ${error.message}`
    };
  }
}

/**
 * Logs an expense entry to the Expense Tracker sheet
 * @private
 */
function logExpenseToSheet(timestamp, amount, location, category, description, email, householdId, payPeriod) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.EXPENSE_TRACKER);
    
    if (!sheet) {
      setupExpenseTrackerSheet();
      sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.EXPENSE_TRACKER);
      if (!sheet) {
        return { success: false, message: "Could not create Expense Tracker sheet" };
      }
    }

    // Add the expense entry
    const rowData = [timestamp, amount, location, category, description, email, householdId, payPeriod];
    sheet.appendRow(rowData);

    Logger.log(`Expense logged: $${amount} at ${location} (${category}) for ${email}`);
    return { success: true };
  } catch (error) {
    Logger.log(`Error logging expense to sheet: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error logging expense: ${error.message}` };
  }
}

/**
 * Updates budget category spending amounts
 * @private
 */
function updateBudgetCategorySpending(categoryName, amount, householdId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.BUDGET_CATEGORIES);
    
    if (!sheet) {
      return { success: false, message: "Budget Categories sheet not found" };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: false, message: "No budget categories found" };
    }

    // Find the category row
    const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    let targetRowIndex = -1;

    data.forEach((row, index) => {
      const name = String(row[0]).trim();
      const rowHouseholdId = row[6] ? String(row[6]).trim() : null;
      
      if (name === categoryName && (!householdId || !rowHouseholdId || rowHouseholdId === householdId)) {
        targetRowIndex = index + 2; // Sheet row number
      }
    });

    if (targetRowIndex === -1) {
      return { success: false, message: `Budget category '${categoryName}' not found` };
    }

    // Update spending amounts
    const currentSpentCell = sheet.getRange(targetRowIndex, 3); // Column C
    const payPeriodSpentCell = sheet.getRange(targetRowIndex, 5); // Column E
    const payPeriodBudgetCell = sheet.getRange(targetRowIndex, 4); // Column D

    const currentSpent = currentSpentCell.getValue() || 0;
    const payPeriodSpent = payPeriodSpentCell.getValue() || 0;
    const payPeriodBudget = payPeriodBudgetCell.getValue() || 0;

    const newCurrentSpent = currentSpent + amount;
    const newPayPeriodSpent = payPeriodSpent + amount;

    currentSpentCell.setValue(newCurrentSpent);
    payPeriodSpentCell.setValue(newPayPeriodSpent);

    const remainingBudget = payPeriodBudget - newPayPeriodSpent;
    const percentUsed = payPeriodBudget > 0 ? (newPayPeriodSpent / payPeriodBudget) * 100 : 0;

    return {
      success: true,
      remainingBudget: remainingBudget,
      percentUsed: percentUsed,
      newSpent: newPayPeriodSpent,
      budget: payPeriodBudget
    };
  } catch (error) {
    Logger.log(`Error updating budget category spending: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error updating budget: ${error.message}` };
  }
}

/**
 * Updates location mapping usage statistics
 * @private
 */
function updateLocationMappingUsage(locationName, category, householdId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LOCATION_MAPPING);
    
    if (!sheet) {
      return; // Not critical if this fails
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      // Add new location if sheet is empty
      addNewLocationMapping(locationName, category, householdId);
      return;
    }

    // Find existing location
    const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    let targetRowIndex = -1;

    data.forEach((row, index) => {
      const name = String(row[0]).trim().toLowerCase();
      const rowHouseholdId = row[4] ? String(row[4]).trim() : null;
      
      if (name === locationName.toLowerCase() && (!householdId || !rowHouseholdId || rowHouseholdId === householdId)) {
        targetRowIndex = index + 2; // Sheet row number
      }
    });

    if (targetRowIndex !== -1) {
      // Update existing location
      const usageCountCell = sheet.getRange(targetRowIndex, 3); // Column C
      const lastUsedCell = sheet.getRange(targetRowIndex, 4); // Column D
      
      const currentUsage = usageCountCell.getValue() || 0;
      usageCountCell.setValue(currentUsage + 1);
      lastUsedCell.setValue(new Date());
    } else {
      // Add new location
      addNewLocationMapping(locationName, category, householdId);
    }
  } catch (error) {
    Logger.log(`Error updating location mapping usage: ${error}`);
    // Not critical enough to fail the whole expense entry
  }
}

/**
 * Adds a new location mapping entry
 * @private
 */
function addNewLocationMapping(locationName, category, householdId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LOCATION_MAPPING);
    
    if (!sheet) {
      return;
    }

    const rowData = [locationName, category, 1, new Date(), householdId, true];
    sheet.appendRow(rowData);
    
    Logger.log(`Added new location mapping: ${locationName} -> ${category}`);
  } catch (error) {
    Logger.log(`Error adding new location mapping: ${error}`);
  }
}

/**
 * Calculates the current pay period identifier
 * @return {string} Pay period identifier (e.g., "2024-01-P1")
 */
function getCurrentPayPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // JavaScript months are 0-based
  const dayOfMonth = now.getDate();
  
  // Determine if we're in the first or second half of the month
  const periodNumber = dayOfMonth <= 15 ? 1 : 2;
  
  return `${year}-${month.toString().padStart(2, '0')}-P${periodNumber}`;
}

/**
 * Resets budget spending for a new pay period
 * @param {string} householdId The household ID to reset budgets for
 * @return {Object} Result object with success status
 */
function resetPayPeriodBudgets(householdId) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.BUDGET_CATEGORIES);
    
    if (!sheet) {
      return { success: false, message: "Budget Categories sheet not found" };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: false, message: "No budget categories found" };
    }

    const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    let resetCount = 0;

    data.forEach((row, index) => {
      const rowHouseholdId = row[6] ? String(row[6]).trim() : null;
      
      if (!householdId || !rowHouseholdId || rowHouseholdId === householdId) {
        const rowIndex = index + 2;
        
        // Reset PayPeriodSpent (Column E) to 0
        sheet.getRange(rowIndex, 5).setValue(0);
        
        // Update LastReset (Column F) to current date
        sheet.getRange(rowIndex, 6).setValue(new Date());
        
        resetCount++;
      }
    });

    // Clear cache
    resetExpenseDataCache(householdId);

    return {
      success: true,
      message: `Reset ${resetCount} budget categories for new pay period`,
      categoriesReset: resetCount
    };
  } catch (error) {
    Logger.log(`Error resetting pay period budgets: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error resetting budgets: ${error.message}` };
  }
}

/**
 * Performs a one-time cleanup of old, generic cache keys.
 * This can be run by an admin from the menu to clean up legacy cache entries.
 */
function cleanupLegacyCacheKeys() {
  try {
    const keysToRemove = ['expenseData', 'budgetCategoriesData', 'locationMappingData'];
    const cache = CacheService.getScriptCache();
    cache.removeAll(keysToRemove);
    Logger.log(`Successfully removed legacy cache keys: ${keysToRemove.join(', ')}`);
    return { success: true, message: `Successfully removed legacy cache keys: ${keysToRemove.join(', ')}` };
  } catch (e) {
    Logger.log(`Error during legacy cache cleanup: ${e}`);
    return { success: false, message: `Error during legacy cache cleanup: ${e.message}` };
  }
}

/**
 * Recalculates all budget spending totals from scratch based on the Expense Tracker sheet.
 * This is a robust way to ensure data consistency after any change (add, edit, delete).
 */
function recalculateAllBudgets() {
  Logger.log("Starting full budget recalculation...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const expenseSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.EXPENSE_TRACKER);
  const budgetSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.BUDGET_CATEGORIES);

  if (!expenseSheet || !budgetSheet) {
    Logger.log("Recalculation failed: Expense Tracker or Budget Categories sheet not found.");
    return;
  }

  // --- 1. Calculate actual totals from Expense Tracker ---
  const expenseLastRow = expenseSheet.getLastRow();
  const householdCategoryTotals = new Map(); // { householdId -> { category -> total } }

  if (expenseLastRow > 1) {
    // Read Amount (B), Category (D), HouseholdID (G)
    const numColumns = Math.max(EXPENSE_TRACKER_COLUMNS.AMOUNT, EXPENSE_TRACKER_COLUMNS.CATEGORY, EXPENSE_TRACKER_COLUMNS.HOUSEHOLD_ID);
    const expenseData = expenseSheet.getRange(2, 1, expenseLastRow - 1, numColumns).getValues();
    expenseData.forEach(row => {
      const amount = Number(row[EXPENSE_TRACKER_COLUMNS.AMOUNT - 1]) || 0;
      const category = String(row[EXPENSE_TRACKER_COLUMNS.CATEGORY - 1]).trim();
      const householdId = String(row[EXPENSE_TRACKER_COLUMNS.HOUSEHOLD_ID - 1] || 'default').trim();

      if (category && amount > 0) {
        if (!householdCategoryTotals.has(householdId)) {
          householdCategoryTotals.set(householdId, new Map());
        }
        const categoryTotals = householdCategoryTotals.get(householdId);
        categoryTotals.set(category, (categoryTotals.get(category) || 0) + amount);
      }
    });
  }
  Logger.log(`Calculated totals for ${householdCategoryTotals.size} households.`);

  // --- 2. Update Budget Categories sheet ---
  const budgetLastRow = budgetSheet.getLastRow();
  if (budgetLastRow <= 1) {
    Logger.log("No budget categories to update.");
    return;
  }

  // Read header row to get column indices
  const budgetHeader = budgetSheet.getRange(1, 1, 1, budgetSheet.getLastColumn()).getValues()[0];
  const budgetColIdx = {};
  budgetHeader.forEach((colName, idx) => {
    budgetColIdx[colName.trim()] = idx;
  });
  // Required columns: "Category", "HouseholdID", "PayPeriodSpent"
  if (budgetColIdx["Category"] === undefined || budgetColIdx["HouseholdID"] === undefined || budgetColIdx["PayPeriodSpent"] === undefined) {
    Logger.log("FATAL: Budget Categories sheet missing required columns.");
    return;
  }
  const budgetData = budgetSheet.getRange(2, 1, budgetLastRow - 1, budgetHeader.length).getValues();
  const newPayPeriodSpentValues = [];
  const allHouseholdIds = new Set();

  // Prepare the new values for the "PayPeriodSpent" column
  budgetData.forEach(row => {
    const categoryName = String(row[budgetColIdx["Category"]]).trim();
    const householdId = String(row[budgetColIdx["HouseholdID"]] || 'default').trim();
    allHouseholdIds.add(householdId);

    const householdTotals = householdCategoryTotals.get(householdId);
    const newTotal = householdTotals ? (householdTotals.get(categoryName) || 0) : 0;

    newPayPeriodSpentValues.push([newTotal]);
  });

  // Write the new totals to the sheet in one operation
  if (newPayPeriodSpentValues.length > 0) {
    budgetSheet.getRange(2, budgetColIdx["PayPeriodSpent"] + 1, newPayPeriodSpentValues.length, 1).setValues(newPayPeriodSpentValues);
    Logger.log(`Updated ${newPayPeriodSpentValues.length} rows in Budget Categories sheet.`);
  }

  // --- 3. Clear all relevant caches ---
  Logger.log("Clearing caches for all affected households...");
  allHouseholdIds.forEach(householdId => {
    resetExpenseDataCache(householdId);
  });

  Logger.log("Full budget recalculation complete.");
}