// Bonuses.gs
/**
 * Bonuses and Streak Calculations for Budget Game v3 (Streamlined)
 * Handles streak point calculation.
 */

/**
 * Calculates the point multiplier and bonus points for an activity based on streak length.
 * Uses persistent thresholds and bonus points loaded by getCurrentStreakSettings().
 * Relies on UPPERCASE keys from the settings object returned by getCurrentStreakSettings.
 * @param {string} activityName The name of the activity.
 * @param {number} activityPoints The base points for the activity.
 * @return {object} { originalPoints, bonusPoints, totalPoints, streakLength, multiplier }
 */
function calculateStreakMultiplier(activityName, activityPoints) {
  // --- Load Current Streak Settings (returns object with both cases) ---
  const currentSettings = getCurrentStreakSettings(); // From Utilities.gs
  // --- End Load ---

  // Get the current activity streaks
  let streakLength = 0;
  try {
    let streakData;
    // Determine user context (household or individual)
    const email = Session.getActiveUser().getEmail(); // Use getActiveUser for script context
    const householdId = getUserHouseholdId(email); // From HouseholdManagement.gs

    if (CONFIG.HOUSEHOLD_SETTINGS.ENABLED && householdId && typeof trackActivityStreaksForHousehold === "function") {
        streakData = trackActivityStreaksForHousehold(householdId);
        Logger.log(`calculateStreakMultiplier: Using household streaks for ${householdId}`);
    } else if (typeof trackActivityStreaks === "function") {
       streakData = trackActivityStreaks(); // Global/Individual streaks
       Logger.log(`calculateStreakMultiplier: Using global/individual streaks for ${email}`);
    } else {
       Logger.log("Warning: No streak tracking function found in calculateStreakMultiplier.");
       streakData = { streaks: {}, buildingStreaks: {} };
    }
    // Get streak length from combined data
    streakLength = (streakData.streaks && streakData.streaks[activityName]) || (streakData.buildingStreaks && streakData.buildingStreaks[activityName]) || 0;

  } catch (e) {
     Logger.log(`Error getting streak data for ${activityName} in calculateStreakMultiplier: ${e}. Assuming 0 streak.`);
     streakLength = 0;
  }

  let bonusPoints = 0; // Flat bonus
  let multiplier = 1; // Base multiplier

  // Check thresholds from LOADED settings, highest first
  // *** Use UPPERCASE keys for server-side logic consistency ***
  if (streakLength >= currentSettings.thresholds.MULTIPLIER) {
    multiplier = 2;
    bonusPoints = 0; // Multiplier overrides flat bonus
  } else if (streakLength >= currentSettings.thresholds.BONUS_2) {
    bonusPoints = currentSettings.bonusPoints.BONUS_2;
  } else if (streakLength >= currentSettings.thresholds.BONUS_1) {
    bonusPoints = currentSettings.bonusPoints.BONUS_1;
  }

  // Calculate final points
  const totalPoints = (activityPoints * multiplier) + bonusPoints;

  // Log details if a streak is active
  if (streakLength >= currentSettings.thresholds.BONUS_1) {
     Logger.log(`Streak Applied for "${activityName}": Length=${streakLength}, BasePts=${activityPoints}, Multiplier=${multiplier}, BonusPts=${bonusPoints}, TotalPts=${totalPoints}`);
  }

  return {
    originalPoints: activityPoints,
    bonusPoints: bonusPoints,
    totalPoints: totalPoints,
    streakLength: streakLength,
    multiplier: multiplier
  };
}

/**
 * Tracks activity streaks by analyzing past activity data from the Dashboard.
 * Returns objects detailing current building (2-day) and full (3+ day) streaks.
 * @return {object} { buildingStreaks: { activityName: 2 }, streaks: { activityName: days } }
 */
function trackActivityStreaks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  const buildingStreaks = {}; // 2 days ending yesterday
  const fullStreaks = {};     // 3+ days, potentially including today

  Logger.log("trackActivityStreaks (Global): Function started.");

  if (!dashboardSheet) {
    Logger.log("trackActivityStreaks (Global): Dashboard sheet not found. Returning empty streaks.");
    return { buildingStreaks, streaks: fullStreaks };
  }

  const lastRow = dashboardSheet.getLastRow();
  if (lastRow <= 1) {
     Logger.log("trackActivityStreaks (Global): No data on Dashboard to track streaks.");
     return { buildingStreaks, streaks: fullStreaks };
  }

  // Fetch Date (A) and Activities (C) from Dashboard
  // Increased fetch range slightly for more robust streak calculation (e.g., 90 rows)
  const historyRange = Math.min(lastRow - 1, 90);
  const startFetchRow = Math.max(2, lastRow - historyRange + 1);
  const historyData = dashboardSheet.getRange(startFetchRow, 1, lastRow - startFetchRow + 1, 3).getValues(); // A:C
  Logger.log(`trackActivityStreaks (Global): Fetched ${historyData.length} rows from Dashboard.`);

  const activityData = getActivityDataCached(); // For checking if activity exists and is positive
  const activityDates = {}; // { activityName: Set{'YYYY-MM-DD', ... } }

  // Populate activityDates map
  historyData.forEach((row, index) => {
    const date = row[0];
    const activitiesStr = row[2] || ""; // Column C

    if (!(date instanceof Date) || date.getTime() === 0) return; // Skip invalid dates

    const formattedDate = formatDateYMD(date);

    if (activitiesStr) {
      const activitiesList = activitiesStr.split(", ");
      activitiesList.forEach(activityEntry => {
        // Use robust regex to extract name, tolerant of streak info
        const match = activityEntry.match(/[➕➖]\s(.*?)\s*(?:\(🔥\d+\))?\s*\(/);
        if (match && match[1]) {
          const activityName = match[1].trim();
          // Only track streaks for POSITIVE base activities known in Points Reference
          if (activityData.pointValues && activityData.pointValues[activityName] !== undefined && activityData.pointValues[activityName] > 0) {
            if (!activityDates[activityName]) {
              activityDates[activityName] = new Set();
            }
            activityDates[activityName].add(formattedDate);
          }
        }
      });
    }
  });

   // Calculate streaks for each activity found
  const today = new Date();
  const formattedToday = formatDateYMD(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const formattedYesterday = formatDateYMD(yesterday);

  for (const activityName in activityDates) {
    const dateSet = activityDates[activityName];
    const sortedDates = Array.from(dateSet).sort().reverse(); // Sort descending (latest first)

    if (sortedDates.length < 2) continue; // Need at least 2 dates for a streak

    let currentStreak = 0;
    let lastDateInStreak = null;

    // Check if the most recent date is today or yesterday
    if (sortedDates[0] === formattedToday || sortedDates[0] === formattedYesterday) {
        currentStreak = 1;
        lastDateInStreak = sortedDates[0];

        // Iterate through the rest of the dates to find consecutive days
        for (let i = 1; i < sortedDates.length; i++) {
            const currentDateStr = sortedDates[i];
            const prevDateStrInLoop = sortedDates[i-1]; // The date we just processed

            // Calculate difference in days
            const currentDateUTC = new Date(Date.UTC(parseInt(currentDateStr.substring(0,4)), parseInt(currentDateStr.substring(5,7))-1, parseInt(currentDateStr.substring(8,10))));
            const prevDateUTC = new Date(Date.UTC(parseInt(prevDateStrInLoop.substring(0,4)), parseInt(prevDateStrInLoop.substring(5,7))-1, parseInt(prevDateStrInLoop.substring(8,10))));
            const diffDays = (prevDateUTC - currentDateUTC) / (1000 * 60 * 60 * 24);

            if (diffDays === 1) {
                currentStreak++; // Increment streak if consecutive
            } else {
                break; // Stop if the streak is broken
            }
        }

        // Store the streak if it meets criteria
        if (currentStreak >= 3) {
            fullStreaks[activityName] = currentStreak;
        } else if (currentStreak === 2 && lastDateInStreak === formattedYesterday) {
            // Only count building streaks if they ended *yesterday*
            buildingStreaks[activityName] = 2;
        }
    }
    // Debugging log for a specific activity
    // if (activityName === DEBUG_ACTIVITY) {
    //     Logger.log(`Debug ${activityName}: Dates=${JSON.stringify(sortedDates)}, Streak=${currentStreak}, EndDate=${lastDateInStreak}`);
    // }
  }


  Logger.log(`trackActivityStreaks (Global) FINAL result: building=${Object.keys(buildingStreaks).length}, full=${Object.keys(fullStreaks).length}`);
  return { buildingStreaks, streaks: fullStreaks };
}

/**
 * Tracks activity streaks for a specific household by analyzing Dashboard data.
 * @param {string} householdId - The household ID
 * @return {Object} Object containing streaks { buildingStreaks: {}, streaks: {} }
 */
function trackActivityStreaksForHousehold(householdId) {
  const buildingStreaks = {}; // 2 days ending yesterday
  const fullStreaks = {};     // 3+ days, potentially including today
  // const DEBUG_ACTIVITY = "Get 7+ hours of sleep"; // Example Debug Activity

  Logger.log(`trackActivityStreaksForHousehold: Started for ID ${householdId}.`);

  if (!householdId) {
    Logger.log("trackActivityStreaksForHousehold: No household ID provided. Falling back to global streaks.");
    return trackActivityStreaks(); // Fall back to regular function
  }

  const householdEmails = getHouseholdEmails(householdId);
  if (!householdEmails || householdEmails.length === 0) {
    Logger.log(`trackActivityStreaksForHousehold: No emails found for household ID ${householdId}. Returning empty.`);
    return { buildingStreaks, streaks: fullStreaks };
  }
  Logger.log(`trackActivityStreaksForHousehold: Tracking for members: ${householdEmails.join(', ')}`);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);

  if (!dashboardSheet) {
    Logger.log("trackActivityStreaksForHousehold: Dashboard sheet not found.");
    return { buildingStreaks, streaks: fullStreaks };
  }

  const lastRow = dashboardSheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log("trackActivityStreaksForHousehold: No data on Dashboard.");
    return { buildingStreaks, streaks: fullStreaks };
  }

  // Fetch Date (A), Activities (C), and Email (G)
  const historyRange = Math.min(lastRow - 1, 90); // Fetch recent rows
  const startFetchRow = Math.max(2, lastRow - historyRange + 1);
  const historyData = dashboardSheet.getRange(startFetchRow, 1, lastRow - startFetchRow + 1, 7).getValues(); // A:G
  Logger.log(`trackActivityStreaksForHousehold: Fetched ${historyData.length} rows from Dashboard.`);

  const activityData = getActivityDataCached();
  const activityDates = {}; // { activityName: Set{'YYYY-MM-DD', ... } }

  // Populate activityDates map, filtering by household email
  historyData.forEach((row) => {
    const date = row[0];
    const activitiesStr = row[2] || "";
    const rowEmail = row[6] || ""; // Email from Col G

    if (!(date instanceof Date) || date.getTime() === 0) return; // Skip invalid dates

    // Filter by household
    if (householdEmails.some(he => he.toLowerCase() === rowEmail.toLowerCase())) {
      const formattedDate = formatDateYMD(date);
      if (activitiesStr) {
        const activitiesList = activitiesStr.split(", ");
        activitiesList.forEach(activityEntry => {
          // Use robust regex to extract name, tolerant of streak info
          const match = activityEntry.match(/[➕➖]\s(.*?)\s*(?:\(🔥\d+\))?\s*\(/);
          if (match && match[1]) {
            const activityName = match[1].trim();
            // Only track positive base activities
            if (activityData.pointValues && activityData.pointValues[activityName] !== undefined && activityData.pointValues[activityName] > 0) {
              if (!activityDates[activityName]) {
                activityDates[activityName] = new Set();
              }
              activityDates[activityName].add(formattedDate);
            }
          }
        });
      }
    }
  });

  // --- Calculate Streaks (Identical logic as global function) ---
  const today = new Date();
  const formattedToday = formatDateYMD(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const formattedYesterday = formatDateYMD(yesterday);

  for (const activityName in activityDates) {
    const dateSet = activityDates[activityName];
    const sortedDates = Array.from(dateSet).sort().reverse(); // Sort descending

    if (sortedDates.length < 2) continue;

    let currentStreak = 0;
    let lastDateInStreak = null;

    if (sortedDates[0] === formattedToday || sortedDates[0] === formattedYesterday) {
        currentStreak = 1;
        lastDateInStreak = sortedDates[0];

        for (let i = 1; i < sortedDates.length; i++) {
            const currentDateStr = sortedDates[i];
            const prevDateStrInLoop = sortedDates[i-1];

            const currentDateUTC = new Date(Date.UTC(parseInt(currentDateStr.substring(0,4)), parseInt(currentDateStr.substring(5,7))-1, parseInt(currentDateStr.substring(8,10))));
            const prevDateUTC = new Date(Date.UTC(parseInt(prevDateStrInLoop.substring(0,4)), parseInt(prevDateStrInLoop.substring(5,7))-1, parseInt(prevDateStrInLoop.substring(8,10))));
            const diffDays = (prevDateUTC - currentDateUTC) / (1000 * 60 * 60 * 24);

            if (diffDays === 1) {
                currentStreak++;
            } else {
                break;
            }
        }

        if (currentStreak >= 3) {
            fullStreaks[activityName] = currentStreak;
        } else if (currentStreak === 2 && lastDateInStreak === formattedYesterday) {
            buildingStreaks[activityName] = 2;
        }
    }
    // Debugging log for a specific activity within household context
    // if (activityName === DEBUG_ACTIVITY) {
    //     Logger.log(`Debug HH ${householdId} - ${activityName}: Dates=${JSON.stringify(sortedDates)}, Streak=${currentStreak}, EndDate=${lastDateInStreak}`);
    // }
  }
  // --- End Streak Calculation ---

  Logger.log(`trackActivityStreaksForHousehold FINAL result (Household ${householdId}): building=${Object.keys(buildingStreaks).length}, full=${Object.keys(fullStreaks).length}`);
  return { buildingStreaks, streaks: fullStreaks };
}


/**
 * Checks if the user qualifies for the weekly grad school alarm bonus.
 * Reads activity data from the Dashboard sheet for the current week.
 * **CONFIRM if this specific bonus is still needed.**
 * @param {Array<string>} [householdEmails=null] Optional: Emails for household filtering. If null, checks for current user.
 * @return {object} { qualifies: boolean, count: number, bonusPoints: number }
 */
function checkGradSchoolAlarmBonus(householdEmails = null) {
  // *** If this bonus is NOT used, delete this function entirely. ***
  const targetActivity = "Dedicated study/work block (e.g., Grad School)";
  const requiredCount = 5; // How many times needed per week
  const bonusPointsValue = 2; // Points awarded if qualified

  // Determine filter emails
  if (!householdEmails) {
     const email = Session.getEffectiveUser().getEmail();
     const householdId = getUserHouseholdId(email);
     householdEmails = householdId ? getHouseholdEmails(householdId) : [email];
  }

  // Check if target activity exists
  const activityData = getActivityDataCached();
  if (!activityData || !activityData.pointValues || activityData.pointValues[targetActivity] === undefined) {
     Logger.log(`Grad school bonus check skipped: Target activity "${targetActivity}" not found in Points Reference.`);
     return { qualifies: false, count: 0, bonusPoints: 0 };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  if (!dashboardSheet) {
     Logger.log("Dashboard sheet not found for Grad School Bonus check.");
     return { qualifies: false, count: 0, bonusPoints: 0 };
  }

  const today = new Date();
  const startOfWeek = getWeekStartDate(today);
  const endOfWeek = getWeekEndDate(today);
  const startDateStr = formatDateYMD(startOfWeek);
  const endDateStr = formatDateYMD(endOfWeek);

  let countThisWeek = 0;
  const lastRow = dashboardSheet.getLastRow();
  if (lastRow <= 1) return { qualifies: false, count: 0, bonusPoints: 0 };

  // Read Date (A), Activities (C), Email (G)
  const data = dashboardSheet.getRange(2, 1, lastRow - 1, 7).getValues(); // A:G

  data.forEach(row => {
    const date = row[0];
    const rowEmail = row[6] || "";
    // Check date range AND household membership
    if (date instanceof Date && formatDateYMD(date) >= startDateStr && formatDateYMD(date) <= endDateStr &&
        householdEmails.some(he => he.toLowerCase() === rowEmail.toLowerCase()))
    {
        const activitiesStr = row[2] || "";
        // Use regex to count occurrences accurately, allowing for streak text
        const escapedName = targetActivity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special chars
        const regex = new RegExp(`[➕➖]\\s${escapedName}\\s*(\\(🔥\\d+\\))?\\s*\\([+-]`, "g");
        const matches = activitiesStr.match(regex);
        if (matches) {
          countThisWeek += matches.length;
        }
    }
  });

  const qualifies = countThisWeek >= requiredCount;
  const bonusPoints = qualifies ? bonusPointsValue : 0;

  Logger.log(`Grad School Bonus Check (Current Week, Filtered): Count=${countThisWeek}, Qualifies=${qualifies}`);
  return { qualifies: qualifies, count: countThisWeek, bonusPoints: bonusPoints };
}


/**
 * DEBUG FUNCTION: Manually runs trackActivityStreaks or trackActivityStreaksForHousehold
 * and logs the result.
 */
function debugStreakCalculation() {
  // --- Configuration ---
  const TEST_HOUSEHOLD_ID = null; // SET TO a valid household ID string to test household, or null/"" to test global
  // -------------------

  Logger.log(`--- DEBUG: Running streak calculation manually (${TEST_HOUSEHOLD_ID ? `Household: ${TEST_HOUSEHOLD_ID}` : 'Global'}) ---`);
  try {
    // Clear cache before running to ensure fresh data
    resetActivityDataCache(); // Use the centralized cache reset function

    // Clear household caches specifically if testing household
    if (TEST_HOUSEHOLD_ID) {
       clearHouseholdCaches(TEST_HOUSEHOLD_ID); // Use the dedicated function
    }
    Logger.log("Cleared relevant caches for debug run.");


    let streaks;
    if (TEST_HOUSEHOLD_ID && typeof trackActivityStreaksForHousehold === "function") {
        streaks = trackActivityStreaksForHousehold(TEST_HOUSEHOLD_ID);
    } else if (typeof trackActivityStreaks === "function") {
        streaks = trackActivityStreaks(); // Use the global one
    } else {
        Logger.log("ERROR: Appropriate streak function not found.");
        return;
    }

    Logger.log("--- DEBUG RESULT ---");
    Logger.log("Building Streaks: " + JSON.stringify(streaks.buildingStreaks || {}, null, 2)); // Pretty print
    Logger.log("Full Streaks: " + JSON.stringify(streaks.streaks || {}, null, 2)); // Pretty print
    Logger.log("--- DEBUG END ---");
  } catch (e) {
    Logger.log("--- DEBUG ERROR ---");
    Logger.log("Error: " + e);
    Logger.log("Stack: " + e.stack);
    Logger.log("--- DEBUG END ---");
  }
}