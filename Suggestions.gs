/**
 * Suggestions Generation for Budget Game
 * Contains logic for creating smart suggestions and daily goal options for the morning email.
 */


/**
 * Generates smart activity suggestions based on recent history, game state, and weather.
 * Reads data from the Dashboard sheet.
 * @param {object} weatherData Optional weather data to influence suggestions
 * @return {Array<object>} An array of suggestion objects { text: string, activity: string|null }
 */
function generateSmartSuggestions(weatherData) {
  const suggestions = [];
  const ss = SpreadsheetApp.getActiveSpreadsheet(); // Needed for sheet access in helpers
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);


  if (!dashboardSheet) {
    Logger.log("Suggestion Engine: Dashboard sheet not found.");
    return [];
  }


  try {
    const activityData = getActivityDataCached(); // Use cached data
    if (Object.keys(activityData.pointValues).length === 0) {
      Logger.log("Suggestion Engine: No activity data loaded. Cannot generate suggestions.");
      return [];
    }


    // Fetch recent history from Dashboard (Date, Points, Activities String)
    const recentHistory = getRecentDashboardData(dashboardSheet, 7); // Get last 7 days


    // Get activities logged today (to avoid suggesting something already done)
    // Pass categories map to ensure only valid activities are returned
    const loggedToday = getActivitiesLoggedOn(today, recentHistory, activityData.categories);


    // Get current streak data
    let streaks = {};
    try { streaks = trackActivityStreaks() } catch(e) { Logger.log("Error fetching streaks for suggestions: " + e)}


    // --- Weather-Specific Rules ---
    if (weatherData) {
      // Weather-appropriate suggestions get priority
      if (weatherData.isRaining || weatherData.isSnowing) {
        // Indoor activities for bad weather
        const indoorActivities = ["Home made dinner", "Eat leftovers", "Declutter one area", "Clean bathroom"];
        for (const activity of indoorActivities) {
          if (activityData.pointValues[activity] && !loggedToday.includes(activity) && suggestions.length < CONFIG.SUGGESTION_SETTINGS.MAX_SUGGESTIONS) {
            let text = weatherData.isRaining ? 
              `Rainy day perfect for staying in and ${activity.toLowerCase()}.` : 
              `Snowy weather outside - great opportunity to ${activity.toLowerCase()}.`;
            suggestions.push({ text: text, activity: activity });
          }
        }
      } else if (weatherData.isClear && !weatherData.isHot && !weatherData.isCold) {
        // Outdoor/health activities for nice weather
        const outdoorFriendlyActivities = ["Exercise for 30 minutes", "Take a stretch break during work", "Walk the dog"];
        for (const activity of outdoorFriendlyActivities) {
          if (activityData.pointValues[activity] && !loggedToday.includes(activity) && suggestions.length < CONFIG.SUGGESTION_SETTINGS.MAX_SUGGESTIONS) {
            suggestions.push({ 
              text: `Beautiful weather today! Perfect time to ${activity.toLowerCase()}.`, 
              activity: activity 
            });
            break; // Just add one outdoor activity
          }
        }
      } else if (weatherData.isHot) {
        // Hot weather suggestions
        const hotWeatherActivities = ["Drink water instead of sugary drinks all day", "Home made dinner"];
        for (const activity of hotWeatherActivities) {
          if (activityData.pointValues[activity] && !loggedToday.includes(activity) && suggestions.length < CONFIG.SUGGESTION_SETTINGS.MAX_SUGGESTIONS) {
            let text = activity === "Drink water instead of sugary drinks all day" ? 
              "Hot day ahead! Stay hydrated with water instead of buying cold drinks outside." :
              "Too hot to cook? Prepare something simple at home rather than ordering delivery.";
            suggestions.push({ text: text, activity: activity });
            break;
          }
        }
      }
    }


    // --- Rule Engine (Customize and add more rules!) ---


    // Rule 1: Time-based Planning (Sunday Budget Review)
    const budgetActivity = "Weekly budget review/planning session";
    if (dayOfWeek === 0 && !loggedToday.includes(budgetActivity) && activityData.pointValues[budgetActivity] && suggestions.length < CONFIG.SUGGESTION_SETTINGS.MAX_SUGGESTIONS) { // Check if activity exists
      suggestions.push({ text: "Plan your budget and meals for the week ahead.", activity: budgetActivity });
    }


    // Rule 2: Recency - Suggest missed positive habits
    const positiveHabitsToCheck = ["Exercise for 30 minutes", "Get 7+ hours of sleep", "Walk the dog", "Take a stretch break during work"];
    for (const habit of positiveHabitsToCheck) {
      if (suggestions.length >= CONFIG.SUGGESTION_SETTINGS.MAX_SUGGESTIONS) break;
      if (activityData.pointValues[habit] && !wasActivityLoggedRecently(habit, recentHistory, CONFIG.SUGGESTION_SETTINGS.RECENCY_DAYS_THRESHOLD) && !loggedToday.includes(habit)) {
        suggestions.push({ text: `Been a few days since you logged '${habit}'. Give it a go today?`, activity: habit });
      }
    }


    // Rule 3: Streak Building/Maintenance
    const buildingStreaks = streaks.buildingStreaks || {};
    const fullStreaks = streaks.streaks || {};
    const buildingStreakActivity = Object.keys(buildingStreaks)[0]; // Get first building streak


    if (buildingStreakActivity && !loggedToday.includes(buildingStreakActivity) && suggestions.length < CONFIG.SUGGESTION_SETTINGS.MAX_SUGGESTIONS) {
      suggestions.push({ text: `Keep your ${buildingStreakActivity} streak going! Log it today to make it 3 days.`, activity: buildingStreakActivity });
    } else if (suggestions.length < CONFIG.SUGGESTION_SETTINGS.MAX_SUGGESTIONS) {
      // If no building streak, suggest maintaining the longest current streak
      const longestStreakActivity = Object.keys(fullStreaks).sort((a, b) => (fullStreaks[b] || 0) - (fullStreaks[a] || 0))[0];
      if (longestStreakActivity && !loggedToday.includes(longestStreakActivity) && fullStreaks[longestStreakActivity] >= 3) {
        suggestions.push({ text: `Maintain your ${longestStreakActivity} streak! (${fullStreaks[longestStreakActivity]} days strong)`, activity: longestStreakActivity });
      }
    }


    // Rule 4: Negative Pattern Interruption (Example: Frequent Eating Out/Delivery)
    const highSpendActivities = ["Order food for delivery", "Go out to dinner"];
    const mealPrepActivities = ["Home made dinner", "Eat leftovers", "Pack lunch for work/school"];
    let recentHighSpendCount = 0;
    highSpendActivities.forEach(negAct => {
       if (activityData.pointValues[negAct]) { // Check if activity exists
           recentHighSpendCount += countActivityFrequency(negAct, recentHistory, 7);
       }
    });
    // Check if *any* meal prep activity exists and hasn't been logged today
    const canSuggestMealPrep = mealPrepActivities.some(prepAct => activityData.pointValues[prepAct]) &&
                               !mealPrepActivities.some(prepAct => loggedToday.includes(prepAct));
    if (recentHighSpendCount >= 2 && canSuggestMealPrep && suggestions.length < CONFIG.SUGGESTION_SETTINGS.MAX_SUGGESTIONS) {
       const suggestedPrep = mealPrepActivities.find(prepAct => activityData.pointValues[prepAct]);
       if (suggestedPrep) {
           suggestions.push({ text: "Frequent orders lately? Try making dinner at home or eating leftovers tonight!", activity: suggestedPrep });
       }
    }


    // Rule 5: House Cleaning Nudge (Example: If no household logged in 3 days)
    const householdCategory = "Household"; // Assuming category name is exactly this
    const recentHousehold = recentHistory.some(row => {
        if (row[0] instanceof Date && formatDateYMD(row[0]) >= formatDateYMD(new Date(Date.now() - CONFIG.SUGGESTION_SETTINGS.RECENCY_DAYS_THRESHOLD * 864e5)) && row[2]){
            // Check if any activity in the string belongs to the Household category
            return (row[2] || "").split(", ").some(entry => {
                // Extract activity name robustly
                const match = entry.match(/[➕➖]\s(.+?)\s(\(🔥\d+\))?\s\([+-]/);
                return match && match[1] && activityData.categories[match[1].trim()] === householdCategory;
            });
        }
        return false;
    });
    const householdActivities = Object.keys(activityData.pointValues).filter(a => activityData.categories[a] === householdCategory);
    if (!recentHousehold && householdActivities.length > 0 && suggestions.length < CONFIG.SUGGESTION_SETTINGS.MAX_SUGGESTIONS) {
        const randomHousehold = householdActivities[Math.floor(Math.random() * householdActivities.length)];
        suggestions.push({ text: "Tackle a quick household chore today?", activity: randomHousehold });
    }




    // --- Filter & Limit ---
    // Ensure suggestions are unique based on the activity suggested
    const uniqueSuggestions = [...new Map(suggestions.filter(s => s.activity).map(item => [item.activity, item])).values()];
    // Add non-activity specific suggestions if space allows
     suggestions.filter(s => !s.activity).forEach(s => {
        if (uniqueSuggestions.length < CONFIG.SUGGESTION_SETTINGS.MAX_SUGGESTIONS) {
            if (!uniqueSuggestions.some(us => us.text === s.text)) { // Avoid duplicate text suggestions
                uniqueSuggestions.push(s);
            }
        }
     });


    Logger.log(`Generated ${uniqueSuggestions.length} smart suggestions.`);
    return uniqueSuggestions.slice(0, CONFIG.SUGGESTION_SETTINGS.MAX_SUGGESTIONS);


  } catch (e) {
    Logger.log(`Error generating suggestions: ${e}\nStack: ${e.stack}`);
    return []; // Return empty array on error
  }
}




/**
 * Generates a few potential daily goal options/challenges for the morning email.
 * These are informational ideas, not formally tracked goals.
 * @param {object} weatherData Optional weather data to influence suggestions
 * @return {Array<object>} An array of goal option objects { text: string, points: number|null }
 */
function generateDailyGoalOptions(weatherData) {
  const options = [];


  try {
    const activityData = getActivityDataCached();
    if (Object.keys(activityData.pointValues).length === 0) return []; // Need activities


    const allActivities = Object.keys(activityData.pointValues);
    // Use CONFIG.CATEGORIES for filtering
    const achievementCategory = CONFIG.CATEGORIES.find(c => c === "Achievement") || "Achievement"; // Default if not found
    const householdCategory = CONFIG.CATEGORIES.find(c => c === "Household") || "Household";
    const healthCategory = CONFIG.CATEGORIES.find(c => c === "Health") || "Health";
    const financialCategory = CONFIG.CATEGORIES.find(c => c === "Financial Planning") || "Financial Planning";
    const mealPlanCategory = CONFIG.CATEGORIES.find(c => c === "Meal Planning") || "Meal Planning";
    const disciplineCategory = CONFIG.CATEGORIES.find(c => c === "Self-Discipline") || "Self-Discipline";




    const positiveActivities = allActivities.filter(a => activityData.pointValues[a] > 0 && activityData.categories[a] !== achievementCategory);
    const householdActivities = allActivities.filter(a => activityData.categories[a] === householdCategory);
    const healthActivities = allActivities.filter(a => activityData.categories[a] === healthCategory);
    const financialActivities = allActivities.filter(a => activityData.categories[a] === financialCategory);
    const mealPlanActivities = allActivities.filter(a => activityData.categories[a] === mealPlanCategory);
    const disciplineActivities = allActivities.filter(a => activityData.categories[a] === disciplineCategory);


    // --- Weather-Based Goal Ideas ---
    if (weatherData && options.length < CONFIG.DAILY_GOAL_OPTIONS_COUNT) {
      if (weatherData.isRaining || weatherData.isSnowing) {
        // Indoor goals for bad weather
        const weatherText = weatherData.isRaining ? "rainy" : "snowy";
        
        // Meal planning goal for bad weather
        const mealActivity = mealPlanActivities.find(a => ["Home made dinner", "Eat leftovers"].includes(a));
        if (mealActivity) {
          const points = activityData.pointValues[mealActivity];
          options.push({ 
            text: `${weatherText.charAt(0).toUpperCase() + weatherText.slice(1)} day challenge: Skip delivery and prepare food at home.`, 
            points: points 
          });
        }
        
        // Household goal for bad weather
        const householdActivity = householdActivities[Math.floor(Math.random() * householdActivities.length)];
        if (householdActivity && options.length < CONFIG.DAILY_GOAL_OPTIONS_COUNT) {
          const points = activityData.pointValues[householdActivity];
          options.push({ 
            text: `Use this ${weatherText} day to tackle an indoor project: '${householdActivity}'.`, 
            points: points 
          });
        }
      } else if (weatherData.isClear && !weatherData.isHot && !weatherData.isCold) {
        // Nice weather goals
        const healthActivity = healthActivities.find(a => ["Exercise for 30 minutes", "Take a stretch break during work", "Walk the dog"].includes(a));
        if (healthActivity) {
          const points = activityData.pointValues[healthActivity];
          options.push({ 
            text: `Beautiful weather alert! Take advantage with some outdoor movement like '${healthActivity}'.`, 
            points: points 
          });
        }
        
        // Spending challenge for nice weather
        const noSpendActivity = "Spend zero money in a day";
        if (activityData.pointValues[noSpendActivity] && options.length < CONFIG.DAILY_GOAL_OPTIONS_COUNT) {
          options.push({ 
            text: `Great day to enjoy the outdoors without spending! Try a 'No Spend Day'.`, 
            points: activityData.pointValues[noSpendActivity] 
          });
        }
      } else if (weatherData.isHot) {
        // Hot weather goals
        const waterActivity = "Drink water instead of sugary drinks all day";
        if (activityData.pointValues[waterActivity] && options.length < CONFIG.DAILY_GOAL_OPTIONS_COUNT) {
          options.push({ 
            text: `Beat the heat challenge: Stay hydrated with water all day instead of buying cold drinks.`, 
            points: activityData.pointValues[waterActivity] 
          });
        }
      }
    }



    // --- Option Ideas ---


    // Idea 1: Category Focus (Pick one or two relevant categories randomly)
    const potentialCategories = [];
    if (healthActivities.length > 0) potentialCategories.push({ category: healthCategory, activities: healthActivities });
    if (householdActivities.length > 0) potentialCategories.push({ category: householdCategory, activities: householdActivities });
    if (financialActivities.length > 0) potentialCategories.push({ category: financialCategory, activities: financialActivities });
    if (mealPlanActivities.length > 0) potentialCategories.push({ category: mealPlanCategory, activities: mealPlanActivities });
    if (disciplineActivities.length > 0) potentialCategories.push({ category: disciplineCategory, activities: disciplineActivities });


    if (potentialCategories.length > 0 && options.length < CONFIG.DAILY_GOAL_OPTIONS_COUNT) {
        potentialCategories.sort(() => 0.5 - Math.random()); // Shuffle categories
        const focusCategory = potentialCategories[0];
        // Suggest logging *any* activity from that category
        options.push({ text: `Focus on ${focusCategory.category}: Log at least 1 related activity.`, points: 1 }); // Conceptual bonus point idea
    }




    // Idea 2: Specific Positive Action (Different from category focus if possible)
    if (positiveActivities.length > 0 && options.length < CONFIG.DAILY_GOAL_OPTIONS_COUNT) {
       let attempts = 0;
       let added = false;
       while(attempts < 5 && !added) { // Try a few times to find one not already suggested
          const randomPositive = positiveActivities[Math.floor(Math.random() * positiveActivities.length)];
          // Check if this activity's category was already suggested
          const alreadySuggestedCategory = options.some(opt => opt.text.includes(activityData.categories[randomPositive] || "____"));
          if (!alreadySuggestedCategory) {
             const points = activityData.pointValues[randomPositive];
             options.push({ text: `Try accomplishing this: '${randomPositive}'`, points: points });
             added = true;
          }
          attempts++;
       }
       // If still not added, just add any random positive one
       if (!added && options.length < CONFIG.DAILY_GOAL_OPTIONS_COUNT) {
           const randomPositive = positiveActivities[Math.floor(Math.random() * positiveActivities.length)];
           const points = activityData.pointValues[randomPositive];
           options.push({ text: `Try accomplishing this: '${randomPositive}'`, points: points });
       }
    }


    // Idea 3: Spending Focus
    const noSpendActivity = "Spend zero money in a day";
    if (activityData.pointValues[noSpendActivity] && options.length < CONFIG.DAILY_GOAL_OPTIONS_COUNT) {
       options.push({ text: `Aim for a 'No Spend Day' (excluding absolute essentials).`, points: activityData.pointValues[noSpendActivity] });
    } else if (options.length < CONFIG.DAILY_GOAL_OPTIONS_COUNT) {
        // Fallback if 'No Spend Day' doesn't exist
        options.push({ text: `Be mindful of spending - avoid unnecessary purchases.`, points: null });
    }


    // Idea 4: Simple Point Target
    if (options.length < CONFIG.DAILY_GOAL_OPTIONS_COUNT) {
      const targetPoints = 3 + Math.floor(Math.random() * 3); // e.g., 3, 4, or 5 points
      options.push({ text: `Earn at least +${targetPoints} points from positive actions today.`, points: null });
    }


    // Idea 5: Avoid a common negative
    const commonNegative = "Starbucks/coffee/fast snack"; // Example
     if (activityData.pointValues[commonNegative] && options.length < CONFIG.DAILY_GOAL_OPTIONS_COUNT) {
         options.push({ text: `Challenge: Avoid '${commonNegative}' today.`, points: null });
     }




    // --- Select & Return ---
    // Shuffle again to ensure variety in the top N picks
    options.sort(() => 0.5 - Math.random());
    Logger.log(`Generated ${options.slice(0, CONFIG.DAILY_GOAL_OPTIONS_COUNT).length} daily goal options.`);
    return options.slice(0, CONFIG.DAILY_GOAL_OPTIONS_COUNT);


   } catch (e) {
      Logger.log(`Error generating daily goal options: ${e}\nStack: ${e.stack}`);
      return [];
   }
}




// --- Helper Functions for Suggestions (Used by generateSmartSuggestions) ---


/**
 * Fetches Date (A), Points (B), and Activities (C) columns from Dashboard for the last N days.
 * @param {Sheet} dashboardSheet The dashboard sheet object.
 * @param {number} days Number of days history to fetch (including today).
 * @return {Array<Array>} Array of rows [Date, Points, ActivitiesString]
 */
function getRecentDashboardData(dashboardSheet, days) {
  if (!dashboardSheet) return [];


  const endRow = dashboardSheet.getLastRow();
  if (endRow < 2) return []; // No data


  // Fetch a bit more than needed to be safe, then filter by date
  // Ensure we don't try to start before row 2
  const rowsToFetch = Math.min(endRow - 1, days * 2 + 5); // Estimate, max available rows
  const startRow = Math.max(2, endRow - rowsToFetch + 1);
  const numRows = endRow - startRow + 1;


  if (numRows <= 0) return []; // Avoid invalid range


  try {
    const range = dashboardSheet.getRange(startRow, 1, numRows, 3); // Columns A, B, C
    const values = range.getValues();


    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days + 1); // Get data for 'days' days ago up to today
    cutoffDate.setHours(0, 0, 0, 0);


    // Filter ensures we only get valid dates within the desired range
    return values.filter(row => row[0] instanceof Date && row[0] >= cutoffDate);


  } catch (e) {
     Logger.log(`Error in getRecentDashboardData: ${e}`);
     return [];
  }
}


/**
 * Extracts unique activity names logged on a specific date from historical data (Dashboard).
 * @param {Date} date The date to check.
 * @param {Array<Array>} history Array of rows from getRecentDashboardData [Date, Points, ActivitiesString].
 * @param {object} categoriesMap The activity->category mapping from activityData.categories.
 * @return {Array<string>} An array of unique activity names logged on that date.
 */
function getActivitiesLoggedOn(date, history, categoriesMap) {
  const formattedDate = formatDateYMD(date);
  const loggedActivities = new Set(); // Use a Set for automatic uniqueness


  history.forEach(row => {
    // Check if the row's date matches the target date
    if (row[0] instanceof Date && formatDateYMD(row[0]) === formattedDate) {
      const activitiesStr = row[2] || ""; // Activities are in the 3rd column (index 2)
      if (activitiesStr) {
        const activitiesList = activitiesStr.split(", ");
        activitiesList.forEach(activityEntry => {
          // Extract activity name (tolerant of optional streak text)
          const match = activityEntry.match(/[➕➖]\s(.+?)\s(\(🔥\d+\))?\s\([+-]/);
          if (match && match[1]) {
            const activityName = match[1].trim();
            // Verify it's a known activity before adding
            if (categoriesMap[activityName] !== undefined) {
              loggedActivities.add(activityName);
            } else {
               // Logger.log(`Activity "${activityName}" from dashboard log not found in categories map.`); // Reduce log noise
            }
          }
        });
      }
    }
  });
  return Array.from(loggedActivities); // Return as an array
}


/**
 * Checks if a specific activity was logged within the last N days (excluding today) using Dashboard history.
 * @param {string} activityName The name of the activity to check.
 * @param {Array<Array>} history Array of rows from getRecentDashboardData [Date, Points, ActivitiesString].
 * @param {number} days How many past days to check.
 * @return {boolean} True if the activity was logged recently, false otherwise.
 */
function wasActivityLoggedRecently(activityName, history, days) {
  const today = new Date();
  const formattedToday = formatDateYMD(today);


  // Calculate the cutoff date (N days ago)
  const cutoffDate = new Date();
  cutoffDate.setDate(today.getDate() - days);
  cutoffDate.setHours(0, 0, 0, 0);


  // Check rows from history
  for (const row of history) {
    const rowDate = row[0];
    // Ensure it's a valid date, within the cutoff, AND not today
    if (rowDate instanceof Date && rowDate >= cutoffDate && formatDateYMD(rowDate) !== formattedToday) {
      const activitiesStr = row[2] || ""; // Activities are in the 3rd column (index 2)
      // Use a regex to check for the activity name, avoiding partial matches
      // Escape special characters in activityName for regex
      const escapedActivityName = activityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Regex looks for the name preceded by the symbol and space, followed by space and parenthesis, allows streak text
      const regex = new RegExp(`[➕➖]\\s${escapedActivityName}\\s(\\(🔥\\d+\\))?\\s\\([+-]`);
      if (regex.test(activitiesStr)) {
        return true; // Found the activity logged recently (but not today)
      }
    }
  }
  return false; // Activity not found in the recent period (excluding today)
}


/**
 * Counts the total occurrences of a specific activity within the provided Dashboard history (over N days).
 * @param {string} activityName The name of the activity to count.
 * @param {Array<Array>} history Array of rows from getRecentDashboardData [Date, Points, ActivitiesString].
 * @param {number} days Number of days the history covers (used for logging/context only).
 * @return {number} The total count of the activity occurrences.
 */
function countActivityFrequency(activityName, history, days) {
  let count = 0;
  // Escape special characters in activityName for regex
  const escapedActivityName = activityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Regex looks for the name preceded by the symbol and space, followed by space and parenthesis, allows streak text
  const regex = new RegExp(`[➕➖]\\s${escapedActivityName}\\s(\\(🔥\\d+\\))?\\s\\([+-]`, "g"); // Use 'g' flag to find all occurrences


  history.forEach(row => {
    const activitiesStr = row[2] || ""; // Activities are in the 3rd column (index 2)
    const matches = activitiesStr.match(regex);
    if (matches) {
      count += matches.length;
    }
  });
  // Logger.log(`Counted ${count} occurrences of "${activityName}" in the last ${days} days (from Dashboard).`);
  return count;
}
