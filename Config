/**
 * Configuration settings for the Budget Game v3 (incorporating Morning Motivation)
 * All constants and settings should be defined here.
 */

const CONFIG = {
  // --- Core Identifiers ---
  MENU_NAME: "Budget Game",
  FORM_URL: "https://docs.google.com/forms/u/0/d/e/1FAIpQLSfar66vHFtVtmX0_FdYwwrxBW67NZcK60Oatj_S_QeOpz_mCQ/formResponse",

  // --- Sheet Names ---
  SHEET_NAMES: {
    DASHBOARD: "Dashboard",
    MOBILE_VIEW: "Mobile View",
    POINTS_REFERENCE: "Points Reference",
    WEEKLY_GOALS: "Weekly Goals",
    FORM_RESPONSES: "Form Responses 1", // IMPORTANT: Verify this matches your actual responses sheet name
    WEEK_PREFIX: "Week of " // Prefix for weekly sheets
    // Add ARCHIVE sheets here if implemented later
  },

  // Add ADMIN_EMAILS to the CONFIG object near the top
  ADMIN_EMAILS: [
    "paulwivers@gmail.com",
    "jenniferannking@gmail.com"
    // Add other admin emails here
  ],

  // Add HOUSEHOLD_SETTINGS to the CONFIG object
  HOUSEHOLD_SETTINGS: {
    ENABLED: true,  // Set to false to disable household features
    DEFAULT_HOUSEHOLD_NAME: "Default Household",
    CACHE_TIME: 600  // 10 minutes
  },

  // --- Email Configuration ---
  DIGEST_EMAIL_ADDRESSES: [
    "paulwivers@gmail.com", // MODIFY THESE
    "jenniferannking@gmail.com"  // MODIFY THESE
  ],
  EMAIL_SUBJECTS: {
    DAILY_DIGEST: "📊 BUDGET GAME: Daily Summary", // Added emojis
    WEEKLY_DIGEST: "🏆 Your Budget Game Weekly Summary", // Added emojis
    MORNING_MOTIVATION: "☀️ Budget Game: Your Day Ahead!"
  },
  MORNING_EMAIL_HOUR: 7, // 7 AM - Hour to send morning email (0-23)
  DAILY_DIGEST_HOUR: 21, // 9 PM
  WEEKLY_DIGEST_DAY: ScriptApp.WeekDay.SUNDAY, // Day to send weekly digest
  WEEKLY_DIGEST_HOUR: 20, // 8 PM

  // --- Trigger Function Names (Used for setup/management) ---
  TRIGGERS: {
    ON_OPEN: 'onOpen', // For menu creation
    MORNING_EMAIL: 'sendMorningMotivationEmail',
    DAILY_DIGEST: 'sendDailyDigest',
    WEEKLY_DIGEST: 'sendWeeklyDigestEmail',
    FORM_SUBMIT: 'processFormSubmission',
    POINTS_EDIT: 'handlePointsReferenceEdit',
    RESPONSES_EDIT: 'handleFormResponsesEdit' // Handles edits in Form Responses sheet
  },

  // --- Formatting & Style ---
  COLORS: {
    HEADER_BG: "#4285F4",
    HEADER_FG: "white",
    POSITIVE_BG: "#b6d7a8", // Light green
    NEGATIVE_BG: "#f4cccc", // Light red
    POSITIVE_ACTIVITY_COL_BG: "#e6f4ea", // Lighter green for C column in weekly
    NEGATIVE_ACTIVITY_COL_BG: "#fce8e6", // Lighter red for D column in weekly
    ALTERNATING_ROW_BG: "#f3f3f3",
    STREAK_COLOR: "#FF5722", // Orange for streak text
    MORNING_HEADER_BG: "#AED6F1", // Lighter blue for morning email
    MORNING_HEADER_FG: "#1B4F72",
    SUGGESTION_BG: "#E8F8F5", // Light teal for suggestion box
    SUGGESTION_BORDER: "#A3E4D7",
    CHALLENGE_BG: "#FEF9E7", // Light yellow for challenge box
    CHALLENGE_BORDER: "#FAD7A0",
    CHART_POSITIVE: '#34A853', // Green
    CHART_NEGATIVE: '#EA4335', // Red
    CHART_HEALTH: '#FBBC05', // Yellow
    CHART_HOUSEHOLD: '#4285F4', // Blue
    CHART_MAIN_LINE: '#4285F4'  // Blue
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
  STREAK_THRESHOLDS: { // Days required for bonuses
    BONUS_1: 3, // +1 point
    BONUS_2: 7, // +2 points
    MULTIPLIER: 14 // Double points
  },
  STREAK_BONUS_POINTS: { // Points awarded at thresholds
    BONUS_1: 1,
    BONUS_2: 2
  },
  SUGGESTION_SETTINGS: {
    MAX_SUGGESTIONS: 3,
    RECENCY_DAYS_THRESHOLD: 3 // How many days back to check for suggesting missed activities
  },
  DAILY_GOAL_OPTIONS_COUNT: 3, // Number of challenge ideas in morning email

  // --- Performance & Limits ---
  CACHE_EXPIRATION_SECONDS: 600, // 10 minutes for activity data cache
  REBUILD_SLEEP_MS: 50, // Small delay during rebuild loop
  POINTS_EDIT_DELAY_MS: 2000, // Delay after points ref edit before updating form

};

// --- Global Cache Variable ---
// Initialized here, managed by caching functions
let activityDataCache = null;
