// Utilities.gs
/**
 * Common utility functions for Budget Game v3 (Streamlined)
 */

/**
 * Calculates ISO 8601 week number for a given date.
 * Weeks start on Monday per ISO standard, but our game week starts Sunday.
 * We primarily use getWeekStartDate/EndDate for game logic.
 * @param {Date} date The date object.
 * @return {number} The ISO week number.
 */
function getISOWeekNumber(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return 0; // Handle invalid date
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Gets the start date (Sunday 00:00:00) of the week for a given date.
 * @param {Date} date The date object.
 * @return {Date} The Date object for the start of the week (Sunday).
 */
function getWeekStartDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return new Date(NaN); // Return invalid date if input is invalid
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // Sunday is day 0
  d.setHours(0, 0, 0, 0); // Set to the beginning of the day
  return d;
}

/**
 * Gets the end date (Saturday 23:59:59.999) of the week for a given date.
 * @param {Date} date The date object.
 * @return {Date} The Date object for the end of the week (Saturday).
 */
function getWeekEndDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return new Date(NaN); // Return invalid date if input is invalid
  const d = new Date(date);
  d.setDate(d.getDate() + (6 - d.getDay())); // Saturday is day 6
  d.setHours(23, 59, 59, 999); // Set to the end of the day
  return d;
}

/**
 * Formats a date object as YYYY-MM-DD string using the script's timezone.
 * Useful for consistent date comparisons.
 * @param {Date} date The date object.
 * @return {string} The formatted date string or "" if input is invalid.
 */
function formatDateYMD(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
      return "";
  }
  try {
    // Use Utilities.formatDate for robustness
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
  } catch (e) {
    Logger.log(`Error formatting date ${date}: ${e}`);
    // Fallback or re-throw depending on desired behavior
    return ""; // Return empty string on error
  }
}


/**
 * Retrieves the current streak settings from PropertiesService, falling back to CONFIG defaults.
 * Reads standardized UPPERCASE keys from storage.
 * Returns a consistent structure containing BOTH uppercase and lowercase property keys
 * to support server-side (uppercase) and client-side (lowercase) code needs easily.
 * @return {object} The streak settings object. Example:
 *                  { thresholds: { BONUS_1: 3, bonus1: 3, BONUS_2: 7, bonus2: 7, MULTIPLIER: 14, multiplier: 14 },
 *                    bonusPoints: { BONUS_1: 1, bonus1: 1, BONUS_2: 2, bonus2: 2 } }
 */
function getCurrentStreakSettings() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const savedSettingsJson = scriptProperties.getProperty('STREAK_SETTINGS');

  // Define defaults directly from CONFIG (using uppercase keys from CONFIG)
  const defaultThresholds = {
    BONUS_1: CONFIG.STREAK_THRESHOLDS.BONUS_1,
    BONUS_2: CONFIG.STREAK_THRESHOLDS.BONUS_2,
    MULTIPLIER: CONFIG.STREAK_THRESHOLDS.MULTIPLIER
  };
  const defaultBonusPoints = {
    BONUS_1: CONFIG.STREAK_BONUS_POINTS.BONUS_1,
    BONUS_2: CONFIG.STREAK_BONUS_POINTS.BONUS_2
  };

  let finalThresholds = { ...defaultThresholds };
  let finalBonusPoints = { ...defaultBonusPoints };

  if (savedSettingsJson) {
    try {
      const savedSettings = JSON.parse(savedSettingsJson);

      // Validate saved structure - MUST contain the uppercase keys we expect to save/read
      if (savedSettings && savedSettings.thresholds && savedSettings.bonusPoints &&
          typeof savedSettings.thresholds.BONUS_1 === 'number' &&
          typeof savedSettings.thresholds.BONUS_2 === 'number' &&
          typeof savedSettings.thresholds.MULTIPLIER === 'number' &&
          typeof savedSettings.bonusPoints.BONUS_1 === 'number' &&
          typeof savedSettings.bonusPoints.BONUS_2 === 'number')
      {
        // Use saved values if structure is valid
        finalThresholds = {
          BONUS_1: savedSettings.thresholds.BONUS_1,
          BONUS_2: savedSettings.thresholds.BONUS_2,
          MULTIPLIER: savedSettings.thresholds.MULTIPLIER
        };
        finalBonusPoints = {
          BONUS_1: savedSettings.bonusPoints.BONUS_1,
          BONUS_2: savedSettings.bonusPoints.BONUS_2
        };
        // Logger.log("Using saved streak settings from PropertiesService (read uppercase).");
      } else {
        Logger.log("Saved streak settings JSON structure invalid or missing required keys. Falling back to defaults.");
        // Keep defaults assigned above
      }
    } catch (e) {
      Logger.log(`Error parsing saved streak settings: ${e}. Falling back to defaults.`);
      // Keep defaults assigned above
    }
  } else {
     // Logger.log("No saved streak settings found. Using defaults from CONFIG.");
     // Keep defaults assigned above
  }

  // Construct the final return object with BOTH cases
  return {
    thresholds: {
      BONUS_1: finalThresholds.BONUS_1,
      bonus1: finalThresholds.BONUS_1, // Add lowercase version
      BONUS_2: finalThresholds.BONUS_2,
      bonus2: finalThresholds.BONUS_2, // Add lowercase version
      MULTIPLIER: finalThresholds.MULTIPLIER,
      multiplier: finalThresholds.MULTIPLIER // Add lowercase version
    },
    bonusPoints: {
      BONUS_1: finalBonusPoints.BONUS_1,
      bonus1: finalBonusPoints.BONUS_1, // Add lowercase version
      BONUS_2: finalBonusPoints.BONUS_2,
      bonus2: finalBonusPoints.BONUS_2 // Add lowercase version
    }
  };
}

/**
 * Retrieves the current category display order from PropertiesService.
 * Falls back to the order defined in CONFIG.CATEGORIES if no saved order is found or if it's invalid.
 * Ensures all categories from CONFIG are present in the final list, adding missing ones at the end.
 * @return {Array<string>} An array of category names in the desired display order.
 */
function getCurrentCategoryOrder() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const savedOrderJson = scriptProperties.getProperty('CATEGORY_ORDER');
  const configCategories = [...CONFIG.CATEGORIES]; // Get a mutable copy from CONFIG

  let finalOrder = [...configCategories]; // Start with CONFIG order as default

  if (savedOrderJson) {
    try {
      const savedOrder = JSON.parse(savedOrderJson);
      // Validate that it's an array
      if (Array.isArray(savedOrder)) {
        // Further validation: Check if saved order contains valid strings and mostly matches config
        const savedSet = new Set(savedOrder);
        const configSet = new Set(configCategories);
        let isValid = savedOrder.every(cat => typeof cat === 'string' && cat.trim() !== '');

        if (isValid && savedOrder.length > 0) {
          // Use the saved order, but ensure all CONFIG categories are included
          const combined = [...savedOrder];
          configCategories.forEach(configCat => {
            if (!savedSet.has(configCat)) {
              combined.push(configCat); // Add missing config categories to the end
            }
          });
          // Filter out any categories in the saved order that are NO LONGER in CONFIG
          finalOrder = combined.filter(cat => configSet.has(cat));
          Logger.log("Using saved category order from PropertiesService (reconciled with CONFIG).");
        } else {
           Logger.log("Saved category order is invalid (not an array or empty/invalid strings). Falling back to CONFIG order.");
           finalOrder = [...configCategories];
        }
      } else {
         Logger.log("Saved category order JSON is not an array. Falling back to CONFIG order.");
         finalOrder = [...configCategories];
      }
    } catch (e) {
      Logger.log(`Error parsing saved category order: ${e}. Falling back to CONFIG order.`);
      finalOrder = [...configCategories];
    }
  } else {
    // Logger.log("No saved category order found. Using default order from CONFIG.");
    finalOrder = [...configCategories];
  }

  return finalOrder;
}