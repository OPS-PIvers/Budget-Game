// WebApp.gs
/**
 * Budget Game Web App Controller
 * Handles serving the web app and processing data between UI and spreadsheet
 */

// Updated doGet function in WebApp.gs

// WebApp.gs - Updated doGet function

/**
 * Serves the web app HTML UI when accessed via GET request
 */
function doGet(e) {
  // Check if there's a page parameter
  const page = e.parameter.page;
  
  if (page === 'admin') {
    return HtmlService.createTemplateFromFile('Admin')
      .evaluate()
      .setTitle('Budget Game Admin')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page === 'dashboard') {
    return HtmlService.createTemplateFromFile('Dashboard')
      .evaluate()
      .setTitle('Budget Game Dashboard')
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
 * Includes an HTML file in the main template
 * @param {string} filename - The name of the HTML file to include
 * @return {string} The contents of the file
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Gets all activity data from Points Reference sheet
 * @return {Object} Object containing point values and categories by activity
 */
function getWebAppActivityData() {
  // Use the existing cache function from your code
  return getActivityDataCached();
}

/**
 * Gets the current day's points and activities for the user's household
 * @return {Object} Current day totals and activities for the household
 */
function getTodayData() {
  const today = new Date();
  const formattedDate = formatDateYMD(today);
  
  // Get current user's email and household
  const email = Session.getEffectiveUser().getEmail();
  const householdId = getUserHouseholdId(email);
  let householdEmails = [];
  
  if (householdId) {
    householdEmails = getHouseholdEmails(householdId);
    Logger.log(`Found ${householdEmails.length} members in household for ${email}`);
  } else {
    // No household found, just use current user's email
    householdEmails = [email];
    Logger.log(`No household found for ${email}, using individual data`);
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  
  if (!dashboardSheet) {
    return { points: 0, activities: [], householdId: householdId };
  }
  
  let todayPoints = 0;
  const activitiesMap = new Map(); // Use a Map to deduplicate activities
  const lastRow = dashboardSheet.getLastRow();
  
  if (lastRow > 1) {
    // Get dates, activities, points and email column (if it exists)
    // This assumes Dashboard has columns: Date, Points, Activities, PositiveCount, NegativeCount, WeekNumber, Email
    // Adjust the range if your sheet structure is different
    const data = dashboardSheet.getRange(2, 1, lastRow - 1, 7).getValues();
    
    // Loop through all rows in the Dashboard
    for (let i = 0; i < data.length; i++) {
      const rowDate = data[i][0];
      const rowPoints = data[i][1] || 0;
      const rowActivities = data[i][2] || "";
      const rowEmail = data[i][6] || ""; // Assuming Email is column 7
      
      if (rowDate instanceof Date && formatDateYMD(rowDate) === formattedDate) {
        // Check if this row belongs to someone in the user's household
        if (householdEmails.length === 0 || 
            householdEmails.some(email => email.toLowerCase() === rowEmail.toString().toLowerCase())) {
          
          // Add points to total
          todayPoints += rowPoints;
          
          // Process activities
          if (rowActivities) {
            const activitiesList = rowActivities.split(", ");
            activitiesList.forEach(activityStr => {
              // Parse out activity name from the format string
              const match = activityStr.match(/(➕|➖)\s(.+?)(\s\(🔥\d+\))?\s\(([+-]\d+)\)/);
              if (match) {
                const isPositive = match[1] === "➕";
                const name = match[2];
                const streakInfo = match[3] ? match[3].trim() : "";
                const points = parseInt(match[4]);
                
                // Use the activity name as the key to deduplicate
                if (!activitiesMap.has(name)) {
                  activitiesMap.set(name, { 
                    name, 
                    points, 
                    isPositive,
                    streakInfo
                  });
                }
              }
            });
          }
        }
      }
    }
  }
  
  // Convert the Map values to an array for the result
  const activities = Array.from(activitiesMap.values());
  
  return { 
    points: todayPoints, 
    activities: activities,
    householdId: householdId,
    householdName: householdId ? getHouseholdName(householdId) : null,
    members: householdEmails
  };
}

/**
 * Gets the current week's data for the user's household
 * @return {Object} Weekly totals and averages for the household
 */
function getWeekData() {
  try {
    // Initialize result with default values
    const result = {
      weeklyTotal: 0,
      positiveCount: 0,
      negativeCount: 0,
      topActivity: "None",
      dailyAverage: 0,
      weeklyAverage: 0,
      householdId: null,
      householdName: null
    };
    
    // Get current user's email and household
    const email = Session.getEffectiveUser().getEmail();
    const householdId = getUserHouseholdId(email);
    let householdEmails = [];
    
    if (householdId) {
      householdEmails = getHouseholdEmails(householdId);
      result.householdId = householdId;
      result.householdName = getHouseholdName(householdId);
      Logger.log(`Found ${householdEmails.length} members in household for ${email}`);
    } else {
      // No household found, just use current user's email
      householdEmails = [email];
      Logger.log(`No household found for ${email}, using individual data`);
    }
    
    // Get the spreadsheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      Logger.log("ERROR: Spreadsheet not found");
      return result;
    }
    
    // Get current week's sheet
    const today = new Date();
    const weekStartDate = getWeekStartDate(today);
    const weekSheetName = getWeekSheetName(weekStartDate);
    Logger.log(`Looking for week sheet: ${weekSheetName}`);
    
    const weekSheet = ss.getSheetByName(weekSheetName);
    
    // If week sheet doesn't exist, calculate from Dashboard
    if (!weekSheet) {
      Logger.log(`Week sheet not found: ${weekSheetName}, calculating from Dashboard`);
      return calculateWeekDataFromDashboard(weekStartDate, today, householdEmails, result);
    }
    
    // If week sheet exists, aggregate household data from it
    Logger.log(`Found week sheet: ${weekSheetName}`);
    
    // Get all rows from the weekly sheet (assumes data starts at row 10)
    const lastRow = weekSheet.getLastRow();
    if (lastRow < 10) {
      return result; // No data rows yet
    }
    
    // This assumes weekly sheet has: Date, Points, PosActivities, NegActivities, Email
    const weekData = weekSheet.getRange(10, 1, lastRow - 9, 5).getValues();
    
    // Process all rows in the week sheet for the household
    let positiveCount = 0;
    let negativeCount = 0;
    const activityCounts = {};
    
    weekData.forEach(row => {
      const rowDate = row[0];
      const rowPoints = row[1] || 0;
      const rowPosActivities = row[2] || "";
      const rowNegActivities = row[3] || "";
      const rowEmail = row[4] || "";
      
      // Check if this row belongs to someone in the user's household
      if (householdEmails.length === 0 || 
          householdEmails.some(email => email.toLowerCase() === rowEmail.toString().toLowerCase())) {
        
        // Add points to weekly total
        result.weeklyTotal += rowPoints;
        
        // Count positive activities
        if (rowPosActivities) {
          const posActivities = rowPosActivities.split(", ");
          positiveCount += posActivities.filter(a => a.trim() !== "").length;
          
          // Count each activity for top activity calculation
          posActivities.forEach(activity => {
            if (activity && activity.trim()) {
              const match = activity.match(/➕\s(.+?)(\s\(🔥\d+\))?\s\(\+/);
              if (match) {
                const actName = match[1].trim();
                activityCounts[actName] = (activityCounts[actName] || 0) + 1;
              }
            }
          });
        }
        
        // Count negative activities
        if (rowNegActivities) {
          const negActivities = rowNegActivities.split(", ");
          negativeCount += negActivities.filter(a => a.trim() !== "").length;
          
          // Count each activity for top activity calculation
          negActivities.forEach(activity => {
            if (activity && activity.trim()) {
              const match = activity.match(/➖\s(.+?)\s\(/);
              if (match) {
                const actName = match[1].trim();
                activityCounts[actName] = (activityCounts[actName] || 0) + 1;
              }
            }
          });
        }
      }
    });
    
    // Update counts in result
    result.positiveCount = positiveCount;
    result.negativeCount = negativeCount;
    
    // Find top activity
    let maxCount = 0;
    for (const activity in activityCounts) {
      if (activityCounts[activity] > maxCount) {
        maxCount = activityCounts[activity];
        result.topActivity = activity;
      }
    }
    
    // Calculate average daily points for this week
    if (result.weeklyTotal !== 0) {
      // Get how many days of the current week have passed
      const daysPassed = Math.min(7, Math.floor((today - weekStartDate) / (24 * 60 * 60 * 1000)) + 1);
      result.dailyAverage = Math.round((result.weeklyTotal / daysPassed) * 10) / 10;
    }
    
    // Calculate weekly average from past weeks
    try {
      const sheets = ss.getSheets();
      const weekPrefix = CONFIG.SHEET_NAMES.WEEK_PREFIX;
      let weekSum = 0;
      let weekCount = 0;
      
      for (const sheet of sheets) {
        const sheetName = sheet.getName();
        if (sheetName.startsWith(weekPrefix) && sheetName !== weekSheetName) {
          try {
            // For past weeks, we need to calculate household total from scratch
            // This assumes the weekly sheets have data starting at row 10 with Email in column 5
            const lastRow = sheet.getLastRow();
            if (lastRow >= 10) {
              let weeklyTotal = 0;
              const weekData = sheet.getRange(10, 1, lastRow - 9, 5).getValues();
              
              weekData.forEach(row => {
                const rowEmail = row[4] || "";
                const rowPoints = row[1] || 0;
                
                if (householdEmails.length === 0 || 
                    householdEmails.some(email => email.toLowerCase() === rowEmail.toString().toLowerCase())) {
                  weeklyTotal += rowPoints;
                }
              });
              
              if (weeklyTotal !== 0) {
                weekSum += weeklyTotal;
                weekCount++;
              }
            }
          } catch (e) {
            Logger.log(`Error processing week sheet ${sheetName}: ${e}`);
          }
        }
      }
      
      if (weekCount > 0) {
        result.weeklyAverage = Math.round((weekSum / weekCount) * 10) / 10;
      }
    } catch (e) {
      Logger.log(`Error calculating weekly average: ${e}`);
    }
    
    return result;
    
  } catch (error) {
    Logger.log(`CRITICAL ERROR in getWeekData: ${error}`);
    Logger.log(`Stack: ${error.stack}`);
    
    // Return default object on error
    return {
      weeklyTotal: 0,
      positiveCount: 0,
      negativeCount: 0,
      topActivity: "None",
      dailyAverage: 0,
      weeklyAverage: 0,
      householdId: null,
      householdName: null
    };
  }
}

/**
 * Helper function to calculate week data from Dashboard when weekly sheet doesn't exist
 * @param {Date} weekStartDate - Start date of the week
 * @param {Date} today - Current date
 * @param {Array<string>} householdEmails - Array of emails in the household
 * @param {Object} result - The result object to populate
 * @return {Object} Updated result object
 */
function calculateWeekDataFromDashboard(weekStartDate, today, householdEmails, result) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  
  if (!dashboardSheet) {
    return result;
  }
  
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  
  const startDateStr = formatDateYMD(weekStartDate);
  const endDateStr = formatDateYMD(weekEndDate);
  
  const lastRow = dashboardSheet.getLastRow();
  if (lastRow <= 1) {
    return result;
  }
  
  // This assumes Dashboard has columns: Date, Points, Activities, PositiveCount, NegativeCount, WeekNumber, Email
  const data = dashboardSheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const activityCounts = {};
  
  for (let i = 0; i < data.length; i++) {
    const rowDate = data[i][0];
    if (!(rowDate instanceof Date)) continue;
    
    const dateStr = formatDateYMD(rowDate);
    const rowEmail = data[i][6] || "";
    
    // Check if date is in current week and belongs to someone in the household
    if (dateStr >= startDateStr && dateStr <= endDateStr && 
        (householdEmails.length === 0 || 
         householdEmails.some(email => email.toLowerCase() === rowEmail.toString().toLowerCase()))) {
      
      const rowPoints = data[i][1] || 0;
      const rowPosCount = data[i][3] || 0;
      const rowNegCount = data[i][4] || 0;
      const rowActivities = data[i][2] || "";
      
      result.weeklyTotal += rowPoints;
      result.positiveCount += rowPosCount;
      result.negativeCount += rowNegCount;
      
      // Count activities for top activity
      if (rowActivities) {
        const activitiesList = rowActivities.split(", ");
        activitiesList.forEach(activityStr => {
          const posMatch = activityStr.match(/➕\s(.+?)(\s\(🔥\d+\))?\s\(\+/);
          const negMatch = activityStr.match(/➖\s(.+?)\s\(/);
          
          let actName = null;
          if (posMatch) actName = posMatch[1].trim();
          else if (negMatch) actName = negMatch[1].trim();
          
          if (actName) {
            activityCounts[actName] = (activityCounts[actName] || 0) + 1;
          }
        });
      }
    }
  }
  
  // Find top activity
  let maxCount = 0;
  for (const activity in activityCounts) {
    if (activityCounts[activity] > maxCount) {
      maxCount = activityCounts[activity];
      result.topActivity = activity;
    }
  }
  
  // Calculate average daily points for this week
  if (result.weeklyTotal !== 0) {
    const daysPassed = Math.min(7, Math.floor((today - weekStartDate) / (24 * 60 * 60 * 1000)) + 1);
    result.dailyAverage = Math.round((result.weeklyTotal / daysPassed) * 10) / 10;
  }
  
  return result;
}

/**
 * Process web app submission with household awareness
 * @param {Array} activities - Array of selected activity names
 * @return {Object} Result with updated point totals
 */
function processWebAppSubmission(activities) {
  if (!activities || !Array.isArray(activities) || activities.length === 0) {
    return { success: false, message: "No activities submitted" };
  }
  
  try {
    // Get activity data
    const activityData = getActivityDataCached();
    
    // Process each activity
    const timestamp = new Date();
    const email = Session.getEffectiveUser().getEmail();
    let totalPoints = 0;
    const processedActivities = [];
    
    activities.forEach(activityName => {
      if (activityName) {
        const result = processActivityWithPoints(activityName, activityData);
        totalPoints += result.points;
        if (result.name) {
          processedActivities.push(result);
        }
      }
    });
    
    // Update Dashboard and Weekly sheets - these functions should handle
    // individual user's data regardless of household
    updateDashboard(timestamp, email, processedActivities, totalPoints);
    createOrUpdateWeeklySheet(timestamp, email, processedActivities, totalPoints);
    updateMobileView();
    
    // Get updated weekly total for the household
    const weekData = getWeekData();
    const updatedWeeklyTotal = weekData.weeklyTotal || 0;
    
    // Return updated totals
    return {
      success: true,
      points: totalPoints,
      weeklyTotal: updatedWeeklyTotal,
      goalsUpdated: true,
      activities: processedActivities,
      householdId: weekData.householdId,
      householdName: weekData.householdName,
      message: `Successfully logged ${activities.length} activities`
    };
  } catch (error) {
    Logger.log(`Error in processWebAppSubmission: ${error}\nStack: ${error.stack}`);
    return {
      success: false,
      message: `Error processing submission: ${error.message}`
    };
  }
}


// WebApp.gs - Add these new functions

/**
 * Gets configuration settings for the admin panel
 * @return {Object} Config settings and points reference data
 */
function getAdminConfigData() {
  const activityData = getActivityDataCached();
  const pointsRefData = getPointsReferenceData();
  
  // Get streak settings from CONFIG
  const streakSettings = {
    thresholds: {
      bonus1: CONFIG.STREAK_THRESHOLDS.BONUS_1,
      bonus2: CONFIG.STREAK_THRESHOLDS.BONUS_2,
      multiplier: CONFIG.STREAK_THRESHOLDS.MULTIPLIER
    },
    bonusPoints: {
      bonus1: CONFIG.STREAK_BONUS_POINTS.BONUS_1,
      bonus2: CONFIG.STREAK_BONUS_POINTS.BONUS_2
    }
  };
  
  return {
    pointsReference: pointsRefData,
    streakSettings: streakSettings,
    categories: CONFIG.CATEGORIES
  };
}

/**
 * Gets raw data from Points Reference sheet
 * @return {Array} Array of activities with points and categories
 */
function getPointsReferenceData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.POINTS_REFERENCE);
  
  if (!sheet) {
    return [];
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return []; // Only header row
  }
  
  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  
  return data.map(row => ({
    activity: row[0],
    points: row[1],
    category: row[2]
  }));
}

/**
 * Saves updated activities to Points Reference sheet
 * @param {Array} activities - Array of activity objects
 * @return {Object} Result with success status and message
 */
function saveActivitiesData(activities) {
  if (!activities || !Array.isArray(activities)) {
    return { success: false, message: "Invalid activities data" };
  }
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.POINTS_REFERENCE);
    
    if (!sheet) {
      return { success: false, message: "Points Reference sheet not found" };
    }
    
    // Clear existing data (except header)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 3).clearContent();
    }
    
    // Write new data
    if (activities.length > 0) {
      const newData = activities.map(activity => [
        activity.activity,
        activity.points,
        activity.category
      ]);
      
      sheet.getRange(2, 1, newData.length, 3).setValues(newData);
    }
    
    // Clear cache to force refresh
    CacheService.getScriptCache().remove('activityData');
    activityDataCache = null;
    
    // Update form
    updateFormFromSheet();
    
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
 * Updates streak and bonus settings in the PropertiesService
 * Note: This won't modify the CONFIG object directly in the current session,
 * but will be loaded on next script run
 * @param {Object} settings - Streak settings object
 * @return {Object} Result with success status
 */
function saveStreakSettings(settings) {
  if (!settings) {
    return { success: false, message: "Invalid settings data" };
  }
  
  try {
    const scriptProperties = PropertiesService.getScriptProperties();
    
    // Store settings as JSON
    scriptProperties.setProperty('STREAK_SETTINGS', JSON.stringify(settings));
    
    return { 
      success: true, 
      message: "Streak settings saved successfully. Changes will apply on next reload." 
    };
  } catch (error) {
    Logger.log(`Error saving streak settings: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error saving: ${error.message}` };
  }
}

/**
 * Gets all available weekly sheets
 * @return {Array} Array of week info objects
 */
function getAvailableWeeks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const weekPrefix = CONFIG.SHEET_NAMES.WEEK_PREFIX;
  
  const weekSheets = [];
  
  sheets.forEach(sheet => {
    const sheetName = sheet.getName();
    if (sheetName.startsWith(weekPrefix)) {
      // Extract date from sheet name format "Week of MM-DD-YYYY"
      const dateStr = sheetName.substring(weekPrefix.length).trim();
      
      try {
        // Parse date in MM-DD-YYYY format
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const month = parseInt(parts[0]) - 1; // JavaScript months are 0-based
          const day = parseInt(parts[1]);
          const year = parseInt(parts[2]);
          
          const weekStartDate = new Date(year, month, day);
          
          // Calculate week end date (Saturday)
          const weekEndDate = new Date(weekStartDate);
          weekEndDate.setDate(weekEndDate.getDate() + 6);
          
          weekSheets.push({
            sheetName: sheetName,
            startDate: formatDateYMD(weekStartDate),
            endDate: formatDateYMD(weekEndDate),
            displayName: `Week of ${Utilities.formatDate(weekStartDate, Session.getScriptTimeZone(), "MMM d, yyyy")}`
          });
        }
      } catch (e) {
        Logger.log(`Error parsing date from sheet ${sheetName}: ${e}`);
      }
    }
  });
  
  // Sort by date (most recent first)
  weekSheets.sort((a, b) => b.startDate.localeCompare(a.startDate));
  
  return weekSheets;
}

// Add to WebApp.gs

/**
 * Helper function to get the script URL for the web app
 * @return {string} The web app URL
 */
function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

// WebApp.gs - Updated functions with date formatting fix

/**
 * Gets historical data for visualizations with household filtering
 * @return {Object} Data for charts including daily and weekly trends
 */
function getHistoricalData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  
  if (!dashboardSheet) {
    return { success: false, message: "Dashboard sheet not found" };
  }
  
  // Get current user's email and household
  const email = Session.getEffectiveUser().getEmail();
  const householdId = getUserHouseholdId(email);
  let householdEmails = [];
  
  if (householdId) {
    householdEmails = getHouseholdEmails(householdId);
    Logger.log(`Found ${householdEmails.length} members in household for ${email}`);
  } else {
    // No household found, just use current user's email
    householdEmails = [email];
    Logger.log(`No household found for ${email}, using individual data`);
  }
  
  // Get daily data from dashboard
  const lastRow = dashboardSheet.getLastRow();
  let dailyData = [];
  
  if (lastRow > 1) {
    // Important: For historical data, don't filter strictly by household email
    // Instead, include all data if it's old (before households were implemented)
    // or if it belongs to the current household
    
    // This assumes Dashboard has: Date, Points, Activities, PositiveCount, NegativeCount, WeekNumber, Email
    // If Email is in a different column, adjust the column index accordingly
    const data = dashboardSheet.getRange(2, 1, lastRow - 1, dashboardSheet.getLastColumn()).getValues();
    const timezone = Session.getScriptTimeZone();
    
    // Create a map to aggregate data by date
    const dateMap = new Map();
    
    // Determine cutoff date for historical data (adjust this based on when you implemented households)
    const householdImplementationDate = new Date("2025-04-01"); // Set this to when you implemented households
    
    data.forEach(row => {
      const dateObj = row[0];
      // Find which column has the email (might not be column 7)
      // Assume column 7 if email column exists, otherwise no filtering
      const rowEmail = row.length >= 7 ? (row[6] || "") : "";
      
      // Skip invalid dates
      if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
        return;
      }
      
      // Include row if:
      // 1. It's before households were implemented OR
      // 2. No email column exists (pre-household data) OR
      // 3. The email is part of the household
      const isBeforeHouseholds = dateObj < householdImplementationDate;
      const isInHousehold = householdEmails.some(email => 
        email.toLowerCase() === rowEmail.toString().toLowerCase());
      
      if (isBeforeHouseholds || rowEmail === "" || isInHousehold) {
        const dateStr = formatDateYMD(dateObj);
        const points = row[1] || 0;
        const activities = row[2] || "";
        
        // Aggregate by date
        if (!dateMap.has(dateStr)) {
          dateMap.set(dateStr, {
            date: dateStr,
            displayDate: Utilities.formatDate(dateObj, timezone, "MMM d"),
            points: 0,
            activities: ""
          });
        }
        
        // Add points and activities
        const entry = dateMap.get(dateStr);
        entry.points += points;
        
        if (activities) {
          if (entry.activities) {
            entry.activities += ", " + activities;
          } else {
            entry.activities = activities;
          }
        }
      }
    });
    
    // Convert map to array and sort by date
    dailyData = Array.from(dateMap.values());
    dailyData.sort((a, b) => a.date.localeCompare(b.date));
  }
  
  // Get weekly data with the same historical data approach
  const weeklyData = getWeeklyHistoricalDataForHousehold(householdEmails);
  
  // Get streak data
  let streakData = { buildingStreaks: {}, streaks: {} };
  try {
    if (typeof trackActivityStreaksForHousehold === "function") {
      streakData = trackActivityStreaksForHousehold(householdId) || { buildingStreaks: {}, streaks: {} };
    } else if (typeof trackActivityStreaks === "function") {
      // Fallback to regular streak tracking if household version doesn't exist
      streakData = trackActivityStreaks();
      Logger.log("Using regular streak tracking - household version not found");
    }
  } catch (e) {
    Logger.log(`Error getting streak data: ${e}`);
  }
  
  // Calculate moving average for daily points (7-day)
  const movingAverages = calculateMovingAverages(dailyData, 7);
  
  return {
    success: true,
    dailyData: dailyData,
    weeklyData: weeklyData,
    streakData: streakData,
    movingAverages: movingAverages,
    householdId: householdId,
    householdName: householdId ? getHouseholdName(householdId) : null
  };
}

/**
 * Gets weekly historical data with a flexible approach for households
 * @param {Array<string>} householdEmails - Array of emails in household
 * @return {Array} Filtered weekly data
 */
function getWeeklyHistoricalDataForHousehold(householdEmails) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const weekPrefix = CONFIG.SHEET_NAMES.WEEK_PREFIX;
  const timezone = Session.getScriptTimeZone();
  
  const weeklyData = [];
  
  // Determine cutoff date for historical data
  const householdImplementationDate = new Date("2025-04-01"); // Set this to when you implemented households
  
  sheets.forEach(sheet => {
    const sheetName = sheet.getName();
    if (sheetName.startsWith(weekPrefix)) {
      try {
        // Extract date from sheet name format "Week of MM-DD-YYYY"
        const dateStr = sheetName.substring(weekPrefix.length).trim();
        const parts = dateStr.split('-');
        
        if (parts.length === 3) {
          const month = parseInt(parts[0]) - 1; // JavaScript months are 0-based
          const day = parseInt(parts[1]);
          const year = parseInt(parts[2]);
          
          // Create proper Date object
          const weekStartDate = new Date(year, month, day);
          
          // Validate date
          if (!(weekStartDate instanceof Date) || isNaN(weekStartDate.getTime())) {
            Logger.log(`Invalid date in sheet name: ${sheetName}`);
            return; // Skip this sheet
          }
          
          // Get data rows
          const lastRow = sheet.getLastRow();
          if (lastRow < 10) {
            return; // No data rows
          }
          
          // For historical data:
          // 1. Include all data from weeks before households implementation
          // 2. For recent weeks, filter by household
          const isBeforeHouseholds = weekStartDate < householdImplementationDate;
          
          // Process all rows in this sheet
          let totalPoints = 0;
          let positiveCount = 0;
          let negativeCount = 0;
          const activityCounts = {};
          const dailyBreakdown = {
            sunday: 0, monday: 0, tuesday: 0, wednesday: 0, 
            thursday: 0, friday: 0, saturday: 0
          };
          
          // Find which columns have the data we need
          // Assume it's: Date, Points, PosAct, NegAct, Email
          // If the sheet doesn't have all columns, adapt accordingly
          const data = sheet.getRange(10, 1, lastRow - 9, sheet.getLastColumn()).getValues();
          
          for (const row of data) {
            const rowDate = row[0];
            const rowPoints = row[1] || 0;
            const rowPosAct = row.length > 2 ? (row[2] || "") : "";
            const rowNegAct = row.length > 3 ? (row[3] || "") : "";
            const rowEmail = row.length > 4 ? (row[4] || "") : "";
            
            // Check if we should include this row
            const isInHousehold = householdEmails.some(email => 
              email.toLowerCase() === rowEmail.toString().toLowerCase());
              
            if (isBeforeHouseholds || rowEmail === "" || isInHousehold) {
              totalPoints += rowPoints;
              
              // Count positive activities
              if (rowPosAct) {
                const posCount = rowPosAct.split(",").filter(a => a.trim()).length;
                positiveCount += posCount;
                
                // Process for top activity
                rowPosAct.split(",").forEach(act => {
                  if (act.trim()) {
                    const match = act.trim().match(/➕\s(.+?)(\s\(🔥\d+\))?\s\(\+/);
                    if (match) {
                      const name = match[1].trim();
                      activityCounts[name] = (activityCounts[name] || 0) + 1;
                    }
                  }
                });
              }
              
              // Count negative activities
              if (rowNegAct) {
                const negCount = rowNegAct.split(",").filter(a => a.trim()).length;
                negativeCount += negCount;
                
                // Process for top activity
                rowNegAct.split(",").forEach(act => {
                  if (act.trim()) {
                    const match = act.trim().match(/➖\s(.+?)\s\(/);
                    if (match) {
                      const name = match[1].trim();
                      activityCounts[name] = (activityCounts[name] || 0) + 1;
                    }
                  }
                });
              }
              
              // Add to daily breakdown
              if (rowDate instanceof Date) {
                const day = rowDate.getDay(); // 0 = Sunday, 6 = Saturday
                switch (day) {
                  case 0: dailyBreakdown.sunday += rowPoints; break;
                  case 1: dailyBreakdown.monday += rowPoints; break;
                  case 2: dailyBreakdown.tuesday += rowPoints; break;
                  case 3: dailyBreakdown.wednesday += rowPoints; break;
                  case 4: dailyBreakdown.thursday += rowPoints; break;
                  case 5: dailyBreakdown.friday += rowPoints; break;
                  case 6: dailyBreakdown.saturday += rowPoints; break;
                }
              }
            }
          }
          
          // Find top activity
          let topActivity = "None";
          let maxCount = 0;
          for (const activity in activityCounts) {
            if (activityCounts[activity] > maxCount) {
              maxCount = activityCounts[activity];
              topActivity = activity;
            }
          }
          
          // Add to weekly data
          weeklyData.push({
            startDate: formatDateYMD(weekStartDate),
            displayDate: Utilities.formatDate(weekStartDate, timezone, "MMM d, yyyy"),
            totalPoints: totalPoints,
            positiveCount: positiveCount,
            negativeCount: negativeCount,
            topActivity: topActivity,
            topActivityCount: maxCount,
            dailyBreakdown: dailyBreakdown
          });
        }
      } catch (e) {
        Logger.log(`Error processing week sheet ${sheetName}: ${e}`);
      }
    }
  });
  
  // Sort by date
  weeklyData.sort((a, b) => a.startDate.localeCompare(b.startDate));
  
  return weeklyData;
}

/**
 * Calculates moving averages from daily data
 * @param {Array} dailyData - Array of daily data points
 * @param {number} window - Number of days for moving average window
 * @return {Array} Moving averages array
 */
function calculateMovingAverages(dailyData, window) {
  const movingAverages = [];
  
  if (!dailyData || dailyData.length === 0) {
    return movingAverages;
  }
  
  // Initialize sum and count
  let sum = 0;
  let count = 0;
  
  // Calculate for each day
  for (let i = 0; i < dailyData.length; i++) {
    // Add current day's points
    sum += dailyData[i].points;
    count++;
    
    // If we have more than 'window' days, remove the oldest
    if (count > window) {
      sum -= dailyData[i - window].points;
      count = window;
    }
    
    // Calculate average
    const avg = count > 0 ? sum / count : 0;
    
    movingAverages.push({
      date: dailyData[i].date,
      displayDate: dailyData[i].displayDate,
      average: Math.round(avg * 10) / 10 // Round to 1 decimal
    });
  }
  
  return movingAverages;
}

/**
 * Forces sending the daily digest email
 * @return {Object} Result with success status
 */
function forceSendDailyDigest() {
  try {
    const result = sendDailyDigest();
    return {
      success: result,
      message: result ? "Daily digest email sent successfully" : "Failed to send daily digest"
    };
  } catch (error) {
    Logger.log(`Error sending daily digest: ${error}\nStack: ${error.stack}`);
    return {
      success: false,
      message: `Error sending email: ${error.message}`
    };
  }
}

/**
 * Debug function to test weekly data retrieval
 * We can call this directly from the browser developer console
 */
function debugWeeklyData() {
  try {
    Logger.log("--- DEBUG: getWeekData START ---");
    const result = getWeekData();
    Logger.log("getWeekData result: " + JSON.stringify(result));
    Logger.log("--- DEBUG: getWeekData END ---");
    return result;
  } catch (error) {
    Logger.log("DEBUG ERROR: " + error);
    Logger.log("Stack: " + error.stack);
    return { error: error.toString(), stack: error.stack };
  }
}

/**
 * Direct diagnostics function to test the weekly data retrieval
 */
function diagnoseWeeklyData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const today = new Date();
    const weekStartDate = getWeekStartDate(today);
    const weekSheetName = getWeekSheetName(weekStartDate);
    
    const result = {
      weekSheetExists: false,
      weekSheetName: weekSheetName,
      weeklyTotal: null,
      weeklyTotalType: null,
      error: null
    };
    
    const weekSheet = ss.getSheetByName(weekSheetName);
    
    if (weekSheet) {
      result.weekSheetExists = true;
      
      try {
        const weeklyTotal = weekSheet.getRange("B3").getValue();
        result.weeklyTotal = weeklyTotal;
        result.weeklyTotalType = typeof weeklyTotal;
      } catch (e) {
        result.error = "Error reading B3: " + e.toString();
      }
    }
    
    Logger.log("diagnoseWeeklyData result: " + JSON.stringify(result));
    return result;
    
  } catch (error) {
    Logger.log("Error in diagnoseWeeklyData: " + error);
    return { error: error.toString() };
  }
}

/**
 * Gets data for weekly goal tracking
 * @return {Object} Weekly goals data including current and previous week totals and status
 */
function getWeeklyGoalsData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Get current and previous week information
    const today = new Date();
    const currentWeekStart = getWeekStartDate(today);
    
    // Calculate previous week start (7 days before current week start)
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    
    // Get sheet names
    const currentWeekSheetName = getWeekSheetName(currentWeekStart);
    const previousWeekSheetName = getWeekSheetName(previousWeekStart);
    
    Logger.log(`Current week sheet: ${currentWeekSheetName}, Previous week sheet: ${previousWeekSheetName}`);
    
    // Initialize result with default values
    const result = {
      currentWeek: {
        sheetName: currentWeekSheetName,
        total: 0,
        exists: false
      },
      previousWeek: {
        sheetName: previousWeekSheetName,
        total: 0,
        exists: false
      },
      goals: {
        higherThanPrevious: {
          achieved: false,
          description: "Higher point total than previous week",
          target: 0, // Will be set to previous week's total
          current: 0, // Will be set to current week's total
          percentComplete: 0
        },
        doublePoints: {
          achieved: false,
          description: "Double the point total from previous week",
          target: 0, // Will be set to double previous week's total
          current: 0, // Will be set to current week's total
          percentComplete: 0
        }
      }
    };
    
    // Get previous week data
    const previousWeekSheet = ss.getSheetByName(previousWeekSheetName);
    if (previousWeekSheet) {
      result.previousWeek.exists = true;
      try {
        const previousTotal = previousWeekSheet.getRange("B3").getValue();
        if (typeof previousTotal === 'number') {
          result.previousWeek.total = previousTotal;
        }
      } catch (e) {
        Logger.log(`Error reading previous week total: ${e}`);
      }
    } else {
      Logger.log(`Previous week sheet not found: ${previousWeekSheetName}`);
    }
    
    // Get current week data
    const currentWeekSheet = ss.getSheetByName(currentWeekSheetName);
    if (currentWeekSheet) {
      result.currentWeek.exists = true;
      try {
        const currentTotal = currentWeekSheet.getRange("B3").getValue();
        if (typeof currentTotal === 'number') {
          result.currentWeek.total = currentTotal;
        }
      } catch (e) {
        Logger.log(`Error reading current week total: ${e}`);
      }
    } else {
      Logger.log(`Current week sheet not found: ${currentWeekSheetName}`);
    }
    
    // Calculate goal status
    if (result.previousWeek.exists) {
      // Set targets
      result.goals.higherThanPrevious.target = result.previousWeek.total;
      result.goals.doublePoints.target = result.previousWeek.total * 2;
      
      // Set current values
      result.goals.higherThanPrevious.current = result.currentWeek.total;
      result.goals.doublePoints.current = result.currentWeek.total;
      
      // Check if goals achieved
      result.goals.higherThanPrevious.achieved = result.currentWeek.total > result.previousWeek.total;
      result.goals.doublePoints.achieved = result.currentWeek.total >= (result.previousWeek.total * 2);
      
      // Calculate percentage complete (cap at 100%)
      if (result.previousWeek.total > 0) {
        // For goal 1 (higher than previous)
        const goal1Percent = (result.currentWeek.total / result.previousWeek.total) * 100;
        result.goals.higherThanPrevious.percentComplete = Math.min(100, goal1Percent);
        
        // For goal 2 (double points)
        const goal2Percent = (result.currentWeek.total / (result.previousWeek.total * 2)) * 100;
        result.goals.doublePoints.percentComplete = Math.min(100, goal2Percent);
      } else if (result.previousWeek.total === 0) {
        // If previous week was 0, any positive number is an achievement
        if (result.currentWeek.total > 0) {
          result.goals.higherThanPrevious.percentComplete = 100;
          result.goals.higherThanPrevious.achieved = true;
          
          // For doubling, any positive is technically infinite improvement
          result.goals.doublePoints.percentComplete = 100;
          result.goals.doublePoints.achieved = true;
        } else {
          // Both are still at 0
          result.goals.higherThanPrevious.percentComplete = 0;
          result.goals.doublePoints.percentComplete = 0;
        }
      }
      
      // Round percentages to whole numbers
      result.goals.higherThanPrevious.percentComplete = Math.round(result.goals.higherThanPrevious.percentComplete);
      result.goals.doublePoints.percentComplete = Math.round(result.goals.doublePoints.percentComplete);
    } else {
      // No previous week data available
      Logger.log("No previous week data available for goal comparison");
    }
    
    Logger.log(`Weekly goals data: ${JSON.stringify(result)}`);
    return result;
    
  } catch (error) {
    Logger.log(`Error in getWeeklyGoalsData: ${error}`);
    Logger.log(`Stack: ${error.stack}`);
    
    // Return a minimal valid object on error
    return {
      currentWeek: { total: 0, exists: false },
      previousWeek: { total: 0, exists: false },
      goals: {
        higherThanPrevious: { achieved: false, description: "Higher point total than previous week", percentComplete: 0 },
        doublePoints: { achieved: false, description: "Double the point total from previous week", percentComplete: 0 }
      }
    };
  }
}

/**
 * Gets historical goal achievement data across all weeks
 * @return {Object} Data about goal achievements over time
 */
function getGoalAchievementHistory() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    const weekPrefix = CONFIG.SHEET_NAMES.WEEK_PREFIX;
    
    // Collect all weekly sheets and their totals
    const weeklyData = [];
    
    sheets.forEach(sheet => {
      const sheetName = sheet.getName();
      if (sheetName.startsWith(weekPrefix)) {
        try {
          // Extract date from sheet name format "Week of MM-DD-YYYY"
          const dateStr = sheetName.substring(weekPrefix.length).trim();
          const parts = dateStr.split('-');
          
          if (parts.length === 3) {
            const month = parseInt(parts[0]) - 1; // JavaScript months are 0-based
            const day = parseInt(parts[1]);
            const year = parseInt(parts[2]);
            
            // Create proper Date object
            const weekStartDate = new Date(year, month, day);
            
            // Skip if invalid date
            if (!(weekStartDate instanceof Date) || isNaN(weekStartDate.getTime())) {
              return; // 'return' skips current iteration in forEach, not 'continue'
            }
            
            // Get weekly total from B3
            const total = sheet.getRange("B3").getValue();
            if (typeof total === 'number') {
              weeklyData.push({
                startDate: weekStartDate,
                sheetName: sheetName,
                total: total
              });
            }
          }
        } catch (e) {
          Logger.log(`Error processing week sheet ${sheetName}: ${e}`);
        }
      }
    });
    
    // Sort weekly data by date (oldest first)
    weeklyData.sort((a, b) => a.startDate - b.startDate);
    
    // Initialize result object
    const result = {
      weeklyTotals: [],
      goalAchievements: {
        higherThanPrevious: {
          totalAchieved: 0,
          achievedWeeks: []
        },
        doublePoints: {
          totalAchieved: 0,
          achievedWeeks: []
        }
      }
    };
    
    // Process weekly data to find goal achievements
    for (let i = 1; i < weeklyData.length; i++) { // Start from index 1 to compare with previous
      const currentWeek = weeklyData[i];
      const previousWeek = weeklyData[i-1];
      
      // Format for display
      const weekDateStr = Utilities.formatDate(currentWeek.startDate, Session.getScriptTimeZone(), "MMM d, yyyy");
      
      // Add to weekly totals array
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
      
      // Check goal 2: Double points from previous week
      if (currentWeek.total >= (previousWeek.total * 2)) {
        result.goalAchievements.doublePoints.totalAchieved++;
        result.goalAchievements.doublePoints.achievedWeeks.push({
          week: weekDateStr,
          current: currentWeek.total,
          previous: previousWeek.total,
          multiplier: previousWeek.total > 0 ? 
            Math.round((currentWeek.total / previousWeek.total) * 10) / 10 : 
            "∞" // Handle division by zero
        });
      }
    }
    
    Logger.log(`Goal achievement history: ${JSON.stringify(result)}`);
    return result;
    
  } catch (error) {
    Logger.log(`Error in getGoalAchievementHistory: ${error}`);
    Logger.log(`Stack: ${error.stack}`);
    
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
