// ActivityProcessing.gs
/**
 * Budget Game - Shared Activity Processing Functions
 * Contains functions used by both the Google Form and Web App
 */

/**
 * Gets all activities logged in a specific week, optionally filtered by household
 * @param {Date} startDate - Start date (Sunday) of the week
 * @param {Date} endDate - End date (Saturday) of the week
 * @param {Array<string>} [householdEmails] - Optional array of emails to filter by household
 * @return {Array} Array of activity objects with name, points, and categories
 */
function getWeekActivities(startDate, endDate, householdEmails) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const formResponsesSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.FORM_RESPONSES);
  
  if (!formResponsesSheet) {
    return [];
  }
  
  // Format dates for comparison
  const startDateStr = formatDateYMD(startDate);
  const endDateStr = formatDateYMD(endDate);
  
  // Get all form responses
  const lastRow = formResponsesSheet.getLastRow();
  if (lastRow <= 1) {
    return []; // No data beyond header
  }
  
  // Determine if this is historical data (before households were implemented)
  const householdImplementationDate = new Date("2025-04-01"); // Set this to when you implemented households
  const isHistoricalData = endDate < householdImplementationDate;
  
  // Get data range - look at all columns to find email
  const formData = formResponsesSheet.getRange(2, 1, lastRow - 1, formResponsesSheet.getLastColumn()).getValues();
  const activityData = getActivityDataCached();
  
  // Try to determine which column has email information (if any)
  let emailColumnIndex = -1;
  if (formData.length > 0) {
    // Look for a column that looks like emails
    for (let i = 0; i < formData[0].length; i++) {
      // Check a few rows to see if this column contains email-like strings
      let emailLikeCount = 0;
      for (let j = 0; j < Math.min(5, formData.length); j++) {
        if (formData[j][i] && 
            typeof formData[j][i] === 'string' && 
            formData[j][i].includes('@')) {
          emailLikeCount++;
        }
      }
      if (emailLikeCount >= 2) { // If multiple rows have email-like values
        emailColumnIndex = i;
        break;
      }
    }
  }
  
  // Process responses within date range
  const activities = [];
  
  formData.forEach(row => {
    const timestamp = row[0]; // Assuming timestamp is in first column
    
    // Skip if invalid timestamp
    if (!(timestamp instanceof Date) || timestamp.getTime() === 0) {
      return;
    }
    
    const dateStr = formatDateYMD(timestamp);
    
    // Check if date is within range
    if (dateStr >= startDateStr && dateStr <= endDateStr) {
      let shouldInclude = true;
      
      // Get email if we have an email column
      let email = "Unknown";
      if (emailColumnIndex >= 0 && row.length > emailColumnIndex) {
        email = row[emailColumnIndex].toString().trim();
      }
      
      // For non-historical data, check if email is in the household
      if (!isHistoricalData && householdEmails && householdEmails.length > 0) {
        shouldInclude = householdEmails.some(e => e.toLowerCase() === email.toLowerCase());
      }
      
      if (shouldInclude) {
        // Process each activity column (starting after the timestamp)
        for (let col = 1; col < row.length; col++) {
          // Skip the email column
          if (col === emailColumnIndex) continue;
          
          const cellValue = row[col];
          
          // Skip Yes/No answers and empty cells
          if (cellValue && 
              typeof cellValue === 'string' && 
              cellValue.trim() !== 'Yes' && 
              cellValue.trim() !== 'No') {
            
            const cellResult = processCheckboxCell(cellValue);
            
            // Add each activity with its details
            cellResult.activities.forEach(activity => {
              activities.push({
                name: activity.name,
                points: activity.points,
                category: activity.category,
                date: new Date(timestamp),
                email: email,
                streakInfo: activity.streakInfo
              });
            });
          }
        }
      }
    }
  });
  
  return activities;
}

/**
 * Calculates summary statistics from an array of activities
 * @param {Array} activities - Array of activity objects
 * @param {Object} activityData - Cache of activity data (optional)
 * @return {Object} Summary object with counts and totals
 */
function calculateSummaryFromActivities(activities, activityData = null) {
  if (!Array.isArray(activities) || activities.length === 0) {
    return {
      total: 0,
      positive: 0,
      negative: 0,
      topActivity: "None",
      topActivityCount: 0,
      categories: {
        "Positive Activities": 0,
        "Negative Activities": 0,
        "Health Activities": 0,
        "Household Activities": 0
      }
    };
  }
  
  // Get activity data if not provided
  if (!activityData) {
    activityData = getActivityDataCached();
  }
  
  let totalPoints = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  const activityCounts = {};
  const categoryCounts = {
    "Positive Activities": 0,
    "Negative Activities": 0,
    "Health Activities": 0,
    "Household Activities": 0
  };
  
  activities.forEach(activity => {
    // Count points
    totalPoints += activity.points;
    
    // Count positive/negative
    if (activity.points > 0) {
      positiveCount++;
      categoryCounts["Positive Activities"]++;
    } else if (activity.points < 0) {
      negativeCount++;
      categoryCounts["Negative Activities"]++;
    }
    
    // Count by specific category
    if (activity.category === "Health") {
      categoryCounts["Health Activities"]++;
    } else if (activity.category === "Household") {
      categoryCounts["Household Activities"]++;
    }
    
    // Count each activity for top activity
    activityCounts[activity.name] = (activityCounts[activity.name] || 0) + 1;
  });
  
  // Find top activity
  let topActivityName = "None";
  let maxCount = 0;
  for (const activity in activityCounts) {
    if (activityCounts[activity] > maxCount) {
      maxCount = activityCounts[activity];
      topActivityName = activity;
    }
  }
  
  return {
    total: totalPoints,
    positive: positiveCount,
    negative: negativeCount,
    topActivity: topActivityName,
    topActivityCount: maxCount,
    categories: categoryCounts
  };
}
