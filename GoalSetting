/**
 * Goal Setting and Tracking for Budget Game
 * Includes generating weekly goals, checking progress, and managing the Weekly Goals sheet.
 * Contains getWeekActivities (reading from Form Responses).
 */

// --- Activity Fetching ---

/**
 * Fetches all detailed activity entries for a given date range by reading
 * directly from the Form Responses sheet. Skips known non-activity answers like "Yes"/"No".
 * @param {Date} startDate The start date of the range (inclusive).
 * @param {Date} endDate The end date of the range (inclusive).
 * @return {Array<object>} An array of activity objects { name, points, date, category? }.
 */
function getWeekActivities(startDate, endDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const formSheetName = CONFIG.SHEET_NAMES.FORM_RESPONSES; // Ensure this name is correct
  const formSheet = ss.getSheetByName(formSheetName);
  const allActivities = [];

  if (!formSheet) {
    Logger.log(`ERROR: Form Responses sheet "${formSheetName}" not found in getWeekActivities.`);
    return [];
  }

  const lastRow = formSheet.getLastRow();
  if (lastRow < 2) {
      Logger.log("No data in Form Responses sheet.");
      return []; // No data
  }

  // Fetch all data - Timestamp (col A) and potential activity columns (B onwards)
  const data = formSheet.getRange(2, 1, lastRow - 1, formSheet.getLastColumn()).getValues();
  const activityData = getActivityDataCached(); // Get points/categories map

  Logger.log(`Processing ${data.length} rows from Form Responses for activities between ${formatDateYMD(startDate)} and ${formatDateYMD(endDate)}.`);

  data.forEach((row, rowIndex) => {
    const timestamp = row[0]; // Assuming Timestamp is column A

    // Check if timestamp is valid and within the desired range
    if (timestamp instanceof Date && timestamp >= startDate && timestamp <= endDate) {
      const numCols = row.length;
      // Start processing from column B (index 1)
      for (let col = 1; col < numCols; col++) {
         const cellValue = row[col];
         // Check if the cell value is likely an activity list vs. a simple "Yes"/"No" or empty
         if (cellValue && typeof cellValue === 'string' && cellValue.trim() !== 'Yes' && cellValue.trim() !== 'No' && cellValue.trim() !== '') {
            // Use processCheckboxCell which handles single/multiple and gets points/category
            const cellResult = processCheckboxCell(cellValue); // This uses cached activityData

            // Add each processed activity from the cell to the main list
            cellResult.activities.forEach(activityDetail => {
                allActivities.push({
                   name: activityDetail.name,
                   points: activityDetail.points, // Points including streak calculated by processCheckboxCell
                   date: timestamp,
                   category: activityDetail.category
                });
            });
         } // End check for valid activity cell content
      } // End column loop
    } // End date check
  }); // End row loop

  Logger.log(`Finished processing Form Responses. Found ${allActivities.length} activities within the date range.`);
  return allActivities;
}


// --- Goal Generation ---

/**
 * Generates auto-suggested goals for the upcoming week based on the *previous* week's performance.
 * @return {Array<object>} An array of suggested goal objects.
 */
function generateWeeklyGoals() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Note: This relies on getWeekActivities now reading Form Responses, which might be slow if history is huge.
  // Consider if generating goals based on Dashboard summary is acceptable for speed. For now, using accurate data.
  const goals = [];

  // Calculate previous week's range
  const today = new Date();
  const thisWeekStart = getWeekStartDate(today);
  const prevWeekEnd = new Date(thisWeekStart);
  prevWeekEnd.setMilliseconds(prevWeekEnd.getMilliseconds() - 1); // End of Saturday last week
  const prevWeekStart = getWeekStartDate(prevWeekEnd); // Sunday of last week

  Logger.log(`Generating goals based on previous week: ${formatDateYMD(prevWeekStart)} to ${formatDateYMD(prevWeekEnd)}`);

  // Get data for the previous week using getWeekActivities (from Form Responses)
  const prevWeekActivities = getWeekActivities(prevWeekStart, prevWeekEnd);
  const activityData = getActivityDataCached();
  const prevWeekSummary = calculateSummaryFromActivities(prevWeekActivities, activityData); // Use helper from Bonuses.gs

  // --- Goal Generation Logic ---

  // Goal 1: Increase activity in the least active *positive* category (Health or Household)
  const positiveCategoriesToCheck = ["Health", "Household"]; // Add others like Meal Planning?
  let leastActiveCategory = null;
  let minCount = Infinity;

  positiveCategoriesToCheck.forEach(category => {
    // Use the category counts calculated by calculateSummaryFromActivities
    const categoryKey = `${category} Activities`; // Key used in calculateSummaryFromActivities structure
    const count = prevWeekSummary.categories[categoryKey] || 0;
    if (count < minCount) {
      minCount = count;
      leastActiveCategory = category;
    }
  });

  if (leastActiveCategory) {
    // Set target: current count + 2, minimum of 3
    const targetCount = Math.max(3, minCount + 2);
    goals.push({
      id: `increase-${leastActiveCategory.toLowerCase()}-${Utilities.getUuid()}`, // Add UUID for uniqueness
      name: `Boost ${leastActiveCategory} Actions`,
      description: `Complete at least ${targetCount} '${leastActiveCategory}' activities this week (previous: ${minCount}).`,
      type: 'category_count', // Add a type for easier processing later
      params: { category: leastActiveCategory, target: targetCount },
      bonusPoints: 5
    });
  }

  // Goal 2: Reduce negative points by ~15-25% if significant
  const totalNegativePointsPrevWeek = prevWeekActivities.reduce((sum, act) => act.points < 0 ? sum + Math.abs(act.points) : sum, 0);

  if (totalNegativePointsPrevWeek > 10) { // Only set goal if negative points were somewhat high
    const reductionPercentage = 0.15 + Math.random() * 0.10; // 15-25% reduction target
    const targetReduction = Math.max(1, Math.round(totalNegativePointsPrevWeek * reductionPercentage)); // Reduce by at least 1 point
    const newTargetMax = totalNegativePointsPrevWeek - targetReduction;

    goals.push({
      id: `reduce-negative-${Utilities.getUuid()}`,
      name: "Mindful Spending",
      description: `Keep total negative points below ${newTargetMax} this week (previous: ${totalNegativePointsPrevWeek}).`,
      type: 'negative_limit',
      params: { limit: newTargetMax, previous: totalNegativePointsPrevWeek },
      bonusPoints: 7
    });
  } else if (goals.length < 2) { // Add an alternative if spending was low
     const zeroSpendActivity = "Spend zero money in a day";
     if (activityData.pointValues[zeroSpendActivity]) {
         goals.push({
           id: `no-spend-days-${Utilities.getUuid()}`,
           name: "No-Spend Challenge",
           description: `Achieve at least 2 'No Spend Days' this week.`,
           type: 'activity_count',
           params: { activity: zeroSpendActivity, target: 2 },
           bonusPoints: 4
         });
     }
  }


  // Goal 3: Maintain longest streak or start a new one
   let streakData = {}; // Default empty
   try {
      streakData = trackActivityStreaks(); // Get current streaks ending now/yesterday
   } catch (e) { Logger.log("Error fetching streaks for goal generation: " + e)}

  const longestStreakActivity = Object.keys(streakData.streaks || {}).sort((a,b) => (streakData.streaks[b]||0) - (streakData.streaks[a]||0))[0];

  if (longestStreakActivity && streakData.streaks[longestStreakActivity] >= 3) {
    const currentStreak = streakData.streaks[longestStreakActivity];
    const targetStreak = currentStreak + 7; // Maintain for the whole week
    goals.push({
      id: `maintain-streak-${Utilities.getUuid()}`,
      name: "Keep the Streak Alive!",
      description: `Continue your '${longestStreakActivity}' streak all week (reach ${targetStreak} days).`,
      type: 'streak_maintain',
      params: { activity: longestStreakActivity, target: targetStreak, current: currentStreak },
      bonusPoints: 8
    });
  } else if (goals.length < 3) { // Only add if we don't have 3 goals yet
    // Suggest starting a 3-day streak with a common positive activity
    const commonPositives = ["Home made dinner", "Exercise for 30 minutes", "Walk the dog"].filter(a => activityData.pointValues[a] > 0);
    const targetActivity = commonPositives.length > 0 ? commonPositives[Math.floor(Math.random() * commonPositives.length)] : null;
    if (targetActivity) {
       goals.push({
         id: `start-streak-${Utilities.getUuid()}`,
         name: "Start a Mini-Streak",
         description: `Start a 3-day streak with '${targetActivity}' (or any positive activity).`,
         type: 'streak_start',
         params: { target: 3, activityHint: targetActivity }, // Hint activity, but any 3-day streak counts
         bonusPoints: 5
       });
    }
  }

  Logger.log(`Generated ${goals.length} potential weekly goals.`);
  return goals.slice(0, 3); // Return up to 3 goals
}

// --- Goal Sheet Management ---

/**
 * Sets up the Weekly Goals sheet if it doesn't exist.
 * Populates with initial goals if newly created.
 * @return {Sheet|null} The Weekly Goals sheet object, or null on failure.
 */
function setupWeeklyGoalsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = CONFIG.SHEET_NAMES.WEEKLY_GOALS;
  let sheet = ss.getSheetByName(sheetName);
  let createdNew = false;

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    createdNew = true;

    // Headers - Added Type and Params columns
    const headers = [["ID", "Name", "Description", "Bonus Points", "Completed", "Week Start", "Week End", "Type", "Params"]];
    sheet.getRange("A1:I1").setValues(headers)
      .setFontWeight("bold")
      .setBackground(CONFIG.COLORS.HEADER_BG)
      .setFontColor(CONFIG.COLORS.HEADER_FG);

    // Column Widths (Adjust as needed)
    sheet.setColumnWidth(1, 150); // ID
    sheet.setColumnWidth(2, 200); // Name
    sheet.setColumnWidth(3, 350); // Description
    sheet.setColumnWidth(4, 80);  // Bonus Points
    sheet.setColumnWidth(5, 80);  // Completed (Checkbox?)
    sheet.setColumnWidth(6, 100); // Week Start
    sheet.setColumnWidth(7, 100); // Week End
    sheet.setColumnWidth(8, 120); // Type
    sheet.setColumnWidth(9, 200); // Params (JSON string)

    // Formatting
    sheet.getRange("F:G").setNumberFormat(CONFIG.DATE_FORMAT_SHORT); // Date columns
    sheet.getRange("E2:E" + sheet.getMaxRows()).insertCheckboxes(); // Use checkboxes for Completed status

  }

   // --- Add default goals if sheet was new ---
   if (createdNew) {
       saveWeeklyGoals(generateWeeklyGoals()); // Save generated goals
       Logger.log(`Created and populated ${sheetName} sheet.`);
       SpreadsheetApp.getActiveSpreadsheet().toast(`${sheetName} sheet created.`, 'Setup Complete', 5);
   } else {
       // Ensure checkboxes are present even if sheet existed
       sheet.getRange("E2:E" + sheet.getMaxRows()).insertCheckboxes();
       Logger.log(`${sheetName} sheet already exists or setup refreshed.`);
   }

  return sheet;
}

/**
 * Saves generated weekly goals to the Weekly Goals sheet.
 * Appends new goals. Does NOT overwrite based on week dates currently.
 * @param {Array<object>} goalsToSave Array of goal objects from generateWeeklyGoals.
 */
function saveWeeklyGoals(goalsToSave) {
   if (!goalsToSave || goalsToSave.length === 0) {
      Logger.log("No goals provided to save.");
      return;
   }

   const ss = SpreadsheetApp.getActiveSpreadsheet();
   const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.WEEKLY_GOALS);
   if (!sheet) {
      Logger.log(`Cannot save goals: ${CONFIG.SHEET_NAMES.WEEKLY_GOALS} sheet not found. Trying to set it up.`);
      setupWeeklyGoalsSheet(); // Attempt setup
      sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.WEEKLY_GOALS); // Try getting again
       if (!sheet) {
          Logger.log(`FATAL: Failed to find or create ${CONFIG.SHEET_NAMES.WEEKLY_GOALS} sheet. Goals not saved.`);
          return;
       }
   }

   const today = new Date();
   const weekStart = getWeekStartDate(today);
   const weekEnd = getWeekEndDate(today);

   const goalRows = goalsToSave.map(goal => [
     goal.id || Utilities.getUuid(), // Ensure ID exists
     goal.name,
     goal.description,
     goal.bonusPoints,
     false, // Not completed initially
     weekStart,
     weekEnd,
     goal.type || 'unknown', // Store goal type
     JSON.stringify(goal.params || {}) // Store parameters as JSON string
   ]);

   // Append rows to the sheet
   const startRow = sheet.getLastRow() + 1;
   sheet.getRange(startRow, 1, goalRows.length, goalRows[0].length).setValues(goalRows);

   // Re-apply checkbox format for the new rows
    sheet.getRange(startRow, 5, goalRows.length, 1).insertCheckboxes();

   Logger.log(`Saved ${goalRows.length} new weekly goals for week starting ${formatDateYMD(weekStart)}.`);
}


/**
 * Gets the active (not completed) goals for the current week from the sheet.
 * @return {Array<object>} Array of active goal objects read from the sheet.
 */
function getActiveWeeklyGoals() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.WEEKLY_GOALS);
  const activeGoals = [];

  if (!sheet) {
    Logger.log(`Cannot get goals: ${CONFIG.SHEET_NAMES.WEEKLY_GOALS} sheet not found.`);
    return [];
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return []; // No goals stored

  const today = new Date();
  const currentWeekStart = getWeekStartDate(today);
  // Use currentWeekStart for comparison as goal start dates should match week start
  const currentWeekStartMs = currentWeekStart.getTime();


  const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues(); // Read all columns A:I

  data.forEach((row, index) => {
    const completed = row[4] === true; // Checkbox value in Column E
    const goalWeekStart = row[5]; // Date in Column F

    // Check if goal is for the current week (by matching start date) and not yet completed
    if (!completed && goalWeekStart instanceof Date && goalWeekStart.getTime() === currentWeekStartMs)
    {
       let params = {};
       try {
          // Params are stored in Column I (index 8)
          params = JSON.parse(row[8] || '{}');
       } catch(e) { Logger.log(`Error parsing params for goal ID ${row[0]} on sheet row ${index+2}: ${e}`); }

       activeGoals.push({
         row: index + 2, // Sheet row number for potential updates
         id: row[0], // Col A
         name: row[1], // Col B
         description: row[2], // Col C
         bonusPoints: row[3], // Col D
         completed: completed, // Col E (should be false here)
         weekStart: goalWeekStart, // Col F
         weekEnd: row[6], // Col G
         type: row[7], // Col H
         params: params // Col I (parsed)
       });
    }
  });

  Logger.log(`Found ${activeGoals.length} active goals for the current week.`);
  return activeGoals;
}

/**
 * Checks progress towards active weekly goals and calculates detailed status.
 * This function is intended to provide data for email digests.
 * Calls getWeekActivities (which reads Form Responses).
 * @return {Array<object>} Array of goal objects with added progress details
 *                         (e.g., currentValue, targetValue, percentComplete, remainingValue).
 */
function checkWeeklyGoalProgressWithDetails() {
  const activeGoals = getActiveWeeklyGoals();
  if (activeGoals.length === 0) return [];

  const today = new Date();
  const weekStart = getWeekStartDate(today);
  const weekEnd = getWeekEndDate(today); // Use today to define the current week range

  // Get data needed for progress calculation
  // --- THIS IS THE CRITICAL CALL ---
  const weekActivities = getWeekActivities(weekStart, weekEnd); // Activities so far this week from Form Responses
  // --- ENSURE getWeekActivities is defined correctly in this file or another ---

  const activityData = getActivityDataCached();
   let streakData = {};
   try {
      streakData = trackActivityStreaks(); // Current streaks
   } catch(e) { Logger.log("Error fetching streaks during goal progress check: " + e); }


  const goalsWithProgress = activeGoals.map(goal => {
    let progress = { ...goal, currentValue: 0, targetValue: 0, percentComplete: 0, remainingValue: 0 }; // Add progress fields
    const params = goal.params || {};

    try { // Wrap calculation in try/catch per goal
        switch (goal.type) {
          case 'category_count':
            if (params.category && params.target > 0) {
              progress.targetValue = params.target;
              progress.currentValue = weekActivities.filter(act => activityData.categories[act.name] === params.category).length;
              progress.percentComplete = Math.min(100, Math.round((progress.currentValue / progress.targetValue) * 100));
              progress.remainingValue = Math.max(0, progress.targetValue - progress.currentValue);
            }
            break;

          case 'negative_limit':
            if (params.limit !== undefined) { // Target is the max allowed negative points
              progress.targetValue = params.limit;
              progress.currentValue = weekActivities.reduce((sum, act) => act.points < 0 ? sum + Math.abs(act.points) : sum, 0); // Sum of absolute negative points this week
              const prevNegative = params.previous || 0; // Previous week's total negative points
              const targetReduction = Math.max(0, prevNegative - params.limit); // How much reduction is needed
              const currentReduction = Math.max(0, prevNegative - progress.currentValue); // How much reduction achieved so far
              // Calculate percentage based on reduction achieved vs target reduction
              progress.percentComplete = targetReduction > 0 ? Math.min(100, Math.round((currentReduction / targetReduction) * 100)) : (progress.currentValue <= params.limit ? 100 : 0); // If target is 0 or less, 100% if current is within limit
              progress.remainingValue = Math.max(0, params.limit - progress.currentValue); // How much 'budget' is left under the limit
            }
            break;

          case 'streak_maintain':
            if (params.activity && params.target > 0) {
              progress.targetValue = params.target;
              // Check current streak length from fetched streakData
              progress.currentValue = (streakData.streaks && streakData.streaks[params.activity]) || 0;
              progress.percentComplete = Math.min(100, Math.round((progress.currentValue / progress.targetValue) * 100));
              progress.remainingValue = Math.max(0, progress.targetValue - progress.currentValue);
            }
            break;

          case 'streak_start':
            if (params.target > 0) {
              progress.targetValue = params.target;
              // Find the longest *current* streak (either full or building)
              let longestCurrentStreak = 0;
              if(streakData.streaks) {
                  for(const act in streakData.streaks) {
                     if(streakData.streaks[act] > longestCurrentStreak) longestCurrentStreak = streakData.streaks[act];
                  }
              }
              if(streakData.buildingStreaks && Object.keys(streakData.buildingStreaks).length > 0) {
                   longestCurrentStreak = Math.max(longestCurrentStreak, 2); // Building streak is 2 days
              }
              progress.currentValue = longestCurrentStreak;
              progress.percentComplete = Math.min(100, Math.round((progress.currentValue / progress.targetValue) * 100));
              progress.remainingValue = Math.max(0, progress.targetValue - progress.currentValue);
            }
            break;

           case 'activity_count': // For goals like "No Spend Days"
               if (params.activity && params.target > 0) {
                   progress.targetValue = params.target;
                   // Count occurrences of this specific activity in the week's activities
                   progress.currentValue = weekActivities.filter(act => act.name === params.activity).length;
                   progress.percentComplete = Math.min(100, Math.round((progress.currentValue / progress.targetValue) * 100));
                   progress.remainingValue = Math.max(0, progress.targetValue - progress.currentValue);
               }
               break;

          default:
            progress.percentComplete = 0; // Default for unknown types
            Logger.log(`Unknown goal type "${goal.type}" encountered during progress check for goal ID ${goal.id}.`);
        }
     } catch (calcError) {
         Logger.log(`Error calculating progress for goal ID ${goal.id}: ${calcError}\nParams: ${JSON.stringify(params)}`);
         progress.percentComplete = 0; // Indicate error state?
         progress.description += " (Error calculating progress)";
     }

    // Determine if goal is completed based on progress (don't update sheet here)
    let isConsideredComplete = progress.percentComplete >= 100;
     // Special check for negative_limit: goal is met if current negative points are *less than or equal to* the limit
    if (goal.type === 'negative_limit') {
        isConsideredComplete = progress.currentValue <= progress.targetValue;
        // Recalculate percent complete to reflect 100% if condition met
        progress.percentComplete = isConsideredComplete ? 100 : progress.percentComplete;
    }
    progress.completed = isConsideredComplete; // Set completed status based on calculation for email display

    return progress;
  });

  return goalsWithProgress;
}


/**
 * Updates the 'Completed' status for a specific goal row in the Weekly Goals sheet.
 * @param {number} rowIndex The row number of the goal to mark complete.
 */
function markGoalAsComplete(rowIndex) {
   const ss = SpreadsheetApp.getActiveSpreadsheet();
   const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.WEEKLY_GOALS);
   if(sheet && rowIndex >= 2) {
      try {
          const cell = sheet.getRange(rowIndex, 5); // Column E is 'Completed' checkbox
          if (cell.getValue() !== true) { // Avoid redundant updates
              cell.setValue(true);
              Logger.log(`Marked goal on row ${rowIndex} as complete.`);
          }
      } catch (e) {
          Logger.log(`Error marking goal on row ${rowIndex} as complete: ${e}`);
      }
   }
}


/**
 * Checks active goals at the end of the week, marks completed ones, and calculates total bonus points.
 * This should be called by the weekly digest or a separate end-of-week trigger.
 * @return {object} { completedGoals: Array<object>, totalBonusPoints: number }
 */
function finalizeWeeklyGoals() {
  const goalsWithProgress = checkWeeklyGoalProgressWithDetails(); // Get current status including calculated completion
  const completedGoalsInfo = [];
  let totalBonusPointsEarned = 0;

  goalsWithProgress.forEach(goal => {
    // Use the 'completed' status calculated by checkWeeklyGoalProgressWithDetails
    if (goal.completed === true) {
      // Mark it complete in the sheet (if not already marked)
      markGoalAsComplete(goal.row);
      totalBonusPointsEarned += goal.bonusPoints || 0;
      completedGoalsInfo.push({
         name: goal.name,
         bonusPoints: goal.bonusPoints
      });
       // Logger.log(`Finalized goal "${goal.name}" as complete. Awarded ${goal.bonusPoints} points.`); // Reduce log noise here
    } else if (goal.completed === false) {
        // Optionally ensure the checkbox is UNCHECKED if progress shows incomplete?
        // This handles manual errors or recalculations.
        // unmarkGoalAsComplete(goal.row); // Need to implement unmarkGoalAsComplete if desired
    }
  });

  Logger.log(`Weekly goal finalization complete. ${completedGoalsInfo.length} goals completed for ${totalBonusPointsEarned} bonus points.`);
  return {
    completedGoals: completedGoalsInfo,
    totalBonusPoints: totalBonusPointsEarned
  };
}

// Optional helper to unmark goals if needed
// function unmarkGoalAsComplete(rowIndex) {
//    const ss = SpreadsheetApp.getActiveSpreadsheet();
//    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.WEEKLY_GOALS);
//    if(sheet && rowIndex >= 2) {
//       try {
//           const cell = sheet.getRange(rowIndex, 5); // Column E
//           if (cell.getValue() === true) { // Only uncheck if currently checked
//               cell.setValue(false);
//               Logger.log(`Unmarked goal on row ${rowIndex} as incomplete based on progress.`);
//           }
//       } catch (e) {
//           Logger.log(`Error unmarking goal on row ${rowIndex}: ${e}`);
//       }
//    }
// }
