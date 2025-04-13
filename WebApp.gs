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
 * Gets the current day's points and activities
 * @return {Object} Current day totals and activities
 */
function getTodayData() {
  const today = new Date();
  const formattedDate = formatDateYMD(today);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  
  if (!dashboardSheet) {
    return { points: 0, activities: [] };
  }
  
  let todayPoints = 0;
  let todayActivitiesStr = "";
  const lastRow = dashboardSheet.getLastRow();
  
  if (lastRow > 1) {
    const dates = dashboardSheet.getRange(2, 1, lastRow-1, 1).getValues();
    const data = dashboardSheet.getRange(2, 1, lastRow-1, 3).getValues(); // A:C
    
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i][0] instanceof Date && formatDateYMD(dates[i][0]) === formattedDate) {
        todayPoints = data[i][1] || 0;
        todayActivitiesStr = data[i][2] || "";
        break;
      }
    }
  }
  
  // Parse activities from the string format
  const activities = [];
  if (todayActivitiesStr) {
    const activitiesList = todayActivitiesStr.split(", ");
    activitiesList.forEach(activityStr => {
      // Parse out activity name from the format string
      const match = activityStr.match(/(➕|➖)\s(.+?)\s(\(🔥\d+\))?\s\(([+-]\d+)\)/);
      if (match) {
        const isPositive = match[1] === "➕";
        const name = match[2];
        const points = parseInt(match[4]);
        activities.push({ name, points, isPositive });
      }
    });
  }
  
  return { 
    points: todayPoints, 
    activities: activities 
  };
}

/**
 * Gets the current week's data
 * @return {Object} Weekly totals and averages
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
      weeklyAverage: 0
    };
    
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
    
    // If week sheet exists, get data directly from it
    if (weekSheet) {
      Logger.log(`Found week sheet: ${weekSheetName}`);
      
      // Get the total weekly points (cell B3)
      try {
        const weeklyTotal = weekSheet.getRange("B3").getValue();
        if (typeof weeklyTotal === 'number') {
          result.weeklyTotal = weeklyTotal;
          Logger.log(`Read weekly total from sheet: ${result.weeklyTotal}`);
          
          // Get other values
          const positiveCount = weekSheet.getRange("B4").getValue();
          const negativeCount = weekSheet.getRange("B5").getValue();
          const topActivity = weekSheet.getRange("B6").getValue();
          
          if (typeof positiveCount === 'number') result.positiveCount = positiveCount;
          if (typeof negativeCount === 'number') result.negativeCount = negativeCount;
          if (topActivity) result.topActivity = topActivity;
        } else {
          Logger.log(`WARNING: Weekly total is not a number: ${weeklyTotal}`);
        }
      } catch (e) {
        Logger.log(`ERROR reading from week sheet: ${e}`);
      }
    } else {
      Logger.log(`Week sheet not found: ${weekSheetName}`);
    }
    
    // Calculate averages
    try {
      // Calculate daily average
      const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
      if (dashboardSheet) {
        const lastRow = dashboardSheet.getLastRow();
        if (lastRow > 1) {
          const points = dashboardSheet.getRange(2, 2, lastRow-1, 1).getValues();
          let sum = 0;
          let count = 0;
          
          points.forEach(row => {
            if (typeof row[0] === 'number') {
              sum += row[0];
              count++;
            }
          });
          
          if (count > 0) {
            result.dailyAverage = Math.round((sum / count) * 10) / 10;
          }
        }
      }
      
      // Calculate weekly average
      const sheets = ss.getSheets();
      const weekPrefix = CONFIG.SHEET_NAMES.WEEK_PREFIX;
      let weekSum = 0;
      let weekCount = 0;
      
      sheets.forEach(sheet => {
        const sheetName = sheet.getName();
        if (sheetName.startsWith(weekPrefix)) {
          try {
            const total = sheet.getRange("B3").getValue();
            if (typeof total === 'number') {
              weekSum += total;
              weekCount++;
            }
          } catch (e) {
            // Skip this sheet
          }
        }
      });
      
      if (weekCount > 0) {
        result.weeklyAverage = Math.round((weekSum / weekCount) * 10) / 10;
      }
    } catch (e) {
      Logger.log(`ERROR calculating averages: ${e}`);
    }
    
    // Final sanity check to ensure object is properly formatted
    Logger.log(`FINAL RESULT for getWeekData: ${JSON.stringify(result)}`);
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
      weeklyAverage: 0
    };
  }
}

/**
 * Processes activity submissions from the web app
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
    
    // Update Dashboard and Weekly sheets
    updateDashboard(timestamp, email, processedActivities, totalPoints);
    createOrUpdateWeeklySheet(timestamp, email, processedActivities, totalPoints);
    updateMobileView();
    
    // Return updated totals
    return {
      success: true,
      points: totalPoints,
      weeklyTotal: updatedWeeklyTotal,
      goalsUpdated: true,
      activities: processedActivities,
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
 * Gets historical data for visualizations
 * @return {Object} Data for charts including daily and weekly trends
 */
function getHistoricalData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  
  if (!dashboardSheet) {
    return { success: false, message: "Dashboard sheet not found" };
  }
  
  // Get daily data from dashboard
  const lastRow = dashboardSheet.getLastRow();
  let dailyData = [];
  
  if (lastRow > 1) {
    const data = dashboardSheet.getRange(2, 1, lastRow - 1, 3).getValues(); // A2:C<lastRow>
    const timezone = Session.getScriptTimeZone();
    
    dailyData = data.map(row => {
      // Ensure date is a proper Date object
      const dateObj = row[0] instanceof Date ? row[0] : new Date(row[0]);
      
      // Skip invalid dates
      if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
        return null;
      }
      
      // Create daily data entry with date and points
      return {
        date: formatDateYMD(dateObj),
        displayDate: Utilities.formatDate(dateObj, timezone, "MMM d"),
        points: row[1] || 0,
        activities: row[2] || ""
      };
    }).filter(item => item !== null); // Filter out invalid entries
    
    // Sort by date
    dailyData.sort((a, b) => a.date.localeCompare(b.date));
  }
  
  // Get weekly data from weekly sheets
  const weeklyData = getWeeklyHistoricalData();
  
  // Get streak data
  let streakData = { buildingStreaks: {}, streaks: {} };
  try {
    if (typeof trackActivityStreaks === "function") {
      streakData = trackActivityStreaks() || { buildingStreaks: {}, streaks: {} };
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
    movingAverages: movingAverages
  };
}

/**
 * Gets weekly historical data from all week sheets
 * @return {Array} Array of weekly data objects
 */
function getWeeklyHistoricalData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const weekPrefix = CONFIG.SHEET_NAMES.WEEK_PREFIX;
  const timezone = Session.getScriptTimeZone();
  
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
          
          // Validate date
          if (!(weekStartDate instanceof Date) || isNaN(weekStartDate.getTime())) {
            Logger.log(`Invalid date in sheet name: ${sheetName}`);
            return; // Skip this sheet
          }
          
          // Get weekly totals from the sheet
          const totalPoints = sheet.getRange("B3").getValue() || 0;
          const positiveCount = sheet.getRange("B4").getValue() || 0;
          const negativeCount = sheet.getRange("B5").getValue() || 0;
          
          // Get daily breakdown
          const dailyPoints = sheet.getRange("H8:H14").getValues().map(row => row[0] || 0);
          
          weeklyData.push({
            startDate: formatDateYMD(weekStartDate),
            displayDate: Utilities.formatDate(weekStartDate, timezone, "MMM d, yyyy"),
            totalPoints: totalPoints,
            positiveCount: positiveCount,
            negativeCount: negativeCount,
            dailyBreakdown: {
              sunday: dailyPoints[0],
              monday: dailyPoints[1],
              tuesday: dailyPoints[2],
              wednesday: dailyPoints[3],
              thursday: dailyPoints[4],
              friday: dailyPoints[5],
              saturday: dailyPoints[6]
            }
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
