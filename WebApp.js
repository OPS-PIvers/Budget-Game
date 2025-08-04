// WebApp.gs
/**
 * Budget Game Web App Controller (Streamlined)
 * Handles serving the UI and acts as API layer between UI and backend logic.
 */

/**
 * Serves the web app HTML UI based on the page parameter.
 * @param {object} e The event parameter from the GET request.
 * @return {HtmlOutput} The HTML service output.
 */
function doGet(e) {
  const view = e.parameter.view;

  if (view === 'admin') {
    if (!isCurrentUserAdmin()) {
       return HtmlService.createHtmlOutput('<!DOCTYPE html><html><head><title>Access Denied</title></head><body>Access Denied. Admin privileges required.</body></html>');
    }
    return HtmlService.createTemplateFromFile('Admin')
      .evaluate()
      .setTitle('Budget Game Admin')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (view === 'dashboard') {
    return HtmlService.createTemplateFromFile('Dashboard')
      .evaluate()
      .setTitle('Budget Game Dashboard')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (view === 'expense') {
    return HtmlService.createTemplateFromFile('ExpenseTracker')
      .evaluate()
      .setTitle('Budget Game Expense Tracker')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Default to the activity tracker
  return HtmlService.createTemplateFromFile('ActivityTracker')
      .evaluate()
      .setTitle('Budget Game Tracker')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Creates a standard HTML page output.
 * @param {string} template The name of the HTML template file.
 * @param {string} title The title of the page.
 * @return {HtmlOutput} The configured HTML service output.
 */
function createPageOutput(template, title) {
  return HtmlService.createTemplateFromFile(template)
    .evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Includes an HTML file content within another HTML file. Used for CSS.
 * @param {string} filename The name of the HTML file to include (e.g., 'Stylesheet').
 * @return {string} The HTML content of the included file.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Gets the script URL for use in HTML templates.
 * @return {string} The deployment URL of the web app.
 */
function getScriptUrl() {
  try {
     return ScriptApp.getService().getUrl();
  } catch (e) {
     // If called in a context without a deployment (e.g., editor)
     Logger.log("getScriptUrl called outside of deployment context. Returning placeholder.");
     return "#"; // Return a placeholder or handle appropriately
  }
}

/**
 * Gets client-side configuration data needed by the web app interface.
 * Called by HTML templates to inject CONFIG data into client-side JavaScript.
 * @return {Object} Configuration object with client-needed settings.
 */
function getClientConfig() {
  return {
    HOUSEHOLD_SETTINGS: {
      ENABLED: CONFIG.HOUSEHOLD_SETTINGS.ENABLED
    },
    SHEET_NAMES: CONFIG.SHEET_NAMES,
    CATEGORIES: CONFIG.CATEGORIES
  };
}


/**
 * Gets all data needed for the web app in a single call to improve performance.
 * This function consolidates multiple data fetching functions into one server roundtrip.
 * It uses CacheService to cache the consolidated data on a per-user/household basis.
 * @return {Object} A consolidated data object for the entire web app.
 */
function getConsolidatedData() {
  const email = Session.getEffectiveUser().getEmail();
  const householdId = getUserHouseholdId(email);
  // Use a hash of the email for cache key to avoid collisions and information leakage
  const cacheKey = `consolidatedData_v2_${householdId || hashEmail(email)}`;
  const cache = CacheService.getUserCache();

  try {
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      const data = JSON.parse(cachedData);
      // Check if the cache is recent enough (e.g., within 5 minutes)
      const age = (new Date().getTime() - (data.timestamp || 0)) / 1000;
      if (age < CACHE_EXPIRY_SECONDS) {
         Logger.log(`Returning consolidated data from cache for key: ${cacheKey}`);
         return data;
      }
    }
  } catch (e) {
    Logger.log(`Error reading from cache for key ${cacheKey}: ${e}`);
  }

  Logger.log(`Fetching fresh consolidated data for key: ${cacheKey}`);

  // Fetch all data components
  const clientConfig = getClientConfig();
  const webAppActivityData = _getWebAppActivityData();
  const todayData = _getTodayData();
  const weekData = _getWeekData();
  const historicalData = _getHistoricalData();
  const weeklyGoalsData = _getWeeklyGoalsData();
  const goalAchievementHistory = _getGoalAchievementHistory();
  const detailedGoalData = _getDetailedGoalData();
  const expenseTrackerData = _getExpenseTrackerData();

  // Assemble the consolidated object
  const consolidatedData = {
    success: true, // Add a success flag for client-side checks
    clientConfig: clientConfig,
    webAppActivityData: webAppActivityData,
    todayData: todayData,
    weekData: weekData,
    historicalData: historicalData,
    weeklyGoalsData: weeklyGoalsData,
    goalAchievementHistory: goalAchievementHistory,
    detailedGoalData: detailedGoalData,
    expenseTrackerData: expenseTrackerData,
    timestamp: new Date().getTime() // For cache age debugging
  };

  try {
    // Cache the fresh data for 5 minutes (300 seconds)
    cache.put(cacheKey, JSON.stringify(consolidatedData), CACHE_EXPIRY_SECONDS);
    Logger.log(`Stored fresh consolidated data in cache for key: ${cacheKey}`);
  } catch (e) {
    Logger.log(`Error writing to cache for key ${cacheKey}: ${e}`);
  }

  return consolidatedData;
}


// --- Functions Called by Client-Side JavaScript ---

/**
 * Gets all activity data from Points Reference sheet via cache AND the CURRENT category order.
 * Called by ActivityTracker.html.
 * @return {Object} Object containing { activityData: { pointValues, categories }, categoriesList: Array<string> }.
 */
function _getWebAppActivityData() {
  // getActivityDataCached is in DataProcessing.gs
  const activityData = getActivityDataCached();
  // Get the potentially custom category order
  const categoryOrder = getCurrentCategoryOrder(); // From Utilities.gs

  return {
      activityData: activityData,
      categoriesList: categoryOrder // Send the ORDERED list to the client
  };
}

/**
 * Gets the current day's points and activities for the user's household
 * by reading the Dashboard sheet.
 * Called by ActivityTracker.html.
 * @return {Object} Current day totals and activities for the household { points, activities, householdId, householdName, members }.
 */
function _getTodayData() {
  const today = new Date();
  const formattedDate = formatDateYMD(today); // Utility function

  // Get current user's email and household info
  const email = Session.getEffectiveUser().getEmail();
  const householdId = getUserHouseholdId(email); // From HouseholdManagement.gs
  let householdEmails = [];
  let householdName = null;

  if (householdId && CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
    householdEmails = getHouseholdEmails(householdId); // From HouseholdManagement.gs
    householdName = getHouseholdName(householdId);   // From HouseholdManagement.gs
    // Logger.log(`getTodayData: Found ${householdEmails.length} members in household ${householdId} for ${email}`);
  } else {
    householdEmails = [email]; // Use individual email if no household or households disabled
    // Logger.log(`getTodayData: No household found or households disabled for ${email}, using individual data`);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);

  let todayPoints = 0;
  const activitiesMap = new Map(); // Use a Map to deduplicate activities for display

  if (!dashboardSheet) {
      Logger.log("getTodayData: Dashboard sheet not found.");
      // Return structure expected by client, indicating household info even if sheet missing
      return { points: 0, activities: [], householdId: householdId, householdName: householdName, members: householdEmails };
  }

  const lastRow = dashboardSheet.getLastRow();
  if (lastRow > 1) {
    // Read Dashboard: Date(A), Points(B), Activities(C), Email(G)
    const data = dashboardSheet.getRange(2, 1, lastRow - 1, 7).getValues(); // A2:G<lastRow>

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowDate = row[0];
      const rowEmail = row[6] || ""; // Email in Col G

      // Check date and household membership
      if (rowDate instanceof Date && formatDateYMD(rowDate) === formattedDate &&
          householdEmails.some(he => he.toLowerCase() === rowEmail.toLowerCase()))
      {
        todayPoints += Number(row[1]) || 0; // Sum points from Col B

        // Process activities string from Col C to get unique list for today
        const activitiesStr = row[2] || "";
        if (activitiesStr) {
          const activitiesList = activitiesStr.split(", ");
          activitiesList.forEach(activityEntry => {
            // Extract activity name (tolerant of optional streak text)
            const match = activityEntry.match(/[➕➖]\s(.+?)\s*(?:\(🔥\d+\))?\s*\(/);
            if (match && match[1]) {
              const activityName = match[1].trim();
              if (!activitiesMap.has(activityName)) {
                  // Store basic info, points here might not reflect individual submission/streaks perfectly
                  // It's mainly for showing *what* was done today.
                  const pointsMatch = activityEntry.match(/\(([+-]\d+)\)/);
                  const points = pointsMatch ? parseInt(pointsMatch[1]) : 0;
                  activitiesMap.set(activityName, {
                      name: activityName,
                      points: points // Point value shown in the log string
                  });
              }
            }
          });
        }
      }
    }
  }

  const activities = Array.from(activitiesMap.values());
  // Logger.log(`getTodayData result for ${email}: Points=${todayPoints}, Activities=${activities.length}`);

  return {
    points: todayPoints,
    activities: activities, // List of unique activities logged today by household
    householdId: householdId,
    householdName: householdName,
    members: householdEmails // Pass member emails for display
  };
}


/**
 * Gets the current week's data for the user's household by reading the Dashboard.
 * Also calculates weekly average based on past weeks' data from Dashboard.
 * Called by ActivityTracker.html.
 * @return {Object} Weekly totals and averages { weeklyTotal, positiveCount, negativeCount, topActivity, dailyAverage, weeklyAverage, householdId, householdName }.
 */
function _getWeekData() {
  try {
    const email = Session.getEffectiveUser().getEmail();
    const householdId = getUserHouseholdId(email);
    let householdEmails = [];

    if (householdId && CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
        householdEmails = getHouseholdEmails(householdId);
    } else {
        householdEmails = [email]; // Individual or households disabled
    }
    // Logger.log(`getWeekData: Fetching for household members/user: ${householdEmails.join(', ')}`);

    // Use getHouseholdWeeklyTotals (from DataProcessing.gs) which reads the Dashboard
    const currentWeekSummary = getHouseholdWeeklyTotals(householdEmails);

    const result = {
      weeklyTotal: currentWeekSummary.total,
      positiveCount: currentWeekSummary.positive, // Use calculated counts
      negativeCount: currentWeekSummary.negative,
      topActivity: currentWeekSummary.topActivity,
      dailyAverage: 0, // Calculated below
      weeklyAverage: 0, // Calculated below
      householdId: householdId,
      householdName: householdId ? getHouseholdName(householdId) : null
    };

    // Calculate average daily points for the current week
    const today = new Date();
    const weekStartDate = getWeekStartDate(today);
    if (result.weeklyTotal !== 0) {
      const daysPassed = Math.min(7, Math.floor((today - weekStartDate) / (1000 * 60 * 60 * 24)) + 1);
      if (daysPassed > 0) {
         result.dailyAverage = Math.round((result.weeklyTotal / daysPassed) * 10) / 10;
      }
    }

    // Calculate overall weekly average from past weeks (reading Dashboard)
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
    if (dashboardSheet) {
        const lastRow = dashboardSheet.getLastRow();
        const weeklyTotalsMap = new Map(); // { weekStartDateStr: totalPoints }

        if (lastRow > 1) {
            const data = dashboardSheet.getRange(2, 1, lastRow - 1, 7).getValues(); // A:G
            data.forEach(row => {
                const dateObj = row[0];
                const rowEmail = row[6] || "";
                if (dateObj instanceof Date && dateObj.getTime() > 0 &&
                    householdEmails.some(he => he.toLowerCase() === rowEmail.toLowerCase())) {
                    const points = Number(row[1]) || 0;
                    const loopWeekStartDate = getWeekStartDate(dateObj);
                    const loopWeekStartDateStr = formatDateYMD(loopWeekStartDate);
                    // Exclude current week from average calculation
                    if (loopWeekStartDateStr < formatDateYMD(weekStartDate)) {
                       weeklyTotalsMap.set(loopWeekStartDateStr, (weeklyTotalsMap.get(loopWeekStartDateStr) || 0) + points);
                    }
                }
            });
        }
        // Calculate average from the map
        let pastWeekSum = 0;
        let pastWeekCount = 0;
        weeklyTotalsMap.forEach(total => {
            pastWeekSum += total;
            pastWeekCount++;
        });
        if (pastWeekCount > 0) {
            result.weeklyAverage = Math.round((pastWeekSum / pastWeekCount) * 10) / 10;
        }
    } else {
        Logger.log("getWeekData: Dashboard sheet not found for weekly average calc.");
    }

    // Logger.log(`getWeekData result: ${JSON.stringify(result)}`);
    return result;

  } catch (error) {
    Logger.log(`CRITICAL ERROR in getWeekData: ${error}\nStack: ${error.stack}`);
    return { weeklyTotal: 0, positiveCount: 0, negativeCount: 0, topActivity: "Error", dailyAverage: 0, weeklyAverage: 0, householdId: null, householdName: null }; // Minimal default on error
  }
}

/**
 * Processes a Web App submission, logging data to the Dashboard sheet.
 * @param {Array<string>} activities - Array of selected activity names (MUST NOT include points).
 * @param {Array<string>} skippedActivities - Array of skipped required activity names.
 * @return {Object} Result object { success, points, weeklyTotal, message, goalsUpdated?, activities? }.
 */
function processWebAppSubmission(activities, skippedActivities = []) {
  if ((!activities || !Array.isArray(activities) || activities.length === 0) && 
      (!skippedActivities || !Array.isArray(skippedActivities) || skippedActivities.length === 0)) {
    return { success: false, message: "No activities submitted" };
  }

  try {
    const activityData = getActivityDataCached(); // From DataProcessing.gs
    const timestamp = new Date();
    const email = Session.getEffectiveUser().getEmail(); // Get submitting user
    let totalPointsThisSubmission = 0;
    const processedActivities = []; // Store details of processed activities

    // Process selected activities
    if (activities && Array.isArray(activities)) {
      activities.forEach(activityName => {
        if (activityName) {
          // processActivityWithPoints expects just the name now
          const result = processActivityWithPoints(activityName, activityData);
          if (result.name) { // Check if activity was valid and processed
            totalPointsThisSubmission += result.points; // Sum the final points (incl. streaks)
            processedActivities.push(result); // Add detailed result to array
          } else {
             Logger.log(`Skipped invalid activity in submission: ${activityName}`);
          }
        }
      });
    }

    // Process skipped activities
    if (skippedActivities && Array.isArray(skippedActivities)) {
      skippedActivities.forEach(activityName => {
        if (activityName && activityData.requiredActivities && activityData.requiredActivities[activityName]) {
          // Create a negative point entry for skipped required activities
          const basePoints = activityData.pointValues[activityName] || 0;
          const negativePoints = Math.abs(basePoints) * -1;
          const skippedResult = {
            name: activityName,
            points: negativePoints,
            category: activityData.categories[activityName] || 'Unknown',
            streakInfo: { 
              originalPoints: negativePoints, 
              bonusPoints: 0, 
              totalPoints: negativePoints, 
              streakLength: 0, 
              multiplier: 1 
            }
          };
          totalPointsThisSubmission += negativePoints;
          processedActivities.push(skippedResult);
        }
      });
    }

    // Check if any valid activities were processed
    if (processedActivities.length === 0) {
        return { success: false, message: "No valid activities found in submission." };
    }

    // Update Dashboard sheet directly
    // updateDashboard is in DataProcessing.gs
    updateDashboard(timestamp, email, processedActivities, totalPointsThisSubmission);
    Logger.log(`Dashboard updated via Web App submission from ${email}. Activities: ${processedActivities.map(a=>a.name).join(',')}. Points: ${totalPointsThisSubmission}`);

    // Get the updated weekly total for the user's household AFTER the update
    const weekData = getWeekData(); // Recalculate after update
    const updatedWeeklyTotal = weekData.weeklyTotal !== undefined ? weekData.weeklyTotal : 0;


    return {
      success: true,
      points: totalPointsThisSubmission, // Points from *this* submission
      weeklyTotal: updatedWeeklyTotal, // Updated total for the week for the household
      goalsUpdated: true, // Flag for client-side dashboard to potentially refresh goal display
      activities: processedActivities, // Details of activities in this submission
      message: `Successfully logged ${processedActivities.length} activities` // Count only processed activities
    };
  } catch (error) {
    Logger.log(`Error in processWebAppSubmission: ${error}\nStack: ${error.stack}`);
    return {
      success: false,
      message: `Error processing submission: ${error.message}`
    };
  }
}


/**
 * Gets configuration settings for the admin panel, including CURRENT streak settings
 * retrieved from PropertiesService or defaults, and the CURRENT category order.
 * Called by Admin.html.
 * @return {Object} Config settings { pointsReference, streakSettings, categories, categoryOrder }.
 */
function getAdminConfigData() {
  // Ensure admin access
  if (!isCurrentUserAdmin()) {
     throw new Error("Admin privileges required.");
  }

  // Get raw points data (from DataProcessing.gs)
  const pointsRefData = getPointsReferenceData();

  // Get the *current* streak settings (from Utilities.gs - returns both cases)
  const currentStreakSettings = getCurrentStreakSettings();

  // Get the *current* category order (from Utilities.gs)
  const currentCategoryOrder = getCurrentCategoryOrder();

  // Return data needed by the Admin UI
  return {
    pointsReference: pointsRefData,        // Raw data [{activity, points, category}, ...]
    streakSettings: currentStreakSettings, // Current settings (includes both upper/lower keys)
    categories: CONFIG.CATEGORIES,         // Canonical list from config (for reference, maybe remove later?)
    categoryOrder: currentCategoryOrder    // The current display order
  };
}


/**
 * Saves updated activities to Points Reference sheet.
 * Called by Admin.html.
 * @param {Array<object>} activities - Array of activity objects { activity, points, category }.
 * @return {Object} Result object { success, message }.
 */
function saveActivitiesData(activities) {
   // Ensure admin access
   if (!isCurrentUserAdmin()) {
      return { success: false, message: "Admin privileges required." };
   }
  if (!activities || !Array.isArray(activities)) {
    return { success: false, message: "Invalid activities data" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.POINTS_REFERENCE);

    if (!sheet) {
       // Try to create it if it's missing
       sheet = setupPointsReferenceSheet(); // Use setup function to ensure it exists and get the sheet object
       if (!sheet) return { success: false, message: "Points Reference sheet could not be found or created." };
    }

    // Clear existing data (except header)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 4).clearContent();
    }

    // Write new data if any exists
    if (activities.length > 0) {
      const newData = activities.map(activity => [
        activity.activity || "", // Ensure values are not undefined/null
        activity.points === undefined || activity.points === null || isNaN(activity.points) ? 0 : Number(activity.points), // Ensure points are numeric, default 0
        activity.category || getCurrentCategoryOrder()[0] || "Uncategorized", // Default to first current category or fallback
        activity.required === true // Convert to boolean, default false
      ]);
      sheet.getRange(2, 1, newData.length, 4).setValues(newData);
      // Sort after writing
      sheet.getRange(2, 1, newData.length, 4).sort([{column: 3, ascending: true}, {column: 1, ascending: true}]);
    }

    // Clear cache to force refresh
    resetActivityDataCache(); // Use the function now in DataProcessing.gs

    return {
      success: true,
      message: `Saved ${activities.length} activities successfully`
    };
  } catch (error) {
    Logger.log(`Error saving activities: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error saving: ${error.message}` };
  }
}

/**
 * Saves updated streak settings to PropertiesService for persistence.
 * Called by Admin.html. Saves settings using standardized UPPERCASE keys.
 * @param {Object} settings - Streak settings object received from client (may contain both cases).
 * @return {Object} Result object { success, message }.
 */
function saveStreakSettings(settings) {
   if (!isCurrentUserAdmin()) {
     return { success: false, message: "Admin privileges required." };
   }

   // --- Input Validation (focus on values needed for saving) ---
   if (!settings || typeof settings !== 'object' ||
       !settings.thresholds || typeof settings.thresholds !== 'object' ||
       !settings.bonusPoints || typeof settings.bonusPoints !== 'object') {
      return { success: false, message: "Invalid settings data format received." };
   }

   // Extract values, prioritizing lowercase from client, fallback to uppercase, then NaN
   const b1Thresh = parseInt(settings.thresholds.bonus1 ?? settings.thresholds.BONUS_1 ?? NaN);
   const b2Thresh = parseInt(settings.thresholds.bonus2 ?? settings.thresholds.BONUS_2 ?? NaN);
   const multThresh = parseInt(settings.thresholds.multiplier ?? settings.thresholds.MULTIPLIER ?? NaN);
   const b1Pts = parseInt(settings.bonusPoints.bonus1 ?? settings.bonusPoints.BONUS_1 ?? NaN);
   const b2Pts = parseInt(settings.bonusPoints.bonus2 ?? settings.bonusPoints.BONUS_2 ?? NaN);

   // Check if all values are valid numbers
   if (isNaN(b1Thresh) || isNaN(b2Thresh) || isNaN(multThresh) || isNaN(b1Pts) || isNaN(b2Pts)) {
       return { success: false, message: "Invalid or missing numerical values in streak settings." };
   }
   // --- End Validation ---

   try {
       // Prepare the object to save using ONLY UPPERCASE keys
       const settingsToSave = {
           thresholds: {
               BONUS_1: b1Thresh,
               BONUS_2: b2Thresh,
               MULTIPLIER: multThresh
           },
           bonusPoints: {
               BONUS_1: b1Pts,
               BONUS_2: b2Pts
           }
       };

       const scriptProperties = PropertiesService.getScriptProperties();
       scriptProperties.setProperty('STREAK_SETTINGS', JSON.stringify(settingsToSave));
       Logger.log(`Saved streak settings to PropertiesService (UPPERCASE): ${JSON.stringify(settingsToSave)}`);

       // Clear any caches that might depend on streak settings
       resetActivityDataCache();

       return {
           success: true,
           message: "Streak settings saved successfully." // Message reflects persistence
       };
   } catch (error) {
       Logger.log(`Error saving streak settings to PropertiesService: ${error}\nStack: ${error.stack}`);
       return { success: false, message: `Error saving settings: ${error.message}` };
   }
}

/**
 * Saves the user-defined category display order to PropertiesService.
 * Called by Admin.html.
 * @param {Array<string>} orderedCategories - An array of category names in the desired order.
 * @return {Object} Result object { success, message }.
 */
function saveCategoryOrder(orderedCategories) {
  if (!isCurrentUserAdmin()) {
    return { success: false, message: "Admin privileges required." };
  }

  // Validate input
  if (!Array.isArray(orderedCategories)) { // Allow empty array to reset to config default effectively
     return { success: false, message: "Invalid category order received (not an array)." };
  }
  // Ensure all items are strings and remove duplicates just in case
  const finalOrder = [...new Set(orderedCategories.filter(cat => typeof cat === 'string' && cat.trim() !== ''))];

  // Note: We are now trusting the client to send a valid list based on what it was given.
  // We are NOT merging with CONFIG here anymore. If the admin deletes all categories, they delete them.

  try {
    const scriptProperties = PropertiesService.getScriptProperties();
    if (finalOrder.length > 0) {
       scriptProperties.setProperty('CATEGORY_ORDER', JSON.stringify(finalOrder));
       Logger.log(`Saved category order: ${JSON.stringify(finalOrder)}`);
    } else {
       // If the admin sent an empty list, delete the property to revert to CONFIG default
       scriptProperties.deleteProperty('CATEGORY_ORDER');
       Logger.log(`Deleted saved category order property. Will revert to CONFIG default.`);
    }

    // Re-run the Points Reference sheet setup to update validation
    try {
       setupPointsReferenceSheet();
    } catch (sheetError) {
       Logger.log(`Warning: Error updating Points Reference sheet validation after saving category order: ${sheetError}`);
       // Non-critical, but log it
    }

    return { success: true, message: "Category display order saved." };
  } catch (error) {
    Logger.log(`Error saving category order: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error saving order: ${error.message}` };
  }
}

/**
 * Adds a new category to the stored category order list.
 * Called by Admin.html.
 * @param {string} newCategoryName - The name of the category to add.
 * @return {Object} Result object { success, message, updatedOrder }.
 */
function addCategory(newCategoryName) {
  if (!isCurrentUserAdmin()) {
    return { success: false, message: "Admin privileges required." };
  }

  const trimmedName = newCategoryName ? String(newCategoryName).trim() : "";
  if (!trimmedName) {
     return { success: false, message: "Category name cannot be empty." };
  }
  // Optional: Add length check?
  // if (trimmedName.length > 50) { return { success: false, message: "Category name too long." }; }

  try {
    // Get the current list (might be from CONFIG or Properties)
    const currentOrder = getCurrentCategoryOrder(); // From Utilities.gs

    // Check if category already exists (case-insensitive)
    if (currentOrder.some(cat => cat.toLowerCase() === trimmedName.toLowerCase())) {
      return { success: false, message: `Category "${trimmedName}" already exists.` };
    }

    // Add the new category to the end of the list
    const updatedOrder = [...currentOrder, trimmedName];

    // Save the updated order back to PropertiesService
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty('CATEGORY_ORDER', JSON.stringify(updatedOrder));
    Logger.log(`Added category "${trimmedName}". New order: ${JSON.stringify(updatedOrder)}`);

    // Re-run the Points Reference sheet setup to update validation
    try {
       setupPointsReferenceSheet();
    } catch (sheetError) {
       Logger.log(`Warning: Error updating Points Reference sheet validation after adding category: ${sheetError}`);
       // Non-critical, but log it
    }


    return {
      success: true,
      message: `Category "${trimmedName}" added successfully.`,
      updatedOrder: updatedOrder // Send back the new order so client can update
    };
  } catch (error) {
    Logger.log(`Error adding category: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error adding category: ${error.message}` };
  }
}

/**
 * Edits an existing category in the category order list.
 * Called by Admin.html.
 * @param {string} oldCategoryName - The name of the category to edit.
 * @param {string} newCategoryName - The new name for the category.
 * @return {Object} Result object { success, message, updatedOrder }.
 */
function editCategory(oldCategoryName, newCategoryName) {
  if (!isCurrentUserAdmin()) {
    return { success: false, message: "Admin privileges required." };
  }

  const trimmedOldName = oldCategoryName ? String(oldCategoryName).trim() : "";
  const trimmedNewName = newCategoryName ? String(newCategoryName).trim() : "";
  
  if (!trimmedOldName || !trimmedNewName) {
    return { success: false, message: "Category names cannot be empty." };
  }
  
  try {
    // Get the current list (might be from CONFIG or Properties)
    const currentOrder = getCurrentCategoryOrder(); // From Utilities.gs

    // Check if the old category exists
    if (!currentOrder.some(cat => cat === trimmedOldName)) {
      return { success: false, message: `Category "${trimmedOldName}" not found.` };
    }
    
    // Check if the new category name already exists (excluding the old one)
    if (currentOrder.some(cat => cat.toLowerCase() === trimmedNewName.toLowerCase() && cat !== trimmedOldName)) {
      return { success: false, message: `Category name "${trimmedNewName}" already exists.` };
    }

    // Replace the old category with the new one, maintaining order
    const updatedOrder = currentOrder.map(cat => cat === trimmedOldName ? trimmedNewName : cat);

    // Save the updated order back to PropertiesService
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty('CATEGORY_ORDER', JSON.stringify(updatedOrder));
    Logger.log(`Edited category "${trimmedOldName}" to "${trimmedNewName}". New order: ${JSON.stringify(updatedOrder)}`);

    // Update activities using this category
    try {
      updateActivitiesCategory(trimmedOldName, trimmedNewName);
    } catch (activityError) {
      Logger.log(`Warning: Error updating activities after renaming category: ${activityError}`);
      // Non-critical, continue with saving the category change
    }

    // Re-run the Points Reference sheet setup to update validation
    try {
      setupPointsReferenceSheet();
    } catch (sheetError) {
      Logger.log(`Warning: Error updating Points Reference sheet validation after editing category: ${sheetError}`);
      // Non-critical, but log it
    }

    return {
      success: true,
      message: `Category "${trimmedOldName}" renamed to "${trimmedNewName}" successfully.`,
      updatedOrder: updatedOrder // Send back the new order so client can update
    };
  } catch (error) {
    Logger.log(`Error editing category: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error editing category: ${error.message}` };
  }
}

/**
 * Deletes a category from the category order list.
 * Called by Admin.html.
 * @param {string} categoryName - The name of the category to delete.
 * @param {string} [replacementCategory] - Optional category to reassign activities to.
 * @return {Object} Result object { success, message, updatedOrder }.
 */
function deleteCategory(categoryName, replacementCategory) {
  if (!isCurrentUserAdmin()) {
    return { success: false, message: "Admin privileges required." };
  }

  const trimmedName = categoryName ? String(categoryName).trim() : "";
  const trimmedReplacement = replacementCategory ? String(replacementCategory).trim() : "";
  
  if (!trimmedName) {
    return { success: false, message: "Category name cannot be empty." };
  }
  
  try {
    // Get the current list (might be from CONFIG or Properties)
    const currentOrder = getCurrentCategoryOrder();

    // Check if the category exists
    if (!currentOrder.some(cat => cat === trimmedName)) {
      return { success: false, message: `Category "${trimmedName}" not found.` };
    }

    // Check if it's the last category
    if (currentOrder.length === 1) {
      return { success: false, message: "Cannot delete the last remaining category." };
    }
    
    // If a replacement is specified, check if it exists
    if (trimmedReplacement && !currentOrder.some(cat => cat === trimmedReplacement)) {
      return { success: false, message: `Replacement category "${trimmedReplacement}" not found.` };
    }

    // Remove the category from the order
    const updatedOrder = currentOrder.filter(cat => cat !== trimmedName);

    // Save the updated order back to PropertiesService
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty('CATEGORY_ORDER', JSON.stringify(updatedOrder));
    Logger.log(`Deleted category "${trimmedName}". New order: ${JSON.stringify(updatedOrder)}`);

    // Update activities using this category - if a replacement is specified
    try {
      if (trimmedReplacement) {
        updateActivitiesCategory(trimmedName, trimmedReplacement);
        Logger.log(`Reassigned activities from "${trimmedName}" to "${trimmedReplacement}"`);
      } else {
        // If no replacement specified, assign to the first category in the updated list
        updateActivitiesCategory(trimmedName, updatedOrder[0]);
        Logger.log(`Reassigned activities from "${trimmedName}" to "${updatedOrder[0]}"`);
      }
    } catch (activityError) {
      Logger.log(`Warning: Error updating activities after deleting category: ${activityError}`);
      // Non-critical, continue with saving the category change
    }

    // Re-run the Points Reference sheet setup to update validation
    try {
      setupPointsReferenceSheet();
    } catch (sheetError) {
      Logger.log(`Warning: Error updating Points Reference sheet validation after deleting category: ${sheetError}`);
      // Non-critical, but log it
    }

    return {
      success: true,
      message: trimmedReplacement 
        ? `Category "${trimmedName}" deleted and activities reassigned to "${trimmedReplacement}" successfully.`
        : `Category "${trimmedName}" deleted and activities reassigned to "${updatedOrder[0]}" successfully.`,
      updatedOrder: updatedOrder
    };
  } catch (error) {
    Logger.log(`Error deleting category: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error deleting category: ${error.message}` };
  }
}

/**
 * Helper function to update activities from one category to another.
 * Used when renaming or deleting categories.
 * @param {string} oldCategory - The category being replaced.
 * @param {string} newCategory - The replacement category.
 * @private
 */
function updateActivitiesCategory(oldCategory, newCategory) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.POINTS_REFERENCE);
  
  if (!sheet) {
    Logger.log("Points Reference sheet not found when trying to update category references.");
    return;
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    // Only header row, no data to update
    return;
  }
  
  // Read all data (Activity, Points, Category)
  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  let hasChanges = false;
  
  // Update category for matching rows
  for (let i = 0; i < data.length; i++) {
    if (data[i][2] === oldCategory) {
      data[i][2] = newCategory;
      hasChanges = true;
    }
  }
  
  // Write back if changes were made
  if (hasChanges) {
    sheet.getRange(2, 1, data.length, 3).setValues(data);
    // Clear cache to force refresh
    resetActivityDataCache();
  }
}

/**
 * Gets historical data for visualizations with household filtering from Dashboard.
 * Includes current streak settings.
 * Called by Dashboard.html.
 * @return {Object} Data for charts including daily and weekly trends and current streak settings.
 */
function _getHistoricalData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  // Default structure including a place for streak settings
  const defaultResult = {
    success: false,
    message: "Dashboard sheet not found",
    dailyData: [],
    weeklyData: [],
    streakData: { buildingStreaks: {}, streaks: {} },
    movingAverages: [],
    lifetimeActivityCounts: { _hasData: false }, // Ensure default has flag
    prevWeekActivityCounts: { _hasData: false }, // Ensure default has flag
    householdId: null,
    householdName: null,
    currentStreakSettings: getCurrentStreakSettings() // Get defaults even if sheet fails
  };

  if (!dashboardSheet) {
     Logger.log("getHistoricalData Error: Dashboard sheet not found.");
    return defaultResult; // Return default structure with default settings
  }

  // -- Get and normalize the current streak settings --
  const currentStreakSettings = getCurrentStreakSettings();

  // Get current user's email and household
  const email = Session.getEffectiveUser().getEmail();
  const householdId = getUserHouseholdId(email);
  let householdEmails = [];
  if (householdId && CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
    householdEmails = getHouseholdEmails(householdId);
  } else {
    householdEmails = [email]; // Use individual email if no household or feature disabled
  }

  // --- Get daily data aggregated from dashboard ---
  const lastRow = dashboardSheet.getLastRow();
  const dailyDataMap = new Map(); // { dateStr: { date, displayDate, points } }
  const dailyActivitiesMap = new Map(); // { dateStr: { positiveCount: number, negativeCount: number } }

  if (lastRow > 1) {
    const data = dashboardSheet.getRange(2, 1, lastRow - 1, 7).getValues(); // A:G
    const timezone = Session.getScriptTimeZone();

    data.forEach(row => {
      const dateObj = row[0];
      const rowEmail = row[6] || ""; // Col G

      if (dateObj instanceof Date && dateObj.getTime() > 0 &&
          householdEmails.some(he => he.toLowerCase() === rowEmail.toLowerCase()))
      {
        const dateStr = formatDateYMD(dateObj);
        const points = Number(row[1]) || 0;
        const posCount = Number(row[3]) || 0; // Direct count from Col D
        const negCount = Number(row[4]) || 0; // Direct count from Col E

        // Aggregate daily points total
        if (!dailyDataMap.has(dateStr)) {
          dailyDataMap.set(dateStr, {
            date: dateStr,
            displayDate: Utilities.formatDate(dateObj, timezone, "MMM d"),
            points: 0
          });
        }
        dailyDataMap.get(dateStr).points += points;

        // Aggregate daily positive/negative counts
        if (!dailyActivitiesMap.has(dateStr)) {
          dailyActivitiesMap.set(dateStr, { positiveCount: 0, negativeCount: 0 });
        }
        const dailyCounts = dailyActivitiesMap.get(dateStr);
        dailyCounts.positiveCount += posCount;
        dailyCounts.negativeCount += negCount;
      }
    });
  }
  const dailyData = Array.from(dailyDataMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  // --- End Daily Data Aggregation ---


  // --- Get weekly data aggregated from daily data ---
  const weeklyDataMap = new Map(); // { weekStartDateStr: { startDate, displayDate, totalPoints, ... } }
  dailyData.forEach(day => {
      const weekStartDate = getWeekStartDate(new Date(day.date + 'T00:00:00'));
      const weekStartDateStr = formatDateYMD(weekStartDate);
      if (!weeklyDataMap.has(weekStartDateStr)) {
          weeklyDataMap.set(weekStartDateStr, {
              startDate: weekStartDateStr, displayDate: Utilities.formatDate(weekStartDate, Session.getScriptTimeZone(), "MMM d, yyyy"),
              totalPoints: 0, positiveCount: 0, negativeCount: 0,
              dailyBreakdown: { sunday: 0, monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0 }
          });
      }
      const weekEntry = weeklyDataMap.get(weekStartDateStr);
      weekEntry.totalPoints += day.points;
      const dayOfWeek = new Date(day.date + 'T00:00:00').getDay();
      const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      weekEntry.dailyBreakdown[dayKeys[dayOfWeek]] += day.points;
      const dailyCounts = dailyActivitiesMap.get(day.date);
      if (dailyCounts) { weekEntry.positiveCount += dailyCounts.positiveCount; weekEntry.negativeCount += dailyCounts.negativeCount; }
  });
  const weeklyData = Array.from(weeklyDataMap.values()).sort((a, b) => a.startDate.localeCompare(b.startDate));
  // --- End Weekly Data Aggregation ---


  // --- Get streak data for the household ---
  let streakData = { buildingStreaks: {}, streaks: {} };
  try {
     if (householdId && CONFIG.HOUSEHOLD_SETTINGS.ENABLED && typeof trackActivityStreaksForHousehold === "function") {
        streakData = trackActivityStreaksForHousehold(householdId);
     } else if (typeof trackActivityStreaks === "function"){
        streakData = trackActivityStreaks();
     }
  } catch (e) { Logger.log(`Error getting streak data: ${e}`); }
  // --- End Streak Data ---


  // --- Calculate moving average ---
  const movingAverages = calculateMovingAverages(dailyData, 7);
  // --- End Moving Average ---

  // --- Get lifetime and previous week counts ---
  const lifetimeCounts = getEnhancedLifetimeActivityCounts(householdEmails);
  const prevWeekCounts = getEnhancedPreviousWeekActivityCounts(householdEmails);
  // --- End Activity Counts ---


  // --- Assemble Final Result ---
  return {
    success: true, dailyData: dailyData, weeklyData: weeklyData, streakData: streakData,
    movingAverages: movingAverages, lifetimeActivityCounts: lifetimeCounts, prevWeekActivityCounts: prevWeekCounts,
    householdId: householdId, householdName: householdId ? getHouseholdName(householdId) : null,
    currentStreakSettings: currentStreakSettings
  };
}

/**
 * Gets data for the two specific weekly goals based on Dashboard history.
 * Called by Dashboard.html.
 * @return {Object} Goal status object { higherThanPrevious: {...}, doublePoints: {...} }.
 */
function _getWeeklyGoalsData() {
  const email = Session.getEffectiveUser().getEmail();
  const householdId = getUserHouseholdId(email);
  return calculateDashboardGoalStatus(householdId);
}

// --- Household Management Wrappers (addHousehold, addUserToHousehold, etc.) ---
// These functions are defined in HouseholdManagement.gs and called directly by client-side JS

// --- Digest Wrapper ---
/**
 * Forces sending the daily digest email.
 * Called by buttons in ActivityTracker.html and Dashboard.html.
 * @return {Object} Result with success status and message.
 */
function forceSendDailyDigest() {
  try {
    const result = sendDailyDigest(); // In EmailService.gs
    return { success: result, message: result ? "Daily digest email sent successfully" : "Failed to send daily digest" };
  } catch (error) {
    Logger.log(`Error forcing daily digest: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error sending email: ${error.message}` };
  }
}

/**
 * Gets historical goal achievement data for the calling user's household.
 * Wrapper function callable from the client-side.
 * @return {Object} Data about goal achievements over time.
 */
function _getGoalAchievementHistory() {
  const email = Session.getEffectiveUser().getEmail();
  const householdId = getUserHouseholdId(email);
  return calculateGoalAchievementHistory(householdId); // In DataProcessing.gs
}

/**
 * Saves the complete list of categories, handling renames and deletions.
 * Called by Admin.html.
 * @param {Array<string>} categories - An array of category names in the desired order.
 * @return {Object} Result object { success, message }.
 */
function saveCategoriesData(categories) {
  if (!isCurrentUserAdmin()) {
    return { success: false, message: "Admin privileges required." };
  }

  // Validate input
  if (!Array.isArray(categories)) {
    return { success: false, message: "Invalid categories data (not an array)." };
  }
  
  // Remove empty strings and duplicates
  const cleanedCategories = [...new Set(categories.filter(cat => typeof cat === 'string' && cat.trim() !== ''))];
  
  // Check if we have at least one category
  if (cleanedCategories.length === 0) {
    return { success: false, message: "At least one category is required." };
  }
  
  try {
    // Get the current categories to identify changes
    const currentCategories = getCurrentCategoryOrder();
    
    // Find activities that need category updates (if a category was renamed or deleted)
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.POINTS_REFERENCE);
    
    if (sheet) {
      // Process activities that may need category reassignment
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
        let hasChanges = false;
        
        // Check activities with categories that no longer exist in the new list
        for (let i = 0; i < data.length; i++) {
          const activityCategory = data[i][2];
          if (!cleanedCategories.includes(activityCategory)) {
            // Category no longer exists, assign to first category
            data[i][2] = cleanedCategories[0];
            hasChanges = true;
          }
        }
        
        // If any activity categories were changed, update the sheet
        if (hasChanges) {
          sheet.getRange(2, 1, data.length, 3).setValues(data);
          Logger.log(`Updated activities with obsolete categories to use "${cleanedCategories[0]}"`);
        }
      }
    }
    
    // Save the categories to PropertiesService
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty('CATEGORY_ORDER', JSON.stringify(cleanedCategories));
    Logger.log(`Saved ${cleanedCategories.length} categories`);
    
    // Re-run the Points Reference sheet setup to update validation
    try {
      setupPointsReferenceSheet();
    } catch (sheetError) {
      Logger.log(`Warning: Error updating Points Reference sheet validation after saving categories: ${sheetError}`);
      // Non-critical, but log it
    }
    
    // Clear cache to force refresh
    resetActivityDataCache();
    
    return {
      success: true,
      message: `Saved ${cleanedCategories.length} categories successfully`
    };
  } catch (error) {
    Logger.log(`Error saving categories: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error saving: ${error.message}` };
  }
}

// --- NEW FUNCTIONS FOR ACTIVITY LOG ---

/**
 * Fetches the recent activity log data (last 7 days) with individual activities parsed out.
 * Callable from client-side (admin only).
 * @return {Object} Result object with log entries or error.
 */
function getRecentActivityLog() {
  // Check for admin privileges
  if (!isCurrentUserAdmin()) {
    return { 
      success: false, 
      message: "Admin privileges required." 
    };
  }
  
  try {
    // Calculate date range (last 7 days)
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7); // Go back 7 days
    
    // Get data from DataProcessing.js function with individual activities parsed
    const logEntries = getActivityLogData(startDate, endDate);
    
    return {
      success: true,
      log: logEntries
    };
  } catch (error) {
    Logger.log(`Error in getRecentActivityLog: ${error}\nStack: ${error.stack}`);
    return {
      success: false,
      message: `Error retrieving activity log: ${error.message}`
    };
  }
}

/**
 * Deletes a specific individual activity from the activity log.
 * Callable from client-side (admin only).
 * @param {number} rowIndex The sheet row index.
 * @param {string} activityId The unique ID of the activity to delete.
 * @param {string} date The date in YYYY-MM-DD format for verification.
 * @param {string} email The email for verification.
 * @return {Object} Result object with success status and message.
 */
function deleteIndividualActivityEntry(rowIndex, activityId, date, email) {
  // Check for admin privileges
  if (!isCurrentUserAdmin()) {
    return { 
      success: false, 
      message: "Admin privileges required." 
    };
  }
  
  // Validate inputs
  if (!rowIndex || !activityId || !date || !email) {
    return {
      success: false,
      message: "Missing required parameters: rowIndex, activityId, date, and email are required."
    };
  }
  
  if (typeof rowIndex !== 'number' || isNaN(rowIndex)) {
    return {
      success: false,
      message: "Row index must be a valid number."
    };
  }
  
  // Call DataProcessing.js function to handle deletion
  return deleteIndividualActivity(rowIndex, activityId, date, email);
}

/**
 * Adds a new activity entry to the log.
 * Callable from client-side (admin only).
 * @param {string} dateString The date string in YYYY-MM-DD format.
 * @param {string} email The email to associate with the entry.
 * @param {string} activityName The name of the activity from reference.
 * @return {Object} Result object with success status and message.
 */
function addActivityEntry(dateString, email, activityName) {
  // Check for admin privileges
  if (!isCurrentUserAdmin()) {
    return { 
      success: false, 
      message: "Admin privileges required." 
    };
  }
  
  try {
    // Validate inputs
    if (!dateString || !email || !activityName) {
      return {
        success: false,
        message: "Missing required parameters: dateString, email, and activityName are required."
      };
    }
    
    // Parse date string - handle YYYY-MM-DD format
    const dateParts = dateString.split('-');
    if (dateParts.length !== 3) {
      return {
        success: false,
        message: "Invalid date format. Please use YYYY-MM-DD format."
      };
    }
    
    // JavaScript months are 0-based, so subtract 1 from month
    const timestamp = new Date(
      parseInt(dateParts[0]), 
      parseInt(dateParts[1]) - 1, 
      parseInt(dateParts[2])
    );
    
    // Basic validation of the date
    if (isNaN(timestamp.getTime())) {
      return {
        success: false,
        message: "Invalid date."
      };
    }
    
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        success: false,
        message: "Invalid email format."
      };
    }
    
    // Call DataProcessing.js function to add the entry
    return addIndividualActivity(timestamp, email, activityName);
  } catch (error) {
    Logger.log(`Error in addActivityEntry: ${error}\nStack: ${error.stack}`);
    return {
      success: false,
      message: `Error adding activity entry: ${error.message}`
    };
  }
}

/**
 * Edits a specific activity in the log by replacing it with a new one.
 * Callable from client-side (admin only).
 * @param {number} rowIndex The sheet row index.
 * @param {string} activityId The unique ID of the activity to edit.
 * @param {string} date The date in YYYY-MM-DD format for verification.
 * @param {string} email The email for verification.
 * @param {string} newActivityName The new activity name to replace with.
 * @return {Object} Result object with success status and message.
 */
function editActivityEntry(rowIndex, activityId, date, email, newActivityName) {
  // Check for admin privileges
  if (!isCurrentUserAdmin()) {
    return { 
      success: false, 
      message: "Admin privileges required." 
    };
  }
  
  // Validate inputs
  if (!rowIndex || !activityId || !date || !email || !newActivityName) {
    return {
      success: false,
      message: "Missing required parameters: rowIndex, activityId, date, email, and newActivityName are required."
    };
  }
  
  if (typeof rowIndex !== 'number' || isNaN(rowIndex)) {
    return {
      success: false,
      message: "Row index must be a valid number."
    };
  }
  
  // Call DataProcessing.js function to handle editing
  return editIndividualActivity(rowIndex, activityId, date, email, newActivityName);
}

// --- Goal Management Functions ---

/**
 * Gets all goals for the current user's household
 * Called by Admin.html and Dashboard.html
 * @return {Array} Array of goal objects
 */
function getGoalsData() {
  try {
    Logger.log(`[GOALS DEBUG] getGoalsData() called`);
    
    const email = Session.getEffectiveUser().getEmail();
    Logger.log(`[GOALS DEBUG] Current user email: ${email}`);
    
    let householdId = getUserHouseholdId(email);
    Logger.log(`[GOALS DEBUG] User household ID: ${householdId}`);
    
    if (!householdId) {
      Logger.log(`[GOALS DEBUG] No household ID found, attempting to create one`);
      householdId = ensureUserHasHousehold(email);
      
      if (!householdId) {
        Logger.log(`[GOALS DEBUG] Failed to create household, returning empty array`);
        return [];
      }
      
      Logger.log(`[GOALS DEBUG] Successfully created/found household: ${householdId}`);
    }
    
    const goals = getGoalsByHousehold(householdId);
    Logger.log(`[GOALS DEBUG] getGoalsByHousehold returned ${goals.length} goals`);
    
    if (goals.length > 0) {
      Logger.log(`[GOALS DEBUG] Goals data: ${JSON.stringify(goals.map(g => ({id: g.goalId, name: g.goalName, type: g.goalType})))}`);
    }
    
    // Test serialization before returning to catch potential issues
    try {
      const serializedTest = JSON.stringify(goals);
      Logger.log(`[GOALS DEBUG] Serialization test passed. Data size: ${serializedTest.length} characters`);
    } catch (serializationError) {
      Logger.log(`[GOALS DEBUG] SERIALIZATION ERROR: ${serializationError.message}`);
      Logger.log(`[GOALS DEBUG] Attempting to return simplified goal data`);
      
      // Return simplified version if full serialization fails
      const simplifiedGoals = goals.map(goal => ({
        goalId: goal.goalId,
        goalName: goal.goalName,
        goalType: goal.goalType,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        status: goal.status
      }));
      
      Logger.log(`[GOALS DEBUG] Returning simplified goals array of length: ${simplifiedGoals.length}`);
      return simplifiedGoals;
    }
    
    Logger.log(`[GOALS DEBUG] getGoalsData() returning array of length: ${goals.length}`);
    return goals;
    
  } catch (error) {
    Logger.log(`[GOALS DEBUG] Error getting goals data: ${error.message}\nStack: ${error.stack}`);
    return [];
  }
}

/**
 * Saves goal data (create, update, delete operations)
 * Called by Admin.html
 * @param {Array} modifiedGoals - Array of goals that were modified or created
 * @param {Array} deletedGoals - Array of goals that were deleted
 * @return {Object} Result object { success, message }
 */
function saveGoalsData(modifiedGoals, deletedGoals) {
  if (!isCurrentUserAdmin()) {
    return { success: false, message: "Admin privileges required." };
  }
  
  try {
    const email = Session.getEffectiveUser().getEmail();
    Logger.log(`[GOALS DEBUG] saveGoalsData called for admin user: ${email}`);
    
    let householdId = getUserHouseholdId(email);
    Logger.log(`[GOALS DEBUG] Initial household lookup returned: ${householdId}`);
    
    if (!householdId) {
      Logger.log(`[GOALS DEBUG] No household found, attempting to create one for admin user`);
      householdId = ensureUserHasHousehold(email);
      
      if (!householdId) {
        Logger.log(`[GOALS DEBUG] Failed to create household for admin user: ${email}`);
        return { success: false, message: "No household found for current user and failed to create one." };
      }
      
      Logger.log(`[GOALS DEBUG] Successfully created household for admin user: ${householdId}`);
    }
    
    let results = [];
    
    // Handle deleted goals
    if (deletedGoals && deletedGoals.length > 0) {
      for (const goal of deletedGoals) {
        try {
          deleteGoal(goal.goalId);
          results.push(`Deleted goal: ${goal.goalName}`);
        } catch (error) {
          Logger.log(`Error deleting goal ${goal.goalId}: ${error.message}`);
          results.push(`Error deleting goal: ${goal.goalName}`);
        }
      }
    }
    
    // Handle modified and new goals
    if (modifiedGoals && modifiedGoals.length > 0) {
      for (const goal of modifiedGoals) {
        try {
          if (goal.isNew) {
            // Create new goal
            const goalData = {
              goalName: goal.goalName,
              goalType: goal.goalType,
              targetAmount: goal.targetAmount,
              currentAmount: goal.currentAmount,
              targetDate: goal.targetDate,
              householdId: householdId
            };
            
            const goalId = createGoal(goalData);
            results.push(`Created goal: ${goal.goalName}`);
          } else {
            // Update existing goal
            const updateData = {
              goalName: goal.goalName,
              targetAmount: goal.targetAmount,
              currentAmount: goal.currentAmount,
              targetDate: goal.targetDate,
              status: goal.status
            };
            
            updateGoal(goal.goalId, updateData);
            results.push(`Updated goal: ${goal.goalName}`);
          }
        } catch (error) {
          Logger.log(`Error saving goal ${goal.goalId}: ${error.message}`);
          results.push(`Error saving goal: ${goal.goalName}`);
        }
      }
    }
    
    return {
      success: true,
      message: `Goal operations completed: ${results.join(', ')}`
    };
    
  } catch (error) {
    Logger.log(`Error saving goals data: ${error.message}`);
    return { success: false, message: `Error saving goals: ${error.message}` };
  }
}

/**
 * Updates goal amounts (used for periodic balance updates)
 * Called by Dashboard.html
 * @param {Array} updates - Array of {goalId, newAmount} objects
 * @return {Object} Result object { success, message, updates }
 */
function updateGoalAmounts(updates) {
  try {
    const email = Session.getEffectiveUser().getEmail();
    const householdId = getUserHouseholdId(email);
    
    if (!householdId) {
      return { success: false, message: "No household found for current user." };
    }
    
    const results = updateGoalAmounts(householdId, updates);
    
    return {
      success: results.success,
      message: results.errors.length > 0 ? results.errors.join(', ') : 'Goal amounts updated successfully',
      updates: results
    };
    
  } catch (error) {
    Logger.log(`Error updating goal amounts: ${error.message}`);
    return { success: false, message: `Error updating goal amounts: ${error.message}` };
  }
}

/**
 * Gets goal summary data for dashboard display
 * Called by Dashboard.html
 * @return {Object} Goal summary data
 */
function getGoalSummaryData() {
  try {
    const email = Session.getEffectiveUser().getEmail();
    const householdId = getUserHouseholdId(email);
    
    if (!householdId) {
      return {
        totalActiveGoals: 0,
        totalCompletedGoals: 0,
        totalProgress: 0,
        criticalGoalsCount: 0,
        vacationFundActive: false,
        topGoals: [],
        recentCompletions: []
      };
    }
    
    return getGoalSummaryForDashboard(householdId);
    
  } catch (error) {
    Logger.log(`Error getting goal summary: ${error.message}`);
    return {
      totalActiveGoals: 0,
      totalCompletedGoals: 0,
      totalProgress: 0,
      criticalGoalsCount: 0,
      vacationFundActive: false,
      topGoals: [],
      recentCompletions: []
    };
  }
}

/**
 * Gets detailed goal calculations for dashboard display
 * Called by Dashboard.html
 * @return {Object} Detailed goal calculations
 */
function _getDetailedGoalData() {
  try {
    const email = Session.getEffectiveUser().getEmail();
    Logger.log(`[GOALS DEBUG] getDetailedGoalData called for email: ${email}`);
    
    let householdId = getUserHouseholdId(email);
    Logger.log(`[GOALS DEBUG] getUserHouseholdId returned: ${householdId}`);
    
    if (!householdId) {
      Logger.log(`[GOALS DEBUG] No household ID found for email: ${email}, attempting to create one`);
      householdId = ensureUserHasHousehold(email);
      
      if (!householdId) {
        Logger.log(`[GOALS DEBUG] Failed to create household for email: ${email}, returning empty results`);
        return {
          activeGoals: [],
          completedGoals: [],
          vacationFundStatus: null,
          totalProgress: 0,
          criticalGoals: []
        };
      }
      
      Logger.log(`[GOALS DEBUG] Successfully created/found household: ${householdId}`);
    }
    
    Logger.log(`[GOALS DEBUG] Calling calculateHouseholdGoals with householdId: ${householdId}`);
    const results = calculateHouseholdGoals(householdId);
    Logger.log(`[GOALS DEBUG] calculateHouseholdGoals returned ${results.activeGoals.length} active goals, ${results.completedGoals.length} completed goals`);
    
    return results;
    
  } catch (error) {
    Logger.log(`[GOALS DEBUG] Error getting detailed goal data: ${error.message}\nStack: ${error.stack}`);
    return {
      activeGoals: [],
      completedGoals: [],
      vacationFundStatus: null,
      totalProgress: 0,
      criticalGoals: []
    };
  }
}

/**
 * Gets orphaned goals for admin management
 * Called by Admin.html
 * @return {Array} Array of orphaned goals
 */
function getOrphanedGoalsData() {
  if (!isCurrentUserAdmin()) {
    return [];
  }
  
  try {
    return getOrphanedGoals();
  } catch (error) {
    Logger.log(`Error getting orphaned goals data: ${error.message}`);
    return [];
  }
}

/**
 * Assigns orphaned goals to the current user's household
 * Called by Admin.html
 * @param {Array} goalIds - Array of goal IDs to assign
 * @return {Object} Result object
 */
function fixOrphanedGoals(goalIds) {
  if (!isCurrentUserAdmin()) {
    return { success: false, message: "Admin privileges required." };
  }
  
  try {
    const email = Session.getEffectiveUser().getEmail();
    let householdId = getUserHouseholdId(email);
    
    if (!householdId) {
      householdId = ensureUserHasHousehold(email);
      if (!householdId) {
        return { success: false, message: "Could not determine or create household for admin user." };
      }
    }
    
    return assignOrphanedGoalsToHousehold(goalIds, householdId);
    
  } catch (error) {
    Logger.log(`Error fixing orphaned goals: ${error.message}`);
    return { success: false, message: `Error: ${error.message}` };
  }
}

/**
 * Runs a comprehensive diagnostic on the goals loading system
 * Called by Dashboard.html
 * @return {Object} Diagnostic results
 */
function runGoalsDiagnostic() {
  try {
    const email = Session.getEffectiveUser().getEmail();
    const householdId = getUserHouseholdId(email);
    const diagnostic = {
      userEmail: email,
      householdId: householdId,
      goalsSheetExists: false,
      totalGoalsInSheet: 0,
      goalsForHousehold: 0,
      orphanedGoals: 0,
      issues: [],
      recommendations: []
    };
    
    // Check if Goals sheet exists
    try {
      const sheet = setupGoalsSheet();
      diagnostic.goalsSheetExists = true;
      
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        diagnostic.totalGoalsInSheet = lastRow - 1; // Subtract header row
        
        // Count goals for this household
        const goals = getGoalsByHousehold(householdId || 'none');
        diagnostic.goalsForHousehold = goals.length;
        
        // Count orphaned goals
        const orphaned = getOrphanedGoals();
        diagnostic.orphanedGoals = orphaned.length;
      }
    } catch (sheetError) {
      diagnostic.goalsSheetExists = false;
      diagnostic.issues.push("Goals sheet does not exist or cannot be accessed");
      diagnostic.recommendations.push("Use Admin panel to create Goals sheet");
    }
    
    // Check household setup
    if (!householdId) {
      diagnostic.issues.push("No household ID found for your email");
      diagnostic.recommendations.push("Household may need to be set up. Try creating a goal in Admin panel to auto-create household.");
    }
    
    // Check for orphaned goals
    if (diagnostic.orphanedGoals > 0) {
      diagnostic.issues.push(`${diagnostic.orphanedGoals} goals found without household associations`);
      diagnostic.recommendations.push("Use Admin panel to fix orphaned goals");
    }
    
    // Check for goals mismatch
    if (diagnostic.totalGoalsInSheet > 0 && diagnostic.goalsForHousehold === 0 && householdId) {
      diagnostic.issues.push("Goals exist in sheet but none are linked to your household");
      diagnostic.recommendations.push("Goals may need to be reassigned to your household");
    }
    
    // Success case
    if (diagnostic.issues.length === 0) {
      if (diagnostic.goalsForHousehold > 0) {
        diagnostic.recommendations.push("Everything looks good! Your goals should be loading properly.");
      } else {
        diagnostic.recommendations.push("Setup appears correct. You can create goals in the Admin panel.");
      }
    }
    
    Logger.log(`[GOALS DEBUG] Diagnostic completed: ${JSON.stringify(diagnostic)}`);
    return diagnostic;
    
  } catch (error) {
    Logger.log(`Error running goals diagnostic: ${error.message}`);
    return {
      userEmail: "Unknown",
      householdId: null,
      goalsSheetExists: false,
      totalGoalsInSheet: 0,
      goalsForHousehold: 0,
      orphanedGoals: 0,
      issues: [`Diagnostic failed: ${error.message}`],
      recommendations: ["Contact support or check system logs"]
    };
  }
}

// --- EXPENSE TRACKER API FUNCTIONS ---

/**
 * Gets expense tracker data including budget categories and location mappings
 * Called by ExpenseTracker.html
 * @return {Object} Expense tracker data for the current user's household
 */
function _getExpenseTrackerData() {
  try {
    const email = Session.getEffectiveUser().getEmail();
    const householdId = getUserHouseholdId(email);
    let householdEmails = [];
    let householdName = null;

    if (householdId && CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
      householdEmails = getHouseholdEmails(householdId);
      householdName = getHouseholdName(householdId);
    } else {
      householdEmails = [email];
    }

    // Get expense data using the caching functions from DataProcessing.js
    const expenseData = getExpenseDataCached(householdId);
    
    return {
      success: true,
      budgetCategories: expenseData.budgetCategories,
      locationMappings: expenseData.locationMappings,
      householdId: householdId,
      householdName: householdName,
      members: householdEmails,
      currentPayPeriod: getCurrentPayPeriod()
    };
  } catch (error) {
    Logger.log(`Error in getExpenseTrackerData: ${error}\nStack: ${error.stack}`);
    return {
      success: false,
      message: `Error loading expense data: ${error.message}`,
      budgetCategories: { categories: [], categoriesById: {}, totalBudget: 0, totalSpent: 0 },
      locationMappings: { locations: [], locationsByName: {} }
    };
  }
}

/**
 * Submits a new expense entry
 * Called by ExpenseTracker.html
 * @param {number} amount The expense amount
 * @param {string} location The store/location name
 * @param {string} category The budget category
 * @param {string} description Optional description
 * @return {Object} Result object with success status and updated budget info
 */
function submitExpense(amount, location, category, description = "") {
  try {
    // Validate inputs
    if (!amount || isNaN(amount) || amount <= 0) {
      return { success: false, message: "Invalid amount provided" };
    }
    
    if (!location || typeof location !== 'string' || location.trim() === '') {
      return { success: false, message: "Location is required" };
    }
    
    if (!category || typeof category !== 'string' || category.trim() === '') {
      return { success: false, message: "Category is required" };
    }

    const email = Session.getEffectiveUser().getEmail();
    const householdId = getUserHouseholdId(email);
    
    // Process the expense entry using DataProcessing.js function
    const result = processExpenseEntry(
      Number(amount), 
      location.trim(), 
      category.trim(), 
      description.trim(), 
      email, 
      householdId
    );

    if (result.success) {
      // Get updated budget data for the response
      const updatedData = getExpenseTrackerData();
      result.budgetCategories = updatedData.budgetCategories;
    }

    return result;
  } catch (error) {
    Logger.log(`Error in submitExpense: ${error}\nStack: ${error.stack}`);
    return {
      success: false,
      message: `Error submitting expense: ${error.message}`
    };
  }
}

/**
 * Gets current budget status for all categories
 * Called by ExpenseTracker.html for real-time budget updates
 * @return {Object} Current budget status data
 */
function getBudgetStatus() {
  try {
    const email = Session.getEffectiveUser().getEmail();
    const householdId = getUserHouseholdId(email);
    
    const expenseData = getExpenseDataCached(householdId);
    
    return {
      success: true,
      budgetCategories: expenseData.budgetCategories,
      currentPayPeriod: getCurrentPayPeriod()
    };
  } catch (error) {
    Logger.log(`Error in getBudgetStatus: ${error}\nStack: ${error.stack}`);
    return {
      success: false,
      message: `Error getting budget status: ${error.message}`,
      budgetCategories: { categories: [], categoriesById: {}, totalBudget: 0, totalSpent: 0 }
    };
  }
}

/**
 * Suggests a category for a given location based on location mappings
 * Called by ExpenseTracker.html for auto-category selection
 * @param {string} locationName The location/store name to get suggestions for
 * @return {Object} Suggested category information
 */
function suggestCategoryForLocation(locationName) {
  try {
    if (!locationName || typeof locationName !== 'string') {
      return { success: false, message: "Invalid location name" };
    }

    const email = Session.getEffectiveUser().getEmail();
    const householdId = getUserHouseholdId(email);
    
    const expenseData = getExpenseDataCached(householdId);
    const locationData = expenseData.locationMappings.locationsByName[locationName.toLowerCase()];
    
    if (locationData) {
      return {
        success: true,
        suggestedCategory: locationData.defaultCategory,
        usageCount: locationData.usageCount,
        lastUsed: locationData.lastUsed,
        confidence: locationData.isSuggested ? 'high' : 'low'
      };
    } else {
      // Try fuzzy matching for similar location names
      const locations = expenseData.locationMappings.locations;
      const fuzzyMatch = locations.find(loc => 
        loc.name.toLowerCase().includes(locationName.toLowerCase()) ||
        locationName.toLowerCase().includes(loc.name.toLowerCase())
      );
      
      if (fuzzyMatch) {
        return {
          success: true,
          suggestedCategory: fuzzyMatch.defaultCategory,
          usageCount: fuzzyMatch.usageCount,
          lastUsed: fuzzyMatch.lastUsed,
          confidence: 'medium',
          matchedLocation: fuzzyMatch.name
        };
      }
    }
    
    return {
      success: false,
      message: "No category suggestion found for this location"
    };
  } catch (error) {
    Logger.log(`Error in suggestCategoryForLocation: ${error}\nStack: ${error.stack}`);
    return {
      success: false,
      message: `Error getting category suggestion: ${error.message}`
    };
  }
}

/**
 * Resets/finalizes the current pay period budgets
 * Called by ExpenseTracker.html for pay period management
 * @return {Object} Result object with reset status and summary
 */
function resetPayPeriod() {
  try {
    const email = Session.getEffectiveUser().getEmail();
    const householdId = getUserHouseholdId(email);
    
    if (!householdId) {
      return { success: false, message: "No household found for current user" };
    }
    
    // Reset the pay period budgets using DataProcessing.js function
    const result = resetPayPeriodBudgets(householdId);
    
    if (result.success) {
      // Get updated data for the response
      const updatedData = getExpenseTrackerData();
      result.budgetCategories = updatedData.budgetCategories;
      result.newPayPeriod = getCurrentPayPeriod();
    }
    
    return result;
  } catch (error) {
    Logger.log(`Error in resetPayPeriod: ${error}\nStack: ${error.stack}`);
    return {
      success: false,
      message: `Error resetting pay period: ${error.message}`
    };
  }
}

/**
 * Gets recent expense entries for the current household
 * Called by ExpenseTracker.html for showing recent activity
 * @param {number} limit Optional limit on number of entries to return (default: 10)
 * @return {Object} Recent expense entries data
 */
function getRecentExpenses(limit = 10) {
  try {
    const email = Session.getEffectiveUser().getEmail();
    const householdId = getUserHouseholdId(email);
    let householdEmails = [];

    if (householdId && CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
      householdEmails = getHouseholdEmails(householdId);
    } else {
      householdEmails = [email];
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.EXPENSE_TRACKER);
    
    if (!sheet) {
      return {
        success: true,
        expenses: [],
        message: "No expense data found"
      };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return {
        success: true,
        expenses: [],
        message: "No expenses recorded yet"
      };
    }

    // Get recent entries (columns: Date, Amount, Location, Category, Description, Email, HouseholdID, PayPeriod)
    const startRow = Math.max(2, lastRow - limit + 1);
    const numRows = lastRow - startRow + 1;
    const data = sheet.getRange(startRow, 1, numRows, 8).getValues();
    
    const expenses = [];
    data.reverse().forEach((row, index) => { // Reverse to get most recent first
      const rowEmail = row[5] || "";
      const rowHouseholdId = row[6] || "";
      
      // Filter by household membership
      if (householdEmails.some(he => he.toLowerCase() === rowEmail.toLowerCase()) ||
          (householdId && rowHouseholdId === householdId)) {
        expenses.push({
          date: row[0],
          amount: row[1],
          location: row[2],
          category: row[3],
          description: row[4],
          email: rowEmail,
          payPeriod: row[7],
          rowIndex: lastRow - index // For potential future editing
        });
      }
    });

    return {
      success: true,
      expenses: expenses.slice(0, limit), // Ensure we don't exceed the limit
      totalCount: expenses.length
    };
  } catch (error) {
    Logger.log(`Error in getRecentExpenses: ${error}\nStack: ${error.stack}`);
    return {
      success: false,
      message: `Error getting recent expenses: ${error.message}`,
      expenses: []
    };
  }
}

/**
 * Saves budget category configurations from the Admin panel
 * Called by Admin.html
 * @param {Array} categories Array of budget category objects
 * @return {Object} Result object with success status
 */
function saveBudgetCategoriesData(categories) {
  if (!isCurrentUserAdmin()) {
    return { success: false, message: "Admin privileges required." };
  }
  
  if (!Array.isArray(categories)) {
    return { success: false, message: "Invalid categories data" };
  }

  try {
    const email = Session.getEffectiveUser().getEmail();
    const householdId = getUserHouseholdId(email);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.BUDGET_CATEGORIES);

    if (!sheet) {
      setupBudgetCategoriesSheet();
      sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.BUDGET_CATEGORIES);
      if (!sheet) {
        return { success: false, message: "Budget Categories sheet could not be found or created." };
      }
    }

    // Clear existing data (except header)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 8).clearContent();
    }

    // Write new data if any exists
    if (categories.length > 0) {
      const newData = categories.map(category => [
        category.name || "",
        typeof category.monthlyBudget === 'number' ? category.monthlyBudget : 0,
        typeof category.currentSpent === 'number' ? category.currentSpent : 0,
        typeof category.payPeriodBudget === 'number' ? category.payPeriodBudget : 0,
        typeof category.payPeriodSpent === 'number' ? category.payPeriodSpent : 0,
        category.lastReset instanceof Date ? category.lastReset : new Date(),
        householdId || null,
        category.isActive !== false // Default to true
      ]);
      
      sheet.getRange(2, 1, newData.length, 8).setValues(newData);
    }

    // Clear cache to force refresh
    resetExpenseDataCache(householdId);

    return {
      success: true,
      message: `Saved ${categories.length} budget categories successfully`
    };
  } catch (error) {
    Logger.log(`Error saving budget categories: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error saving: ${error.message}` };
  }
}