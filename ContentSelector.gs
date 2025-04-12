/**
 * Content selection utilities for Budget Game v3
 * Provides functions to select appropriate content from the content library
 * based on various factors like day of week, streaks, user history, etc.
 */

/**
 * Selects an appropriate greeting based on day of week and other factors.
 * @return {string} A selected greeting from the content library
 */
function selectGreeting() {
  const contentLibrary = createComprehensiveContentLibrary();
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Day-specific greetings (indexes 0-6 are day-specific)
  if (dayOfWeek < 7 && contentLibrary.greetings[dayOfWeek]) {
    return contentLibrary.greetings[dayOfWeek];
  }
  
  // Fallback to random greeting
  const startIndex = 7; // Skip day-specific greetings
  const randomIndex = startIndex + Math.floor(Math.random() * (contentLibrary.greetings.length - startIndex));
  return contentLibrary.greetings[randomIndex];
}

/**
 * Selects a main message based on user history and preferred categories.
 * @param {object} userContext Data about recent user activity to personalize selection
 * @return {string} A selected main message from the content library
 */
function selectMainMessage(userContext = {}) {
  const contentLibrary = createComprehensiveContentLibrary();
  let messageCategory = '';
  
  // Use the userContext to determine the most relevant category
  // Default weighting for categories
  const categoryWeights = {
    financial: 20,
    health: 20,
    household: 20,
    discipline: 20,
    achievement: 20
  };
  
  // Adjust weights based on userContext
  if (userContext.recentNegativeActivities && userContext.recentNegativeActivities > 2) {
    // More emphasis on financial if recent negative spending
    categoryWeights.financial += 30;
    categoryWeights.discipline += 10;
  }
  
  if (userContext.streakCount && userContext.streakCount > 0) {
    // More emphasis on achievement if streaks exist
    categoryWeights.achievement += 20;
  }
  
  if (userContext.focusCategory) {
    // Boost weight for any explicitly preferred category
    categoryWeights[userContext.focusCategory.toLowerCase()] += 30;
  }
  
  // Select category based on weights
  const totalWeight = Object.values(categoryWeights).reduce((sum, weight) => sum + weight, 0);
  let randomValue = Math.random() * totalWeight;
  
  for (const category in categoryWeights) {
    randomValue -= categoryWeights[category];
    if (randomValue <= 0) {
      messageCategory = category;
      break;
    }
  }
  
  // Fallback if something went wrong
  if (!messageCategory || !contentLibrary.mainMessages[messageCategory]) {
    const categories = Object.keys(contentLibrary.mainMessages);
    messageCategory = categories[Math.floor(Math.random() * categories.length)];
  }
  
  // Select random message from chosen category
  const messages = contentLibrary.mainMessages[messageCategory];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Selects a daily challenge based on user history and preferences.
 * @param {object} userContext Data about user activity to personalize selection
 * @return {string} A selected challenge from the content library
 */
function selectDailyChallenge(userContext = {}) {
  const contentLibrary = createComprehensiveContentLibrary();
  let challengeCategory = '';
  
  // Determine most appropriate challenge category
  if (userContext.focusCategory && contentLibrary.challenges[userContext.focusCategory.toLowerCase()]) {
    // Use explicitly preferred category if available
    challengeCategory = userContext.focusCategory.toLowerCase();
  } else {
    // Otherwise weight categories based on context
    const categoryWeights = {
      financial: 20,
      health: 20,
      household: 20,
      development: 20,
      relationship: 20
    };
    
    // Adjust weights based on context
    if (userContext.recentNegativeActivities && userContext.recentNegativeActivities > 2) {
      categoryWeights.financial += 30;
    }
    
    if (userContext.lastActive === 'financial') {
      // Avoid repeating the same category from yesterday
      categoryWeights.financial -= 10;
    }
    
    // Select category based on weights
    const totalWeight = Object.values(categoryWeights).reduce((sum, weight) => sum + weight, 0);
    let randomValue = Math.random() * totalWeight;
    
    for (const category in categoryWeights) {
      randomValue -= categoryWeights[category];
      if (randomValue <= 0 && contentLibrary.challenges[category]) {
        challengeCategory = category;
        break;
      }
    }
  }
  
  // Fallback if no valid category was selected
  if (!challengeCategory || !contentLibrary.challenges[challengeCategory]) {
    const categories = Object.keys(contentLibrary.challenges);
    challengeCategory = categories[Math.floor(Math.random() * categories.length)];
  }
  
  // Select random challenge from chosen category
  const challenges = contentLibrary.challenges[challengeCategory];
  return challenges[Math.floor(Math.random() * challenges.length)];
}

/**
 * Selects a streak message based on activity name and streak length.
 * @param {string} activity The activity name
 * @param {number} count The streak count
 * @return {string} A personalized streak message
 */
function selectStreakMessage(activity, count) {
  const contentLibrary = createComprehensiveContentLibrary();
  let messageKey = '';
  
  // Determine the appropriate message category based on streak length
  if (count === 2) {
    messageKey = 'building';
  } else if (count === 3) {
    messageKey = 'milestone3';
  } else if (count >= 7 && count < 14) {
    messageKey = 'milestone7';
  } else if (count === 14) {
    messageKey = 'milestone14';
  } else if (count > 14) {
    messageKey = 'ongoing';
  } else {
    return ''; // No message for streaks of 1 or invalid counts
  }
  
  // Get messages for this category
  const messages = contentLibrary.streakMessages[messageKey];
  if (!messages || messages.length === 0) {
    return ''; // No messages available
  }
  
  // Select a random message and customize it
  const randomMessage = messages[Math.floor(Math.random() * messages.length)];
  return randomMessage
    .replace(/{activity}/g, activity)
    .replace(/{count}/g, count);
}

/**
 * Selects a recovery message when a streak is broken or a negative day occurred.
 * @return {string} A selected recovery message
 */
function selectRecoveryMessage() {
  const contentLibrary = createComprehensiveContentLibrary();
  const messages = contentLibrary.recoveryMessages;
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Selects the weekly theme based on the current week number.
 * @return {object} { theme: string, message: string }
 */
function selectWeeklyTheme() {
  const contentLibrary = createComprehensiveContentLibrary();
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const weekNumber = Math.ceil((today - startOfYear) / (7 * 24 * 60 * 60 * 1000));
  
  // Cycle through themes if we have fewer themes than weeks
  const themeIndex = (weekNumber - 1) % contentLibrary.weeklyThemes.length;
  return contentLibrary.weeklyThemes[themeIndex];
}

/**
 * Checks for special occasions based on current date.
 * @param {number} totalActivities Optional count of total user activities
 * @param {number} totalPoints Optional count of total user points
 * @param {number} longestStreak Optional length of user's longest streak
 * @return {object|null} Special occasion object or null if none found
 */
function checkSpecialOccasions(totalActivities = 0, totalPoints = 0, longestStreak = 0) {
  const contentLibrary = createComprehensiveContentLibrary();
  const today = new Date();
  const dateKey = (today.getMonth() + 1).toString().padStart(2, '0') + '-' + 
                  today.getDate().toString().padStart(2, '0');
  
  // Check for date-based occasions
  if (contentLibrary.specialOccasions[dateKey]) {
    return contentLibrary.specialOccasions[dateKey];
  }
  
  // Check for milestone-based occasions
  if (totalActivities >= 50 && totalActivities < 100) {
    return contentLibrary.specialOccasions["milestone-50-activities"];
  }
  
  if (totalPoints >= 100 && totalPoints < 200) {
    return contentLibrary.specialOccasions["milestone-100-points"];
  }
  
  if (longestStreak >= 10 && longestStreak < 20) {
    return contentLibrary.specialOccasions["milestone-10-day-streak"];
  }
  
  return null;
}

/**
 * Selects a random visualization prompt.
 * @return {string} A selected visualization prompt
 */
function selectVisualization() {
  const contentLibrary = createComprehensiveContentLibrary();
  const visualizations = contentLibrary.visualizations;
  return visualizations[Math.floor(Math.random() * visualizations.length)];
}

/**
 * Extracts user context from dashboard and streak data for content personalization.
 * @return {object} User context for content selection
 */
function extractUserContext() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  const today = new Date();
  
  // Default context
  const userContext = {
    recentNegativeActivities: 0,
    streakCount: 0,
    longestStreak: 0,
    totalActivities: 0,
    totalPoints: 0,
    lastActive: '',
    focusCategory: '',
    needsRecovery: false
  };
  
  // Get streak data
  let streakData = { streaks: {}, buildingStreaks: {} };
  try {
    if (typeof trackActivityStreaks === "function") {
      streakData = trackActivityStreaks();
      // Count all streaks
      const allStreaks = Object.values(streakData.streaks || {});
      userContext.streakCount = allStreaks.length;
      userContext.longestStreak = allStreaks.length > 0 ? Math.max(...allStreaks) : 0;
    }
  } catch (e) {
    Logger.log("Error getting streak data for content personalization: " + e);
  }
  
  // Get dashboard data
  if (dashboardSheet) {
    const lastRow = dashboardSheet.getLastRow();
    if (lastRow > 1) {
      // Get yesterday's data for context
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const formattedYesterday = formatDateYMD(yesterday);
      
      // Get activity counts and dashboard summary
      try {
        // See if weekly summary is populated
        const summaryTotal = dashboardSheet.getRange("H2").getValue() || 0;
        const positiveCount = dashboardSheet.getRange("H3").getValue() || 0;
        const negativeCount = dashboardSheet.getRange("H4").getValue() || 0;
        
        userContext.totalPoints = summaryTotal;
        userContext.totalActivities = positiveCount + negativeCount;
        userContext.recentNegativeActivities = negativeCount;
        
        // Check if yesterday had negative points
        const dates = dashboardSheet.getRange(2, 1, lastRow-1, 1).getValues();
        const points = dashboardSheet.getRange(2, 2, lastRow-1, 1).getValues();
        
        for (let i = dates.length - 1; i >= 0; i--) {
          if (dates[i][0] instanceof Date && formatDateYMD(dates[i][0]) === formattedYesterday) {
            if (points[i][0] < 0) {
              userContext.needsRecovery = true;
            }
            break;
          }
        }
        
        // Determine focus category based on most active area
        const healthCount = dashboardSheet.getRange("K4").getValue() || 0;
        const householdCount = dashboardSheet.getRange("K5").getValue() || 0;
        
        if (healthCount > householdCount && healthCount > negativeCount * 0.5) {
          userContext.focusCategory = 'health';
        } else if (householdCount > healthCount && householdCount > negativeCount * 0.5) {
          userContext.focusCategory = 'household';
        } else if (negativeCount > householdCount && negativeCount > healthCount) {
          userContext.focusCategory = 'financial'; // Focus on financial if negatives are high
        }
      } catch (e) {
        Logger.log("Error extracting user context from dashboard: " + e);
      }
    }
  }
  
  return userContext;
}

/**
 * Selects a weather-appropriate greeting based on current conditions.
 * @param {object} weatherData The processed weather data from OpenWeather
 * @return {string} A weather-appropriate greeting
 */
function selectWeatherGreeting(weatherData) {
  const contentLibrary = createComprehensiveContentLibrary();
  
  // Get all weather-influenced greetings (indexes 7-11 in your library)
  const weatherGreetings = contentLibrary.greetings.slice(7, 12);
  
  if (!weatherData) {
    // Return any random weather greeting if no data
    return weatherGreetings[Math.floor(Math.random() * weatherGreetings.length)];
  }
  
  // Select based on condition
  if (weatherData.isClear && weatherData.isDaytime) {
    return weatherGreetings[0]; // "☀️ Rise and shine with the sun today!"
  } else if (weatherData.isCloudy) {
    return weatherGreetings[1]; // "☁️ Even on cloudy days, your habits bring brightness."
  } else if (weatherData.isRaining) {
    return weatherGreetings[2]; // "🌧️ Perfect day to focus on indoor habits!"
  } else if (weatherData.isCold && (weatherData.isSnowing || weatherData.temp < 32)) {
    return weatherGreetings[3]; // "❄️ Freezing outside but your motivation stays warm."
  } else if (weatherData.isFoggy) {
    return weatherGreetings[4]; // "🌫️ See through the fog with clear habit goals."
  }
  
  // Default to random weather greeting
  return weatherGreetings[Math.floor(Math.random() * weatherGreetings.length)];
}
