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
      return { pointValues: {}, categories: {} };
    }
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log(`No activities found in ${sheetName}.`);
    return { pointValues: {}, categories: {} }; // Return empty if no data rows
  }

  try {
    // Ensure we read columns A, B, C (Activity, Points, Category)
    const dataRange = sheet.getRange(2, 1, lastRow - 1, 3);
    const data = dataRange.getValues();
    const pointValues = {};
    const categories = {};

    data.forEach((row, index) => {
      const activity = String(row[0]).trim();
      const pointsValue = row[1];
      // Better validation for numeric values
      const points = typeof pointsValue === 'number' ? pointsValue :
                    (pointsValue !== "" && !isNaN(pointsValue) ? Number(pointsValue) : NaN);
      const category = String(row[2]).trim();

      // Only add valid entries
      if (activity && !isNaN(points) && category) {
        // Check for duplicate activity names which might cause issues
        if (pointValues.hasOwnProperty(activity)) {
            Logger.log(`Warning: Duplicate activity name found in ${sheetName} at sheet row ${index + 2}: "${activity}". Using the first encountered value.`);
        } else {
            pointValues[activity] = points;
            categories[activity] = category;
        }
      } else {
        // Log if *any* data was present but row was invalid, but avoid logging completely blank rows silently inserted
        if (row[0] || row[1] || row[2]) {
          Logger.log(`Skipping invalid row in ${sheetName} at sheet row ${index + 2}: [${JSON.stringify(row)}]`);
        }
      }
    });

    return { pointValues, categories };
  } catch (error) {
    Logger.log(`Error reading activity data: ${error}\nStack: ${error.stack}`);
    // Return an empty structure rather than throw, to prevent cascading failures
    return { pointValues: {}, categories: {} };
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

  // Removed calls to updateWeeklyTotals and chart generation as they are handled client-side or in digests
}


/**
 * Calculates the current week's summary totals for a SPECIFIC HOUSEHOLD by reading the Dashboard sheet.
 * Used by the Web App's getWeekData function and EmailService.
 * @param {Array<string>} householdEmails - Array of email addresses for the household.
 * @return {object} Summary object { total, positive, negative, topActivity, topActivityCount, categories }
 */
function getHouseholdWeeklyTotals(householdEmails) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  const defaultSummary = {
    total: 0, positive: 0, negative: 0, topActivity: "None", topActivityCount: 0,
    // Initialize categories based on CONFIG for consistency
    categories: CONFIG.CATEGORIES.reduce((acc, category) => {
       acc[category] = 0; // Use category name directly as key for simplicity
       return acc;
    }, { "Total Positive": 0, "Total Negative": 0 }) // Add overall counts
  };

  if (!dashboardSheet) {
    Logger.log("Dashboard sheet not found in getHouseholdWeeklyTotals.");
    return defaultSummary;
  }
  if (!householdEmails || householdEmails.length === 0) {
    Logger.log("No household emails provided to getHouseholdWeeklyTotals.");
    return defaultSummary; // Cannot filter without emails
  }

  const today = new Date();
  const startOfWeek = getWeekStartDate(today);
  const endOfWeek = getWeekEndDate(today);
  const startDateStr = formatDateYMD(startOfWeek);
  const endDateStr = formatDateYMD(endOfWeek);

  let weeklyTotal = 0;
  let weeklyPositiveCount = 0;
  let weeklyNegativeCount = 0;
  const activityCounts = {}; // For finding top activity { activityName: count }
  const categoryCounts = { ...defaultSummary.categories }; // Clone default structure
  const activityData = getActivityDataCached(); // Needed for category lookup

  const lastRow = dashboardSheet.getLastRow();
  if (lastRow < 2) {
     Logger.log("No data rows found on Dashboard sheet for weekly totals.");
     return defaultSummary;
  }

  // Read Dashboard: Date(A), Points(B), Activities(C), PosCount(D), NegCount(E), Email(G)
  const data = dashboardSheet.getRange(2, 1, lastRow - 1, 7).getValues(); // A2:G<lastRow>

  data.forEach(row => {
    const date = row[0];
    const rowEmail = row[6] || ""; // Email in Col G

    // Check date range and household membership
    if (date instanceof Date && formatDateYMD(date) >= startDateStr && formatDateYMD(date) <= endDateStr &&
        householdEmails.some(email => email.toLowerCase() === rowEmail.toLowerCase()))
    {
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
 * @param {Date} startDate The start date of the range (inclusive).
 * @param {Date} endDate The end date of the range (inclusive).
 * @param {Array<string>} [householdEmails] Optional array of emails to filter results by household.
 * @return {Array<object>} An array of activity objects { name, points, date, email, category, streakInfo }.
 */
function getWeekActivities(startDate, endDate, householdEmails) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
    const allActivities = [];

    if (!dashboardSheet) {
        Logger.log(`ERROR: Dashboard sheet "${CONFIG.SHEET_NAMES.DASHBOARD}" not found in getWeekActivities.`);
        return [];
    }

    const lastRow = dashboardSheet.getLastRow();
    if (lastRow < 2) {
        Logger.log("No data in Dashboard sheet.");
        return [];
    }

    // Read Dashboard: Date(A), Points(B), Activities(C), PosCount(D), NegCount(E), Email(G)
    const data = dashboardSheet.getRange(2, 1, lastRow - 1, 7).getValues(); // A2:G<lastRow>
    const activityData = getActivityDataCached(); // Get points/categories map

    const startDateStr = formatDateYMD(startDate);
    const endDateStr = formatDateYMD(endDate);

    Logger.log(`Processing ${data.length} Dashboard rows for activities between ${startDateStr} and ${endDateStr}.${householdEmails ? ` Filtering for ${householdEmails.length} household members.` : ''}`);

    data.forEach((row, rowIndex) => {
        const timestamp = row[0]; // Date object from Col A
        const rowEmail = row[6] || "Unknown"; // Email from Col G

        // Check if timestamp is valid and within the desired range
        if (timestamp instanceof Date && timestamp.getTime() > 0) {
            const dateStr = formatDateYMD(timestamp);
            if (dateStr >= startDateStr && dateStr <= endDateStr) {
                // --- Household Filtering ---
                let includeRow = true;
                if (householdEmails && householdEmails.length > 0) {
                    // If filtering, only include rows where email matches
                    if (!rowEmail || rowEmail === "Unknown" || !householdEmails.some(he => he.toLowerCase() === rowEmail.toLowerCase())) {
                        includeRow = false;
                    }
                }
                // --- End Household Filtering ---

                if (includeRow) {
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
                } // End includeRow check
            } // End date range check
        } // End valid date check
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

// REMOVED redundant getHistoricalData function definition

// REMOVED obsolete getLifetimeActivityCounts function definition

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

// REMOVED obsolete getPreviousWeekActivityCounts function definition

/**
 * Gets enhanced previous week activity counts with household filtering.
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

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  if (!dashboardSheet) {
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

  const startDateStr = formatDateYMD(prevWeekStart);
  const endDateStr = formatDateYMD(prevWeekEnd);
  Logger.log(`Getting enhanced prev week counts for ${startDateStr} to ${endDateStr}`);

  const lastRow = dashboardSheet.getLastRow();
  if (lastRow <= 1) {
     activityCounts._hasData = false;
     return activityCounts;
  }

  // Read Date (A), Activities (C), and Email (G)
  // Corrected range to read up to column G (index 7)
  const data = dashboardSheet.getRange(2, 1, lastRow - 1, 7).getValues();

  let activityFound = false;
  data.forEach(row => {
    const dateObj = row[0];       // Col A (index 0)
    const activitiesStr = row[2] || ""; // Col C (index 2)
    const rowEmail = row[6] || "";    // Col G (index 6)

    // Filter by household and date range
    if (dateObj instanceof Date && dateObj.getTime() > 0 &&
        householdEmails.some(email => email.toLowerCase() === rowEmail.toLowerCase())) {

      const dateStr = formatDateYMD(dateObj);
      // Check if date falls within the previous week
      if (dateStr >= startDateStr && dateStr <= endDateStr) {
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
      }
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