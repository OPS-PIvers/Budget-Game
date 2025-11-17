// Config.gs
/**
 * Configuration settings for the Budget Game v3 (Streamlined)
 * All constants and settings should be defined here.
 */

const CONFIG = {
  // --- Core Identifiers ---
  MENU_NAME: "Budget Game",

  // --- Sheet Names (Essential) ---
  SHEET_NAMES: {
    DASHBOARD: "Dashboard",
    POINTS_REFERENCE: "Points Reference",
    HOUSEHOLDS: "Households",
    GOALS: "Goals",
    EXPENSE_TRACKER: "Expense Tracker",
    BUDGET_CATEGORIES: "Budget Categories",
    LOCATION_MAPPING: "Location Mapping",
    // FORM_RESPONSES: "Form Responses 1" // Obsolete if not reading directly
  },

  // --- Admin & Household Settings ---
  ADMIN_EMAILS: [
    "paulwivers@gmail.com", // MODIFY THESE
    "jenniferannking@gmail.com"  // MODIFY THESE
    // Add other admin emails here
  ],
  HOUSEHOLD_SETTINGS: {
    ENABLED: true,  // Set to false to disable household features
    DEFAULT_HOUSEHOLD_NAME: "Default Household",
    CACHE_TIME: 600  // 10 minutes cache for household lookups
  },

  // --- Email Configuration (Digests Only) ---
  DIGEST_EMAIL_ADDRESSES: [
    "paulwivers@gmail.com", // MODIFY THESE
    "jenniferannking@gmail.com"  // MODIFY THESE
  ],
  EMAIL_SUBJECTS: {
    DAILY_DIGEST: "📊 BUDGET GAME: Daily Summary",
    WEEKLY_DIGEST: "🏆 Your Budget Game Weekly Summary",
  },
  DAILY_DIGEST_HOUR: 21, // 9 PM
  WEEKLY_DIGEST_DAY: ScriptApp.WeekDay.SUNDAY, // Day to send weekly digest
  WEEKLY_DIGEST_HOUR: 20, // 8 PM

  // --- Trigger Function Names (Used for setup/management) ---
  TRIGGERS: {
    ON_OPEN: 'onOpen', // For menu creation
    DAILY_DIGEST: 'sendDailyDigest',
    WEEKLY_DIGEST: 'sendWeeklyDigestEmail',
    POINTS_EDIT: 'handleSheetEdit',
    // RESPONSES_EDIT: 'handleFormResponsesEdit' // Obsolete - Removed
    // FORM_SUBMIT: 'handleFormSubmit' // Obsolete - Removed
  },

  // --- Formatting & Style ---
  COLORS: { // Keep colors used by sheets and web app CSS/emails
    HEADER_BG: "#4285F4",
    HEADER_FG: "white",
    POSITIVE_BG: "#b6d7a8", // Light green background for points cells
    NEGATIVE_BG: "#f4cccc", // Light red background for points cells
    ALTERNATING_ROW_BG: "#f3f3f3", // For Dashboard rows potentially
    STREAK_COLOR: "#FF5722", // Orange for streak text in emails/UI
    CHART_POSITIVE: '#34A853', // Used client-side and emails
    CHART_NEGATIVE: '#EA4335', // Used client-side and emails
    CHART_HEALTH: '#FBBC05', // Used client-side and emails
    CHART_HOUSEHOLD: '#4285F4', // Used client-side and emails
    CHART_MAIN_LINE: '#4285F4'  // Used client-side and emails
    // Keep others if referenced in Stylesheet.html
  },
  DATE_FORMAT_SHORT: "MM/dd/yyyy",
  DATE_FORMAT_YMD: "yyyy-MM-dd", // For consistent internal comparisons
  POINTS_FORMAT: "+0;-0;0", // Shows +/- sign

  // --- Game Mechanics Settings ---
  CATEGORIES: [ // Canonical list used for validation and potentially analysis
    "Financial Planning",
    "Meal Planning",
    "Self-Discipline",
    "Health",
    "Household",
    "Negative",
    "Achievement"
  ],
  GOAL_TYPES: [ // Supported goal types for visual tracking
    "debt",
    "savings",
    "vacation_fund"
  ],
  GOAL_SETTINGS: {
    CACHE_TIME: 300, // 5 minutes cache for goal data
    MAX_GOALS_PER_HOUSEHOLD: 10,
    DEFAULT_GOAL_DURATION_MONTHS: 12
  },
  EXPENSE_SETTINGS: {
    CACHE_TIME: 600, // 10 minutes cache for expense data
    DEFAULT_PAY_PERIOD_DAYS: 14, // Default pay period length
    AUTO_SAVE_DELAY: 2000, // 2 seconds delay for auto-save
    MAX_LOCATIONS_PER_HOUSEHOLD: 50, // Max stored locations
    DEFAULT_BUDGET_CATEGORIES: ["Groceries", "Gas", "Shopping", "Dining", "Utilities", "Entertainment"],
    LOCATION_LEARNING_THRESHOLD: 3 // Times location used before it becomes a suggestion
  },
  STREAK_THRESHOLDS: { // Days required for bonuses - Defaults used if PropertiesService empty
    BONUS_1: 3, // +1 point
    BONUS_2: 7, // +2 points
    MULTIPLIER: 14 // Double points
  },
  STREAK_BONUS_POINTS: { // Points awarded at thresholds - Defaults used if PropertiesService empty
    BONUS_1: 1,
    BONUS_2: 2
  },
  // Removed suggestion/daily goal option settings

  // --- Performance & Limits ---
  CACHE_EXPIRATION_SECONDS: 600, // 10 minutes for activity data cache
  REBUILD_SLEEP_MS: 50, // Small delay during rebuild loop
  POINTS_EDIT_DELAY_MS: 2000, // Delay after points ref edit before updating form

  // --- Cache Versioning ---
  // Increment this version to invalidate ALL caches globally
  // Useful for major data structure changes or bug fixes requiring fresh data
  CACHE_VERSION: 'v1.0',  // Format: v{major}.{minor}

  // Cache key prefixes for different data types
  CACHE_KEYS: {
    ACTIVITY_DATA: 'activityData',
    DASHBOARD_RANGE: 'dashboardRange',
    HOUSEHOLD_DATA: 'householdData',
    GOAL_DATA: 'goalData',
    EXPENSE_DATA: 'expenseData'
  }

};

// --- Global Cache Variable ---
// Initialized here, managed by caching functions in DataProcessing.gs
// Definition MOVED to DataProcessing.gs
let activityDataCache = null;

// Definition MOVED to DataProcessing.gs
/*
function resetActivityDataCache() {
  activityDataCache = null;
  try {
    CacheService.getScriptCache().remove('activityData');
    Logger.log("Activity data cache reset.");
  } catch (e) {
    Logger.log(`Warning: Error clearing activity data from CacheService: ${e}`);
  }
}
*/