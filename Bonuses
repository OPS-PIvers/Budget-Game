/**
 * Bonuses and Streak Calculations for Budget Game v3
 * Handles streak point calculation and weekly threshold bonuses.
 * Includes corrected regex in trackActivityStreaks.
 */

/**
 * Calculates the point multiplier and bonus points for an activity based on streak length.
 * Uses thresholds and bonus points defined in CONFIG.
 * @param {string} activityName The name of the activity.
 * @param {number} activityPoints The base points for the activity.
 * @return {object} { originalPoints, bonusPoints, totalPoints, streakLength, multiplier }
 */
function calculateStreakMultiplier(activityName, activityPoints) {
  // Get the current activity streaks
  // Assumes trackActivityStreaks() is functional and accessible
  let streakLength = 0;
  try {
    // Check if trackActivityStreaks exists before calling
    if (typeof trackActivityStreaks === "function") {
       const streakData = trackActivityStreaks(); // Needs to be implemented correctly
       streakLength = (streakData.streaks && streakData.streaks[activityName]) || (streakData.buildingStreaks && streakData.buildingStreaks[activityName]) || 0;
    } else {
       Logger.log("Warning: trackActivityStreaks function not found in calculateStreakMultiplier. Assuming 0 streak.");
       streakLength = 0;
    }
  } catch (e) {
  //   Logger.log(`Error getting streak data for ${activityName} in calculateStreakMultiplier: ${e}. Assuming 0 streak.`);
     streakLength = 0;
  }

  let bonusPoints = 0; // This is the FLAT bonus added ON TOP of multiplier
  let multiplier = 1; // Base multiplier

  // Check thresholds from CONFIG, highest first
  if (streakLength >= CONFIG.STREAK_THRESHOLDS.MULTIPLIER) {
    multiplier = 2; // Double points
    bonusPoints = 0; // No flat bonus if multiplier is active
  } else if (streakLength >= CONFIG.STREAK_THRESHOLDS.BONUS_2) {
    bonusPoints = CONFIG.STREAK_BONUS_POINTS.BONUS_2; // e.g., +2 points
  } else if (streakLength >= CONFIG.STREAK_THRESHOLDS.BONUS_1) {
    bonusPoints = CONFIG.STREAK_BONUS_POINTS.BONUS_1; // e.g., +1 point
  }

  // Calculate total points: (Base * Multiplier) + Flat Bonus
  const totalPoints = (activityPoints * multiplier) + bonusPoints;

  return {
    originalPoints: activityPoints,
    bonusPoints: bonusPoints, // This is the *additional* flat bonus
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

  if (!dashboardSheet) {
    Logger.log("Dashboard sheet not found in trackActivityStreaks.");
    return { buildingStreaks, streaks: fullStreaks };
  }

  const lastRow = dashboardSheet.getLastRow();
  if (lastRow <= 1) {
     // Logger.log("No data on Dashboard to track streaks."); // Reduce log noise
     return { buildingStreaks, streaks: fullStreaks };
  }

  const daysToFetch = 30;
  const history = typeof getRecentDashboardData === "function" ? getRecentDashboardData(dashboardSheet, daysToFetch) : []; // Use helper [Date, Points, ActivitiesString]

  if (history.length === 0) {
     Logger.log("trackActivityStreaks: No recent history found from Dashboard.");
     return { buildingStreaks, streaks: fullStreaks };
  }
  // Logger.log(`trackActivityStreaks: Fetched ${history.length} rows of history.`);
  // Logger.log(`trackActivityStreaks: Last history row: ${history.length > 0 ? history[history.length-1].join(', ') : 'N/A'}`);


  const activityData = getActivityDataCached(); // For checking if activity exists
  const activityDates = {}; // { activityName: Set{'YYYY-MM-DD', ... } }

  // Populate activityDates map
  history.forEach(row => {
    const date = row[0];
    const activitiesStr = row[2] || "";
    if (!(date instanceof Date)) return; // Skip if date is invalid
    const formattedDate = formatDateYMD(date);

    if (activitiesStr) {
      const activitiesList = activitiesStr.split(", ");
      activitiesList.forEach(activityEntry => {
        // Only consider positive activities for streaks
        if (activityEntry.startsWith("➕") || /\(\+\d+\)/.test(activityEntry)) {
          // --- MODIFIED REGEX ---
          // More flexible regex: Allows optional space before points, captures name and points value
          const match = activityEntry.match(/[➕]\s(.*?)\s*(?:\(🔥\d+\))?\s*\(([+-]\d+)\)/);
          // --- END MODIFIED REGEX ---

          if (match && match[1]) {
            const activityName = match[1].trim();
            // Ensure it's a known activity before tracking
            if (activityData.pointValues[activityName] !== undefined) {
              if (!activityDates[activityName]) {
                activityDates[activityName] = new Set(); // Use Set for unique dates per activity
              }
              activityDates[activityName].add(formattedDate);
            } else {
               // Logger.log(`trackActivityStreaks: Activity "${activityName}" (from regex) not in pointValues.`); // Uncomment for deep debug
            }
          } else {
              // Logger.log(`trackActivityStreaks: Regex failed for entry: "${activityEntry}"`); // Uncomment for deep debug
          }
        }
      });
    }
  });
   // --- Diagnostic Log: Check activityDates ---
   // Convert Sets to Arrays for stringify
   const activityDatesForLog = Object.fromEntries(Object.entries(activityDates).map(([k, v]) => [k, Array.from(v)]));
  // Logger.log("trackActivityStreaks: activityDates map built: " + JSON.stringify(activityDatesForLog));


  // Calculate streaks for each activity found
  const today = new Date();
  const formattedToday = formatDateYMD(today);

  for (const activityName in activityDates) {
    const dateSet = activityDates[activityName];
    const sortedDates = Array.from(dateSet).sort(); // Sort dates chronologically 'YYYY-MM-DD'

    if (sortedDates.length < 2) continue; // Need at least 2 days for any streak

    let currentStreak = 0;
    let latestStreakLength = 0;
    let latestStreakEndDateStr = null;

     // Iterate backward from the last logged date for this activity
     for(let i = sortedDates.length - 1; i >= 0; i--) {
        const currentDateStr = sortedDates[i];
        // Logger.log(`Checking date: ${currentDateStr} for activity: ${activityName}`); // Diagnostic

        if (i === sortedDates.length - 1) { // Start from the most recent date
           currentStreak = 1;
           latestStreakEndDateStr = currentDateStr;
        } else {
           const prevDateStrInLoop = sortedDates[i+1]; // The date chronologically AFTER currentDateStr
           // Calculate difference in days VERY carefully using UTC to avoid timezone issues with midnight
           const currentDateUTC = new Date(Date.UTC(parseInt(currentDateStr.substring(0,4)), parseInt(currentDateStr.substring(5,7))-1, parseInt(currentDateStr.substring(8,10))));
           const prevDateUTC = new Date(Date.UTC(parseInt(prevDateStrInLoop.substring(0,4)), parseInt(prevDateStrInLoop.substring(5,7))-1, parseInt(prevDateStrInLoop.substring(8,10))));
           const diffDays = (prevDateUTC - currentDateUTC) / (1000 * 60 * 60 * 24);

           // Logger.log(`Comparing ${currentDateStr} and ${prevDateStrInLoop}. Diff days: ${diffDays}`); // Diagnostic

           if (diffDays === 1) {
              currentStreak++; // Dates are consecutive, continue streak backward
           } else {
              // Logger.log(`Streak broken at ${currentDateStr}. Previous streak length was ${currentStreak}.`); // Diagnostic
              break; // Stop checking further back for THIS latest streak
           }
        }
     }
     latestStreakLength = currentStreak; // Length of the most recent consecutive block of days

     // Logger.log(`Activity: ${activityName}, Latest Streak End Date: ${latestStreakEndDateStr}, Length: ${latestStreakLength}`);


     // Categorize the LATEST streak found for this activity
     if (latestStreakEndDateStr) { // Ensure we found at least one date
        if (latestStreakLength >= 3) {
           fullStreaks[activityName] = latestStreakLength;
        } else if (latestStreakLength === 2) {
            // Only count as "building" if the streak ended YESTERDAY (not today)
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);
            if (latestStreakEndDateStr === formatDateYMD(yesterday)) {
                buildingStreaks[activityName] = 2;
            }
        }
     }
  }

   // --- Final Diagnostic Log ---
  // Logger.log(`trackActivityStreaks result: ${JSON.stringify({ buildingStreaks, streaks: fullStreaks })}`);
  return { buildingStreaks, streaks: fullStreaks };
}


/**
 * Checks if the user qualifies for the weekly grad school alarm bonus.
 * (This is specific, might be removed or generalized later)
 * Reads activity data from the Dashboard sheet for the current week.
 * @return {object} { qualifies: boolean, count: number, bonusPoints: number }
 */
function checkGradSchoolAlarmBonus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  // Ensure activity name exactly matches Points Reference and CONFIG if needed
  const targetActivity = "Dedicated study/work block (e.g., Grad School)";
  const requiredCount = 5; // How many times needed per week
  const bonusPointsValue = 2; // Points awarded if qualified

  if (!dashboardSheet) {
     Logger.log("Dashboard sheet not found for Grad School Bonus check.");
     return { qualifies: false, count: 0, bonusPoints: 0 };
  }

  // Check if target activity exists at all
   const activityData = getActivityDataCached();
   if (activityData.pointValues[targetActivity] === undefined) {
    //  Logger.log(`Grad school bonus check skipped: Target activity "${targetActivity}" not found in Points Reference.`);
      return { qualifies: false, count: 0, bonusPoints: 0 };
   }

  const today = new Date();
  const startOfWeek = getWeekStartDate(today);
  const endOfWeek = getWeekEndDate(today);

  // Fetch history for the current week from Dashboard
  // Use the helper function defined in Suggestions.gs
  const history = typeof getRecentDashboardData === "function" ? getRecentDashboardData(dashboardSheet, 7) : [];
  let countThisWeek = 0;

  history.forEach(row => {
    const date = row[0];
    // Check if the date falls within the current week (Sun to Sat)
    if (date >= startOfWeek && date <= endOfWeek) {
      const activitiesStr = row[2] || "";
      // Use regex to count occurrences accurately, allowing for streak text
      const escapedName = targetActivity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`[➕➖]\\s${escapedName}\\s(\\(🔥\\d+\\))?\\s\\([+-]`, "g");
      const matches = activitiesStr.match(regex);
      if (matches) {
        countThisWeek += matches.length;
      }
    }
  });

  const qualifies = countThisWeek >= requiredCount;
  const bonusPoints = qualifies ? bonusPointsValue : 0;

  Logger.log(`Grad School Bonus Check (Current Week): Count=${countThisWeek}, Qualifies=${qualifies}`);
  return {
    qualifies: qualifies,
    count: countThisWeek,
    bonusPoints: bonusPoints
  };
}


/**
 * Defines the rules for automatic weekly threshold bonuses.
 * Each object defines a bonus condition and reward.
 * Uses count functions to determine qualification based on weekly data.
 * @return {Array<object>} Array of bonus definition objects.
 */
function getWeeklyThresholdBonuses() {
  return [
    {
      id: "health-enthusiast",
      name: "Health Enthusiast",
      description: "Complete 3+ Health activities",
      category: "Health", // Uses category mapping
      minCount: 3,
      bonusPoints: 5,
      /** @param {object} weekSummary - Summary object { categories: { "Health Activities": count, ... } }.
       *  @param {Array<object>} weekActivities - Detailed activities from getWeekActivities.
       *  @param {object} activityData - Cached activity data. */
      countFunction: function(weekSummary, weekActivities, activityData) {
        // Prefer counting from detailed activities for accuracy
        return weekActivities.filter(act => act.category === 'Health').length; // Use category from act object
      }
    },
    {
      id: "delivery-dodger",
      name: "Delivery Dodger",
      description: "Fewer than 2 food delivery orders",
      specificActivity: "Order food for delivery", // Exact activity name
      maxCount: 1, // Max allowed is 1 (0 or 1 qualifies)
      bonusPoints: 4,
      countFunction: function(weekSummary, weekActivities, activityData) {
        // Filter detailed activities by the specific name defined in 'this' bonus object
        return weekActivities.filter(act => act.name === this.specificActivity).length;
      }
    },
    {
      id: "household-champion",
      name: "Household Champion",
      description: "Complete 5+ Household activities",
      category: "Household",
      minCount: 5,
      bonusPoints: 6,
      countFunction: function(weekSummary, weekActivities, activityData) {
         return weekActivities.filter(act => act.category === 'Household').length; // Use category from act object
      }
    },
    {
      id: "coffee-saver",
      name: "Coffee Saver",
      description: "No Starbucks/coffee purchases",
      specificActivity: "Starbucks/coffee/fast snack", // Exact activity name
      maxCount: 0, // Must be exactly 0
      bonusPoints: 3,
      countFunction: function(weekSummary, weekActivities, activityData) {
        return weekActivities.filter(act => act.name === this.specificActivity).length;
      }
    }
    // Add more bonus definitions here
  ];
}


/**
 * Checks all weekly threshold bonuses based on the *past* week's performance.
 * Should be called typically at the beginning of a new week or in the weekly digest.
 * Uses getWeekActivities (from GoalSetting.gs) to get detailed data.
 * @param {Date} [referenceDate=new Date()] Optional: Date to determine which week to check (defaults to today, checking the week that just ended).
 * @return {object} { earnedBonuses: Array<object>, totalBonusPoints: number }
 */
function calculateWeeklyThresholdBonuses(referenceDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const earnedBonuses = [];
  let totalBonusPoints = 0;

  // Determine the week range to check (the week ending *before* referenceDate)
  const checkDate = referenceDate || new Date();
  const endOfWeekToCheck = getWeekStartDate(checkDate); // Start of current week is end of last week + 1ms
  endOfWeekToCheck.setMilliseconds(endOfWeekToCheck.getMilliseconds() - 1); // Go back to Sat 23:59:59.999
  const startOfWeekToCheck = getWeekStartDate(endOfWeekToCheck); // Get Sunday of that week

  Logger.log(`Calculating threshold bonuses for week: ${formatDateYMD(startOfWeekToCheck)} to ${formatDateYMD(endOfWeekToCheck)}`);

  // Get detailed activity data for that specific week using getWeekActivities (from GoalSetting.gs)
  let weekActivities = [];
  if (typeof getWeekActivities === "function") {
      weekActivities = getWeekActivities(startOfWeekToCheck, endOfWeekToCheck);
  } else {
      Logger.log("ERROR: getWeekActivities function not found in calculateWeeklyThresholdBonuses.");
      return { earnedBonuses: [], totalBonusPoints: 0 };
  }

  const activityData = getActivityDataCached();

  // Calculate a summary object needed for some count functions (or adapt count functions)
  const weekSummary = calculateSummaryFromActivities(weekActivities, activityData);


  if (!weekSummary || weekActivities.length === 0) { // Check if activities were found
     Logger.log("No activities found for the past week. No threshold bonuses calculated.");
     return { earnedBonuses: [], totalBonusPoints: 0 };
  }


  // Get bonus definitions
  const bonusDefinitions = getWeeklyThresholdBonuses();

  // Check each bonus definition
  bonusDefinitions.forEach(bonus => {
     // Check if the activity/category for the bonus exists in the game data
     let dataExists = true;
     if (bonus.specificActivity && activityData.pointValues[bonus.specificActivity] === undefined) {
        Logger.log(`Bonus "${bonus.name}" skipped: Activity "${bonus.specificActivity}" not found.`);
        dataExists = false;
     }
     if (bonus.category && !CONFIG.CATEGORIES.includes(bonus.category)) {
         Logger.log(`Bonus "${bonus.name}" skipped: Category "${bonus.category}" not defined in CONFIG.`);
        dataExists = false;
     }

     if(dataExists) {
        try { // Wrap countFunction call in try/catch
           const count = bonus.countFunction(weekSummary, weekActivities, activityData);
           let qualifies = false;

           if (bonus.minCount !== undefined && count >= bonus.minCount) {
              qualifies = true;
           } else if (bonus.maxCount !== undefined && count <= bonus.maxCount) {
              qualifies = true;
           }

           if (qualifies) {
              Logger.log(`Bonus Qualified: "${bonus.name}" (Count: ${count})`);
              earnedBonuses.push({
                 id: bonus.id,
                 name: bonus.name,
                 description: bonus.description,
                 bonusPoints: bonus.bonusPoints,
                 count: count // Include the count that qualified
              });
              totalBonusPoints += bonus.bonusPoints;
           }
        } catch (countErr) {
            Logger.log(`Error executing countFunction for bonus "${bonus.name}": ${countErr}`);
        }
     }
  });

  Logger.log(`Total threshold bonus points calculated for past week: ${totalBonusPoints}`);
  return {
    earnedBonuses: earnedBonuses,
    totalBonusPoints: totalBonusPoints
  };
}

/**
 * Helper to calculate a summary object structure from a list of activities.
 * Used when a weekly sheet doesn't exist or for bonus calculation based on detailed list.
 * @param {Array<object>} activities - Array from getWeekActivities { name, points, date, category }.
 * @param {object} activityData - Cached activity data {pointValues, categories}.
 * @return {object} Summary object { total, positive, negative, topActivity, topActivityCount, categories: { ... } }
 */
function calculateSummaryFromActivities(activities, activityData) {
    let total = 0;
    let positive = 0; // Count of positive activity entries
    let negative = 0; // Count of negative activity entries
    const activityCounts = {}; // Count occurrences of each specific activity name
    const categoryCounts = { // Mirroring weekly sheet summary structure G2:G5
        "Positive Activities": 0,
        "Negative Activities": 0,
        "Health Activities": 0,
        "Household Activities": 0
        // Add other categories based on weekly sheet setup if needed
    };

    activities.forEach(act => {
        total += act.points; // Sum the actual points recorded (which include streak bonuses)
        const category = act.category || "Unknown"; // Use category from getWeekActivities result
        activityCounts[act.name] = (activityCounts[act.name] || 0) + 1;

        // Count based on whether the specific entry had positive or negative points
        if (act.points >= 0) {
            positive++;
            categoryCounts["Positive Activities"]++;
            if (category === 'Health') categoryCounts["Health Activities"]++;
            if (category === 'Household') categoryCounts["Household Activities"]++;
            // Add other specific positive categories if tracked
        } else {
            negative++;
            categoryCounts["Negative Activities"]++;
            // Add specific negative categories if tracked
        }
    });

    let topActivity = "None";
    let topActivityCount = 0;
    for (const [name, count] of Object.entries(activityCounts)) {
        if (count > topActivityCount) {
            topActivityCount = count;
            topActivity = name;
        }
    }

    return { total, positive, negative, topActivity, topActivityCount, categories: categoryCounts };
}
