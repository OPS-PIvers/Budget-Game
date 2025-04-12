/**
 * Budget Game Apps Script - v3 (Morning Motivation Update)
 * Main script file containing core logic, setup, triggers, and UI.
 * Includes corrected sendDailyDigest with streak diagnostics.
 */

// --- Global Cache Variable (declared in Config.gs) ---
// let activityDataCache = null;

// --- UI & Setup Functions ---

/**
 * Creates the main custom menu when the spreadsheet opens.
 * Reads configuration from CONFIG object.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu(CONFIG.MENU_NAME)
    // Daily operations
    .addItem('Send Morning Motivation', CONFIG.TRIGGERS.MORNING_EMAIL)
    .addItem('Send Daily Digest', CONFIG.TRIGGERS.DAILY_DIGEST)
    .addItem('Send Weekly Digest', CONFIG.TRIGGERS.WEEKLY_DIGEST)

    // Setup & Maintenance section
    .addSeparator()
    .addSubMenu(ui.createMenu('Setup & Maintenance')
      .addItem('Setup Dashboard', 'setupDashboard')
      .addItem('Setup Mobile View', 'setupMobileView')
      .addItem('Setup Points Reference', 'setupPointsReferenceSheet') // Renamed for clarity
      .addItem('Setup Weekly Goals', 'setupWeeklyGoalsSheet')
      .addItem('Update Form From Points Reference', 'updateFormFromSheet')
      .addItem('Update Weekly Totals', 'updateWeeklyTotals') // Manual trigger if needed
      .addItem('Regenerate All Charts', 'createDashboardCharts') // Assumes charts are on Dashboard
      .addItem('Rebuild All From Form Responses', 'rebuildAllFromFormResponses'))

    // Game Features section
    .addSeparator()
    .addSubMenu(ui.createMenu('Game Features')
      .addItem('Generate New Weekly Goals', 'generateAndSaveWeeklyGoals') // Wrapper function exists in HelperFunctions.gs
      .addItem('Check Weekly Bonuses', 'displayWeeklyBonuses') // Wrapper function exists in HelperFunctions.gs
      .addItem('Setup Points Ref Auto-Update', 'setupPointsReferenceEditTrigger')) // Renamed for clarity

    // Triggers section
    .addSeparator()
    .addItem('Setup/Update All Triggers', 'setupAllTriggers')

    .addToUi();
}

/**
 * Sets up the Dashboard sheet with correct headers, formatting, and summary sections.
 */
function setupDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = CONFIG.SHEET_NAMES.DASHBOARD;
  var dashboardSheet = ss.getSheetByName(sheetName);

  if (dashboardSheet) {
    // Optional: Add confirmation dialog before deleting
    ss.deleteSheet(dashboardSheet);
  }

  dashboardSheet = ss.insertSheet(sheetName);

  // Headers
  const headers = [["Date", "Points", "Activities", "Positive Count", "Negative Count", "Week Number"]];
  dashboardSheet.getRange("A1:F1").setValues(headers)
    .setFontWeight("bold")
    .setBackground(CONFIG.COLORS.HEADER_BG)
    .setFontColor(CONFIG.COLORS.HEADER_FG);

  // Column Widths
  dashboardSheet.setColumnWidth(1, 100); // Date
  dashboardSheet.setColumnWidth(2, 70);  // Points
  dashboardSheet.setColumnWidth(3, 400); // Activities
  dashboardSheet.setColumnWidth(4, 100); // Positive Count
  dashboardSheet.setColumnWidth(5, 100); // Negative Count
  dashboardSheet.setColumnWidth(6, 100); // Week Number

  // Weekly Summary Section Headers (Example: G/H)
  dashboardSheet.getRange("G1:H1").setValues([["Weekly Summary", "Value"]])
    .setFontWeight("bold")
    .setBackground(CONFIG.COLORS.HEADER_BG)
    .setFontColor(CONFIG.COLORS.HEADER_FG);

  // Weekly Summary Labels
  const summaryLabels = [
    ["Total Points"], ["Positive Activities"], ["Negative Activities"],
    ["Top Activity"], ["Top Activity Count"]
  ];
  dashboardSheet.getRange("G2:G6").setValues(summaryLabels);
  dashboardSheet.getRange("H2:H6").setValue(0); // Initialize values
  dashboardSheet.getRange("H5").setValue("None"); // Top activity init

  // Category Distribution Section Headers (Example: J/K)
  dashboardSheet.getRange("J1:K1").setValues([["Category", "Count"]])
    .setFontWeight("bold")
    .setBackground(CONFIG.COLORS.HEADER_BG)
    .setFontColor(CONFIG.COLORS.HEADER_FG);

  // Category Distribution Labels (Reflects categories used in updateWeeklyTotals)
  const categoryLabels = [
    ["Total Positive"], ["Total Negative"], // Using different labels for clarity vs weekly sheet
    ["Health Specific"], ["Household Specific"]
  ];
  dashboardSheet.getRange("J2:J5").setValues(categoryLabels);
  dashboardSheet.getRange("K2:K5").setValue(0); // Initialize values

  // Formatting
  dashboardSheet.getRange("A:A").setNumberFormat(CONFIG.DATE_FORMAT_SHORT);
  dashboardSheet.getRange("B:B").setNumberFormat(CONFIG.POINTS_FORMAT); // Points column
  dashboardSheet.getRange("H2").setNumberFormat(CONFIG.POINTS_FORMAT); // Weekly Total Points

  // Conditional Formatting for Points Column (B2:B)
  var pointsRange = dashboardSheet.getRange("B2:B"); // Apply to whole column below header
  var rules = dashboardSheet.getConditionalFormatRules();
  // Remove existing rules for this range to avoid duplicates
  rules = rules.filter(rule => rule.getRanges().every(range => range.getA1Notation() !== pointsRange.getA1Notation()));

  var positiveRule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(0)
    .setBackground(CONFIG.COLORS.POSITIVE_BG)
    .setRanges([pointsRange])
    .build();
  var negativeRule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(0)
    .setBackground(CONFIG.COLORS.NEGATIVE_BG)
    .setRanges([pointsRange])
    .build();

  rules.push(positiveRule, negativeRule);
  dashboardSheet.setConditionalFormatRules(rules);

  Logger.log("Dashboard sheet set up successfully.");
  SpreadsheetApp.getActiveSpreadsheet().toast('Dashboard sheet created/reset.', 'Setup Complete', 5);
  return dashboardSheet;
}

/**
 * Sets up the Mobile View sheet optimized for smaller screens.
 */
function setupMobileView() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = CONFIG.SHEET_NAMES.MOBILE_VIEW;
  var mobileSheet = ss.getSheetByName(sheetName);

  if (mobileSheet) {
    ss.deleteSheet(mobileSheet);
  }

  mobileSheet = ss.insertSheet(sheetName);

  // Header
  mobileSheet.getRange("A1:B1").merge()
    .setValue(CONFIG.MENU_NAME.toUpperCase()) // Use game name
    .setBackground(CONFIG.COLORS.HEADER_BG)
    .setFontColor(CONFIG.COLORS.HEADER_FG)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  // Layout Labels
  mobileSheet.getRange("A3").setValue("Today's Date");
  mobileSheet.getRange("A4").setValue("Today's Points");

  mobileSheet.getRange("A6:B6").merge()
    .setValue("WEEKLY SUMMARY")
    .setBackground(CONFIG.COLORS.HEADER_BG)
    .setFontColor(CONFIG.COLORS.HEADER_FG)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  mobileSheet.getRange("A7:A10").setValues([
    ["Total Points"], ["Positive Activities"], ["Negative Activities"], ["Top Activity"]
  ]);

  mobileSheet.getRange("A12:B12").merge()
    .setValue("RECENT ACTIVITIES")
    .setBackground(CONFIG.COLORS.HEADER_BG)
    .setFontColor(CONFIG.COLORS.HEADER_FG)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  mobileSheet.getRange("A13").setValue("Date"); // Header for recent date
  mobileSheet.getRange("B13").setValue("Points"); // Header for recent points


  // Clear potential old data beyond headers/labels
  mobileSheet.getRange("B3:B4").clearContent();
  mobileSheet.getRange("B7:B10").clearContent();
  // Keep A13, B13 headers, clear rows below
  mobileSheet.getRange("A14:B18").clearContent(); // Clear 5 rows below header


  // Column Widths
  mobileSheet.setColumnWidth(1, 150); // Label column
  mobileSheet.setColumnWidth(2, 150); // Value column

  // Number Formatting
  mobileSheet.getRange("B4").setNumberFormat(CONFIG.POINTS_FORMAT); // Today's Points
  mobileSheet.getRange("B7").setNumberFormat(CONFIG.POINTS_FORMAT); // Weekly Total Points
  mobileSheet.getRange("B13:B18").setNumberFormat(CONFIG.POINTS_FORMAT); // Recent Points (incl header row just in case)

  // Conditional Formatting for Points
  var pointsRanges = ["B4", "B7", "B14:B18"]; // Apply to data rows B14-B18
  var rules = mobileSheet.getConditionalFormatRules();
  // Clear existing rules on these specific ranges first
   rules = rules.filter(rule => !rule.getRanges().some(range => pointsRanges.includes(range.getA1Notation())));

  pointsRanges.forEach(function(rangeA1) {
    var range = mobileSheet.getRange(rangeA1);
    var positiveRule = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0)
      .setBackground(CONFIG.COLORS.POSITIVE_BG)
      .setRanges([range])
      .build();
    var negativeRule = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(0)
      .setBackground(CONFIG.COLORS.NEGATIVE_BG)
      .setRanges([range])
      .build();
    rules.push(positiveRule, negativeRule);
  });
  mobileSheet.setConditionalFormatRules(rules);

  // Apply formatting for better readability
  mobileSheet.getRange("A3:A13").setFontWeight("bold"); // Bold labels and recent headers
  mobileSheet.getRange("A3:B18").setVerticalAlignment("top");


  Logger.log("Mobile View sheet set up successfully.");
  SpreadsheetApp.getActiveSpreadsheet().toast('Mobile View sheet created/reset.', 'Setup Complete', 5);
  return mobileSheet;
}


/**
 * Sets up the Points Reference sheet with headers, validation, formatting.
 */
function setupPointsReferenceSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = CONFIG.SHEET_NAMES.POINTS_REFERENCE;
  var sheet = ss.getSheetByName(sheetName);
  var createdNew = false;

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    createdNew = true;

    // Headers
    sheet.getRange("A1:C1").setValues([["Activity", "Points", "Category"]])
      .setFontWeight("bold")
      .setBackground(CONFIG.COLORS.HEADER_BG)
      .setFontColor(CONFIG.COLORS.HEADER_FG);

    // Column Widths
    sheet.setColumnWidth(1, 250); // Activity
    sheet.setColumnWidth(2, 80);  // Points
    sheet.setColumnWidth(3, 150); // Category

    // Add Default Activities (only if sheet is brand new)
    addDefaultActivities(sheet); // Pass the sheet object
  }

  // --- Apply formatting and validation regardless of whether sheet was new ---

  var lastRow = Math.max(2, sheet.getLastRow()); // Ensure we work from row 2 down

  // Data Validation for Category Column (C2:C)
  var categoryRange = sheet.getRange(2, 3, Math.max(1, sheet.getMaxRows() - 1), 1); // Apply to all rows C2:C
  var categoryRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.CATEGORIES, true) // Use categories from CONFIG
    .setAllowInvalid(false) // Disallow other values
    .setHelpText(`Select a category from the list: ${CONFIG.CATEGORIES.join(', ')}.`)
    .build();
  categoryRange.setDataValidation(categoryRule);

  // Number Formatting for Points Column (B2:B)
  sheet.getRange(2, 2, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat(CONFIG.POINTS_FORMAT); // Apply B2:B

  // Conditional Formatting for Points Column (B2:B)
  var pointsRange = sheet.getRange("B2:B"); // Apply to whole column below header
  var rules = sheet.getConditionalFormatRules();
  // Remove existing rules specific to this range to avoid duplicates
  rules = rules.filter(rule => rule.getRanges().every(range => range.getA1Notation() !== pointsRange.getA1Notation()));

  var positiveRule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(0)
    .setBackground(CONFIG.COLORS.POSITIVE_BG)
    .setRanges([pointsRange])
    .build();
  var negativeRule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(0)
    .setBackground(CONFIG.COLORS.NEGATIVE_BG)
    .setRanges([pointsRange])
    .build();

  rules.push(positiveRule, negativeRule);
  sheet.setConditionalFormatRules(rules);

  // Sort Data by Category, then Activity (if more than one data row exists)
  if (lastRow > 2) {
    // Only sort the actual data range, not the whole sheet
    sheet.getRange(2, 1, lastRow - 1, 3).sort([{column: 3, ascending: true}, {column: 1, ascending: true}]);
  }

  if (createdNew) {
     Logger.log("Points Reference sheet created and set up.");
     SpreadsheetApp.getActiveSpreadsheet().toast('Points Reference sheet created.', 'Setup Complete', 5);
  } else {
     Logger.log("Points Reference sheet validation and formatting updated.");
     SpreadsheetApp.getActiveSpreadsheet().toast('Points Reference sheet updated.', 'Setup Complete', 5);
  }
}

/**
 * Adds a predefined list of default activities to the Points Reference sheet.
 * Uses categories defined in CONFIG.
 * @param {Sheet} sheet The Points Reference sheet object.
 */
function addDefaultActivities(sheet) {
  // Ensure sheet exists
  if (!sheet) {
     Logger.log("Sheet object not provided to addDefaultActivities.");
     return;
  }

  // Using categories from CONFIG for consistency
  const C = { // Short alias for categories
     FIN: "Financial Planning",
     MEAL: "Meal Planning",
     DISC: "Self-Discipline",
     HLTH: "Health",
     HSHD: "Household",
     NEG: "Negative",
     ACH: "Achievement"
  };

  const defaultActivities = [
    // Financial Planning
    ["Weekly budget review/planning session", 3, C.FIN],
    ["Review one subscription for necessity", 1, C.FIN],
    ["Cancel an unused subscription", 3, C.FIN],
    ["Spend zero money in a day", 2, C.FIN],

    // Meal Planning
    ["Home made dinner", 1, C.MEAL],
    ["Eat leftovers", 3, C.MEAL],
    ["Pack lunch for work/school", 1, C.MEAL],

    // Self-Discipline
    ["Get up with alarm (no snooze)", 1, C.DISC], // Combined/renamed
    ["Lights out by 10pm", 1, C.DISC],
    ["Walk the dog", 1, C.DISC],
    ["Dedicated study/work block (e.g., Grad School)", 2, C.DISC],

    // Health
    ["Eat vegetables with dinner", 1, C.HLTH],
    ["Get 7+ hours of sleep", 2, C.HLTH],
    ["Drink water instead of sugary drinks all day", 1, C.HLTH],
    ["Take a stretch break during work", 1, C.HLTH],
    ["Cook with olive oil instead of butter", 1, C.HLTH],
    ["Have a meat-free day", 1, C.HLTH],
    ["Exercise for 30 minutes", 3, C.HLTH],

    // Household
    ["Clean bathroom", 2, C.HSHD],
    ["Clean glass shower door", 1, C.HSHD],
    ["Vacuum downstairs", 1, C.HSHD],
    ["Windex all windows", 2, C.HSHD],
    ["Dust all surfaces", 1, C.HSHD],
    ["Clean out refrigerator", 1, C.HSHD],
    ["Declutter one area", 2, C.HSHD],
    ["Laundry folded and put away", 1, C.HSHD],
    ["Clean kitchen thoroughly", 2, C.HSHD],

    // Negative
    ["Order food for delivery", -10, C.NEG],
    ["Go out to dinner", -5, C.NEG],
    ["Fast casual or donuts", -2, C.NEG],
    ["Trip to grocery store", -1, C.NEG], // Could be debated if negative
    ["Grocery delivery", -2, C.NEG],
    ["Order from Target or Amazon", -2, C.NEG], // Renamed for clarity
    ["Go into Target (non-essential trip)", -3, C.NEG], // Added qualifier
    ["Starbucks/coffee/fast snack", -1, C.NEG],
    ["Impulse buy (any size)", -2, C.NEG], // Simplified
    ["Unnecessary Spending (Small)", -1, C.NEG], // Keep if distinct levels needed
    ["Unnecessary Spending (Medium)", -2, C.NEG],
    ["Unnecessary Spending (Large)", -3, C.NEG],
    ["Lights out after 10:30pm", -1, C.NEG],

    // Achievement (Longer term / significant)
    ["1 week without eating out", 10, C.ACH],
    ["Meet savings goal for the month", 10, C.ACH],
    ["Complete a no-spend weekend", 5, C.ACH],
    ["Paid off a debt early", 15, C.ACH] // Example new achievement
  ];

  // Add activities starting from row 2
  if (defaultActivities.length > 0) {
    sheet.getRange(2, 1, defaultActivities.length, 3).setValues(defaultActivities);
    Logger.log(`Added ${defaultActivities.length} default activities.`);
  }
}


// --- Data Processing & Core Logic ---

/**
 * Reads activity data from the Points Reference sheet.
 * Returns an object containing pointValues and categories maps.
 * Uses CONFIG for sheet name.
 */
function readActivityData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = CONFIG.SHEET_NAMES.POINTS_REFERENCE;
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    Logger.log(`${sheetName} not found, attempting to set up.`);
    setupPointsReferenceSheet(); // Try to create it
    sheet = ss.getSheetByName(sheetName); // Get it again
    if (!sheet) {
      Logger.log(`FATAL: Failed to create or find ${sheetName}. Cannot read activity data.`);
      SpreadsheetApp.getUi().alert(`Error: Could not find or create the '${sheetName}' sheet.`);
      // Return empty structure to prevent further errors down the line
      return { pointValues: {}, categories: {} };
    }
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log(`No activities found in ${sheetName}.`);
    return { pointValues: {}, categories: {} }; // Return empty if no data rows
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const pointValues = {};
  const categories = {};

  data.forEach(row => {
    const activity = String(row[0]).trim();
    const points = parseInt(row[1]); // Ensure it's a number
    const category = String(row[2]).trim();

    // Only add valid entries
    if (activity && !isNaN(points) && category) {
      pointValues[activity] = points;
      categories[activity] = category;
    } else {
       if (activity || !isNaN(points) || category) { // Log if *any* data was present but row was invalid
         Logger.log(`Skipping invalid row in ${sheetName}: [${row.join(', ')}]`);
       }
    }
  });

  // Logger.log(`Read ${Object.keys(pointValues).length} activities from ${sheetName}.`); // Reduce log noise
  return { pointValues, categories };
}

/**
 * Caching wrapper for readActivityData.
 * Uses a script-global variable and CacheService.
 */
function getActivityDataCached() {
  // 1. Check script-global cache first (fastest for same execution)
  if (activityDataCache) {
    // Logger.log("Using script-global activity data cache.");
    return activityDataCache;
  }

  // 2. Check CacheService (persists briefly across executions)
  const cache = CacheService.getScriptCache();
  const cachedJson = cache.get('activityData');
  if (cachedJson) {
    try {
      activityDataCache = JSON.parse(cachedJson);
      // Logger.log("Using CacheService for activity data.");
      return activityDataCache;
    } catch (e) {
      Logger.log(`Error parsing activity data from CacheService: ${e}. Refetching.`);
    }
  }

  // 3. If no cache hit, read fresh data
  Logger.log("Cache miss. Reading fresh activity data from sheet.");
  const freshData = readActivityData();

  // Store in both caches
  activityDataCache = freshData;
  try {
     // Only cache if data is not empty, prevent caching errors
     if (Object.keys(freshData.pointValues).length > 0) {
        cache.put('activityData', JSON.stringify(freshData), CONFIG.CACHE_EXPIRATION_SECONDS);
     }
  } catch (e) {
     Logger.log(`Error saving activity data to CacheService: ${e}`);
     // If JSON stringify fails (e.g., circular reference, unlikely here), log it but continue
  }

  return freshData;
}

/**
 * Processes a form submission event.
 * Logs data to Dashboard and the relevant Weekly sheet.
 * Updates Mobile View. Handles optional digest resend.
 * Uses CONFIG and caching.
 * @param {Event} e The form submission event object.
 * @return {boolean} True if processed successfully, false otherwise.
 */
function processFormSubmission(e) {
  activityDataCache = null; // Reset script cache for this new execution run

  try {
    if (!e || !e.response) {
      Logger.log("processFormSubmission called without valid event object.");
      return false;
    }

    const formResponse = e.response;
    const itemResponses = formResponse.getItemResponses();
    const timestamp = formResponse.getTimestamp();
    // Try getting email, default to "Unknown" if form doesn't collect it
    const email = formResponse.getRespondentEmail ? formResponse.getRespondentEmail() : "Unknown";

    Logger.log(`Processing form submission from ${email} at ${timestamp}`);

    let totalPoints = 0;
    const activitiesLogged = []; // Store { name, points, category, streakInfo }
    let resendDigest = false;

    const activityData = getActivityDataCached(); // Use cached data

    // Process item responses
    itemResponses.forEach(itemResponse => {
      const question = itemResponse.getItem().getTitle();
      const answer = itemResponse.getResponse();

      if (question === "Resend Daily Digest?") { // Check for specific question text
        if (answer === "Yes") {
          resendDigest = true;
          Logger.log("User requested daily digest resend.");
        }
        return; // Skip processing this as an activity
      }

      // Process checkbox or other multi-select answers
      if (Array.isArray(answer)) {
        answer.forEach(selectedOption => {
          if (selectedOption) { // Ensure option is not empty
             const result = processActivityWithPoints(String(selectedOption).trim(), activityData);
             totalPoints += result.points;
             if (result.name) activitiesLogged.push(result);
          }
        });
      } else if (answer && typeof answer === 'string' && answer.trim() !== 'Yes' && answer.trim() !== 'No') {
        // Process single answer, skip if it's just "Yes" or "No" from other questions
        const result = processActivityWithPoints(String(answer).trim(), activityData);
        totalPoints += result.points;
        if (result.name) activitiesLogged.push(result);
      }
    });

    Logger.log(`Processed ${activitiesLogged.length} activities. Total points: ${totalPoints}.`);

    // Perform updates using try/catch for each step
    try {
      updateDashboard(timestamp, email, activitiesLogged, totalPoints);
      Logger.log("Dashboard updated.");
    } catch (dashError) {
      Logger.log(`ERROR updating dashboard: ${dashError}\nStack: ${dashError.stack}`);
    }

    try {
      createOrUpdateWeeklySheet(timestamp, email, activitiesLogged, totalPoints);
      Logger.log("Weekly sheet updated/created.");
    } catch (weeklyError) {
      Logger.log(`ERROR updating weekly sheet: ${weeklyError}\nStack: ${weeklyError.stack}`);
      // Consider a fallback or notification here if weekly sheet fails
    }

    try {
      updateMobileView();
      Logger.log("Mobile view updated.");
    } catch (mobileError) {
      Logger.log(`ERROR updating mobile view: ${mobileError}\nStack: ${mobileError.stack}`);
    }

    // Send digest if requested
    if (resendDigest) {
      try {
        const digestSent = sendDailyDigest(); // Assuming sendDailyDigest returns boolean
        Logger.log(`Daily digest resend attempt: ${digestSent ? 'Success' : 'Failed'}`);
      } catch (digestError) {
        Logger.log(`ERROR resending daily digest: ${digestError}\nStack: ${digestError.stack}`);
      }
    }

    return true; // Indicate overall processing attempted

  } catch (error) {
    Logger.log(`CRITICAL ERROR in processFormSubmission: ${error}`);
    Logger.log(`Stack: ${error.stack}`);
    // Optionally send an error notification to admin
    // MailApp.sendEmail(ADMIN_EMAIL, "Budget Game Error", `Error in processFormSubmission: ${error}\n${error.stack}`);
    return false;
  } finally {
     activityDataCache = null; // Clear cache again just in case
  }
}

/**
 * Processes a single activity string (e.g., "Home made dinner (+1)")
 * Extracts name, calculates points including streak bonus.
 * @param {string} activityString The string from the form response.
 * @param {object} activityData The cached activity data {pointValues, categories}.
 * @return {object} { name: string|null, points: number, category: string, streakInfo: object }
 */
function processActivityWithPoints(activityString, activityData) {
  if (!activityString) {
     return { name: null, points: 0, category: "Unknown", streakInfo: { originalPoints: 0, bonusPoints: 0, totalPoints: 0, streakLength: 0, multiplier: 1 } };
  }

  const { pointValues, categories } = activityData;
  let activityName = null;
  let basePoints = 0;
  let category = "Unknown";

  // Try extracting from "Activity Name (+P)" format
  const match = activityString.match(/(.*?)\s*\(([+-]?\d+)\)/);

  if (match) {
    activityName = match[1].trim();
    // Important: Use points from the *sheet data* as the source of truth, not the string
    if (pointValues[activityName] !== undefined) {
      basePoints = pointValues[activityName];
      category = categories[activityName] || "Unknown";
    } else {
       // Activity name found in string, but not in Points Reference - log warning
       Logger.log(`Warning: Activity "${activityName}" from form response not found in Points Reference. Using 0 points.`);
       basePoints = 0; // Assign 0 points if not found
    }
  } else {
    // If no (+P) format, check if the whole string matches an activity name
    activityName = activityString;
    if (pointValues[activityName] !== undefined) {
       basePoints = pointValues[activityName];
       category = categories[activityName] || "Unknown";
    } else {
       // Whole string doesn't match either - treat as unknown
       Logger.log(`Warning: Unrecognized activity string "${activityString}". Using 0 points.`);
       activityName = activityString; // Keep original string as name for logging
       basePoints = 0;
    }
  }

  // Calculate streak multiplier and bonus points ONLY for positive base points
  let streakInfo = {
    originalPoints: basePoints,
    bonusPoints: 0,
    totalPoints: basePoints,
    streakLength: 0,
    multiplier: 1
  };

  if (activityName && basePoints > 0) {
    // Ensure calculateStreakMultiplier exists and handles potential errors
    try {
       // Check if calculateStreakMultiplier exists before calling
       if (typeof calculateStreakMultiplier === "function") {
          streakInfo = calculateStreakMultiplier(activityName, basePoints); // Assumes this function exists in Bonuses.gs
       } else {
          Logger.log("Warning: calculateStreakMultiplier function not found. Skipping streak calculation.");
          streakInfo.totalPoints = basePoints; // Fallback to base points
       }
    } catch (streakError) {
       Logger.log(`Error calculating streak for ${activityName}: ${streakError}. Using base points only.`);
       streakInfo.totalPoints = basePoints; // Fallback to base points
    }
  } else {
     // For negative points or zero base points, totalPoints is just basePoints
     streakInfo.totalPoints = basePoints;
  }


  return {
    name: activityName, // Can be null if activityString was empty
    points: streakInfo.totalPoints,
    category: category,
    streakInfo: streakInfo
  };
}

/**
 * Processes a cell value that might contain multiple comma-separated activities.
 * Used during rebuild from responses sheet AND by getWeekActivities.
 * @param {string} cellValue The value from the spreadsheet cell.
 * @return {object} { points: number, activities: Array<object> }
 */
function processCheckboxCell(cellValue) {
  let totalPoints = 0;
  const activities = []; // Array to hold { name, points, category, streakInfo }

  if (!cellValue || typeof cellValue !== 'string') {
    return { points: 0, activities: [] };
  }

  const activityData = getActivityDataCached(); // Use cached data
  const selectedOptions = cellValue.split(', '); // Assumes ", " delimiter

  selectedOptions.forEach(option => {
    const trimmedOption = option.trim();
    if (trimmedOption) {
      const result = processActivityWithPoints(trimmedOption, activityData);
      // Accumulate total points from all processed options in the cell
      // totalPoints += result.points; // Don't double-count points here, activities array holds final points
      // Add the detailed result object to the activities array
      if (result.name) { // Only add if it was a valid/processed activity
        activities.push({
            name: result.name,
            points: result.points, // Store the final points (incl. streak)
            category: result.category,
            streakInfo: result.streakInfo // Include streak info
        });
        totalPoints += result.points; // Sum points AFTER pushing details
      }
    }
  });

  return { points: totalPoints, activities: activities };
}


// --- Sheet Update Functions ---

/**
 * Updates the dashboard sheet with data from a single form submission.
 * Adds a new row if date doesn't exist, otherwise updates existing row.
 * Includes streak indicator (🔥X) in the activity string.
 * @param {Date} timestamp The timestamp of the submission.
 * @param {string} email The respondent's email.
 * @param {Array<object>} activities An array of processed activity objects { name, points, category, streakInfo }.
 * @param {number} totalPoints The total points for this submission.
 */
function updateDashboard(timestamp, email, activities, totalPoints) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  if (!dashboardSheet) {
     Logger.log("Dashboard sheet not found in updateDashboard.");
     return; // Cannot proceed
  }

  if (!(timestamp instanceof Date)) timestamp = new Date(timestamp);
  const formattedDate = formatDateYMD(timestamp); // YYYY-MM-DD for comparison
  const weekNum = getISOWeekNumber(timestamp);

  let rowIndex = -1;
  const lastRow = dashboardSheet.getLastRow();

  // Find existing row for the date (more efficient search backward)
  if (lastRow > 1) {
     const dateValues = dashboardSheet.getRange(2, 1, lastRow - 1, 1).getValues();
     for (let i = dateValues.length - 1; i >= 0; i--) {
        const cellDate = dateValues[i][0];
        if (cellDate instanceof Date && cellDate.getTime() > 0) {
           if (formatDateYMD(cellDate) === formattedDate) {
              rowIndex = i + 2; // +2 because data starts at row 2, loop index is 0-based
              break;
           }
        }
     }
  }

  // Prepare activity string and counts
  let positiveCountDelta = 0;
  let negativeCountDelta = 0;
  const activityStrings = activities.map(activity => {
    const symbol = activity.points >= 0 ? "➕" : "➖";
    // Use the final calculated points for display
    const formattedPts = activity.points >= 0 ? `+${activity.points}` : activity.points;
    // Count based on original base points before multiplier/bonus
    if (activity.streakInfo && activity.streakInfo.originalPoints > 0) positiveCountDelta++;
    if (activity.streakInfo && activity.streakInfo.originalPoints < 0) negativeCountDelta++;

    // Include streak info visually if streak exists (>= 2 days)
    let streakText = "";
    if (activity.streakInfo && activity.streakInfo.streakLength >= 2) { // Show for building streaks too
        streakText = ` (🔥${activity.streakInfo.streakLength})`;
    }
    return `${symbol} ${activity.name}${streakText} (${formattedPts})`;
  });
  const newActivitiesString = activityStrings.join(", ");

  if (rowIndex === -1) {
    // Add new row
    rowIndex = lastRow + 1;
    const newRowData = [
       timestamp,
       totalPoints,
       newActivitiesString,
       positiveCountDelta,
       negativeCountDelta,
       weekNum
    ];
    dashboardSheet.appendRow(newRowData);
    // Apply formatting to the new row immediately (optional but nice)
    dashboardSheet.getRange(rowIndex, 1).setNumberFormat(CONFIG.DATE_FORMAT_SHORT);
    dashboardSheet.getRange(rowIndex, 2).setNumberFormat(CONFIG.POINTS_FORMAT);
    // Apply alternating row color
     const bgColor = (rowIndex % 2 === 0) ? CONFIG.COLORS.ALTERNATING_ROW_BG : "#ffffff";
     dashboardSheet.getRange(rowIndex, 1, 1, 6).setBackground(bgColor);

  } else {
    // Update existing row
    const pointsCell = dashboardSheet.getRange(rowIndex, 2);
    const activitiesCell = dashboardSheet.getRange(rowIndex, 3);
    const posCountCell = dashboardSheet.getRange(rowIndex, 4);
    const negCountCell = dashboardSheet.getRange(rowIndex, 5);

    const existingPoints = pointsCell.getValue() || 0;
    const existingActivities = activitiesCell.getValue() || "";
    const existingPosCount = posCountCell.getValue() || 0;
    const existingNegCount = negCountCell.getValue() || 0;

    pointsCell.setValue(existingPoints + totalPoints);
    // Append new activities, handling empty existing string
    activitiesCell.setValue(existingActivities ? `${existingActivities}, ${newActivitiesString}` : newActivitiesString);
    posCountCell.setValue(existingPosCount + positiveCountDelta);
    negCountCell.setValue(existingNegCount + negativeCountDelta);
    // Week number should already be correct, no need to update
  }

  // Update summaries and charts after data modification
  updateWeeklyTotals();
  createDashboardCharts(); // Consider if this needs to run on every submission
}

/**
 * Calculates and updates the weekly summary totals on the Dashboard sheet.
 * Uses data from the Dashboard itself for the current week.
 */
function updateWeeklyTotals() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  if (!dashboardSheet) {
    Logger.log("Dashboard sheet not found in updateWeeklyTotals.");
    return null; // Indicate failure or missing data
  }

  const today = new Date();
  const startOfWeek = getWeekStartDate(today);
  const endOfWeek = getWeekEndDate(today);

  let weeklyTotal = 0;
  let weeklyPositiveCount = 0;
  let weeklyNegativeCount = 0;
  const activityCounts = {}; // For finding top activity
  const categoryCounts = { // Mirroring structure in setupDashboard (adjust keys if needed)
     "Total Positive": 0,
     "Total Negative": 0,
     "Health Specific": 0,
     "Household Specific": 0
     // Add other specific categories if tracked in dashboard summary
  };
  const activityData = getActivityDataCached(); // Needed for categories


  const lastRow = dashboardSheet.getLastRow();
  if (lastRow < 2) {
     Logger.log("No data on Dashboard to calculate weekly totals.");
     // Update summary cells to 0/None
     dashboardSheet.getRange("H2").setValue(0); // Total Points
     dashboardSheet.getRange("H3").setValue(0); // Positive Activities
     dashboardSheet.getRange("H4").setValue(0); // Negative Activities
     dashboardSheet.getRange("H5").setValue("None"); // Top Activity
     dashboardSheet.getRange("H6").setValue(0); // Top Activity Count
     dashboardSheet.getRange("K2:K5").setValue(0); // Category Counts
     return { total: 0, positive: 0, negative: 0, topActivity: "None", topActivityCount: 0, categories: categoryCounts };
  }

  const data = dashboardSheet.getRange(2, 1, lastRow - 1, 5).getValues(); // A2:E<lastRow>

  data.forEach(row => {
    const date = row[0];
    if (date instanceof Date && date >= startOfWeek && date <= endOfWeek) {
      const points = Number(row[1]) || 0;
      const activitiesString = row[2] || "";
      const posCount = Number(row[3]) || 0; // Use the stored counts directly
      const negCount = Number(row[4]) || 0; // Use the stored counts directly

      weeklyTotal += points;
      weeklyPositiveCount += posCount;
      weeklyNegativeCount += negCount;

      // Tally specific categories and top activity based on the activity string
       // Use stored counts for total pos/neg
       categoryCounts["Total Positive"] = weeklyPositiveCount;
       categoryCounts["Total Negative"] = weeklyNegativeCount;

      if (activitiesString) {
        const activitiesList = activitiesString.split(", ");
        activitiesList.forEach(activityEntry => {
          const match = activityEntry.match(/[➕➖]\s(.+?)\s(\(🔥\d+\))?\s\([+-]/); // Adjusted regex for optional streak
          if (match && match[1]) {
            const activityName = match[1].trim();
            // Increment top activity count
            activityCounts[activityName] = (activityCounts[activityName] || 0) + 1;
            // Increment specific category counts if applicable
            const category = activityData.categories[activityName];
            if (category === 'Health') categoryCounts["Health Specific"]++;
            if (category === 'Household') categoryCounts["Household Specific"]++;
            // Add more specific category checks if needed
          }
        });
      }
    }
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

  // Update Dashboard Summary Cells (G/H and J/K)
  dashboardSheet.getRange("H2").setValue(weeklyTotal);
  dashboardSheet.getRange("H3").setValue(weeklyPositiveCount);
  dashboardSheet.getRange("H4").setValue(weeklyNegativeCount);
  dashboardSheet.getRange("H5").setValue(topActivityName);
  dashboardSheet.getRange("H6").setValue(maxCount);

  dashboardSheet.getRange("K2").setValue(categoryCounts["Total Positive"]);
  dashboardSheet.getRange("K3").setValue(categoryCounts["Total Negative"]);
  dashboardSheet.getRange("K4").setValue(categoryCounts["Health Specific"]);
  dashboardSheet.getRange("K5").setValue(categoryCounts["Household Specific"]);
  // Update more category cells (K6, K7...) if you track more

  // Return the calculated data
   return {
    total: weeklyTotal,
    positive: weeklyPositiveCount,
    negative: weeklyNegativeCount,
    topActivity: topActivityName,
    topActivityCount: maxCount,
    categories: categoryCounts // Contains the specific counts calculated
  };
}

/**
 * Finds or creates the weekly sheet for the given timestamp's week.
 * Logs the submission entry to that sheet.
 * @param {Date} timestamp The timestamp of the submission.
 * @param {string} email The respondent's email.
 * @param {Array<object>} activities An array of processed activity objects { name, points, category, streakInfo }.
 * @param {number} totalPoints The total points for this submission.
 * @return {Sheet|null} The weekly sheet object, or null on failure.
 */
function createOrUpdateWeeklySheet(timestamp, email, activities, totalPoints) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!(timestamp instanceof Date)) timestamp = new Date(timestamp);

  const weekStartDate = getWeekStartDate(timestamp);
  const weekSheetName = getWeekSheetName(timestamp); // Uses helper function

  let weeklySheet = ss.getSheetByName(weekSheetName);

  if (!weeklySheet) {
    Logger.log(`Weekly sheet "${weekSheetName}" not found, creating.`);
    try {
       weeklySheet = createWeeklySheet(weekStartDate); // This handles setup internally
       if (!weeklySheet) { // Check if creation failed
          Logger.log(`Failed to create weekly sheet "${weekSheetName}" directly.`);
          // Optional: Try inserting blank sheet as fallback? Less ideal as setup might fail.
          return null;
       }
    } catch (createError) {
       Logger.log(`Error during createWeeklySheet for "${weekSheetName}": ${createError}`);
       return null; // Return null if creation fails
    }
  }

  // Add or update the entry in the weekly sheet
  try {
     updateWeeklySheetEntry(weeklySheet, timestamp, email, activities, totalPoints);
  } catch (updateEntryError) {
     Logger.log(`Error updating entry in "${weekSheetName}": ${updateEntryError}`);
     // Continue to summary update even if entry fails? Or return null? Decide based on desired robustness.
  }


  // Update the summary section of the weekly sheet
  try {
     updateWeeklySummary(weeklySheet); // Recalculates summary based on all entries
  } catch (updateSummaryError) {
     Logger.log(`Error updating summary in "${weekSheetName}": ${updateSummaryError}`);
  }


  return weeklySheet;
}

/**
 * Creates and sets up a new weekly sheet for the given week start date.
 * @param {Date} weekStartDate The Sunday start date of the week.
 * @return {Sheet|null} The newly created and set up sheet, or null on failure.
 */
function createWeeklySheet(weekStartDate) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const weekSheetName = getWeekSheetName(weekStartDate); // Uses helper

  // Avoid creating if it somehow already exists (double-check)
  if (ss.getSheetByName(weekSheetName)) {
     Logger.log(`Warning: Attempted to create weekly sheet "${weekSheetName}" but it already exists.`);
     return ss.getSheetByName(weekSheetName);
  }

  try {
     const weeklySheet = ss.insertSheet(weekSheetName);
     setupWeeklySheet(weeklySheet, weekStartDate); // Call setup function
     Logger.log(`Successfully created and set up weekly sheet: "${weekSheetName}"`);
     // Optional: Move sheet to a specific position? e.g., after Dashboard?
     // ss.setActiveSheet(weeklySheet);
     // ss.moveActiveSheet(2);
     return weeklySheet;
  } catch (e) {
     Logger.log(`ERROR creating weekly sheet "${weekSheetName}": ${e}`);
     // Clean up - delete the sheet if insertion happened but setup failed?
     const failedSheet = ss.getSheetByName(weekSheetName);
     if (failedSheet) {
        try { ss.deleteSheet(failedSheet); } catch (delErr) { /* Ignore delete error */ }
     }
     return null; // Indicate failure
  }
}


/**
 * Sets up the structure, headers, and formatting for a weekly sheet.
 * @param {Sheet} weeklySheet The sheet object to set up.
 * @param {Date} weekStartDate The Sunday start date for the week.
 */
function setupWeeklySheet(weeklySheet, weekStartDate) {
  const weekEndDate = getWeekEndDate(weekStartDate); // Use helper

  // --- Summary Section (A1:B7) ---
  weeklySheet.getRange("A1:B1").merge()
    .setValue("WEEKLY SUMMARY")
    .setBackground(CONFIG.COLORS.HEADER_BG)
    .setFontColor(CONFIG.COLORS.HEADER_FG)
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  const summaryLabels = [
    ["Date Range", `${formatDateYMD(weekStartDate)} to ${formatDateYMD(weekEndDate)}`], // Use YYYY-MM-DD
    ["Total Points", 0],
    ["Positive Activities", 0],
    ["Negative Activities", 0],
    ["Top Activity", "None"],
    ["Top Activity Count", 0]
  ];
  weeklySheet.getRange("A2:B7").setValues(summaryLabels);
  weeklySheet.getRange("A2:A7").setFontWeight("bold"); // Bold labels
  weeklySheet.getRange("B3").setNumberFormat(CONFIG.POINTS_FORMAT); // Total Points

  // --- Daily Data Headers (Row 9) ---
  const dataHeaders = [["Date", "Points", "Positive Activities", "Negative Activities", "Email"]];
  weeklySheet.getRange("A9:E9").setValues(dataHeaders)
    .setBackground(CONFIG.COLORS.HEADER_BG)
    .setFontColor(CONFIG.COLORS.HEADER_FG)
    .setFontWeight("bold");

  // --- Column Formatting & Widths ---
  weeklySheet.getRange("A10:A").setNumberFormat(CONFIG.DATE_FORMAT_SHORT); // Data dates
  weeklySheet.getRange("B10:B").setNumberFormat(CONFIG.POINTS_FORMAT); // Data points

  weeklySheet.setColumnWidth(1, 90);  // Date
  weeklySheet.setColumnWidth(2, 60);  // Points
  weeklySheet.setColumnWidth(3, 250); // Positive Activities
  weeklySheet.setColumnWidth(4, 250); // Negative Activities
  weeklySheet.setColumnWidth(5, 120); // Email

  // --- Conditional Formatting & Row Colors (Apply to data rows B10:E) ---
  const pointsRange = weeklySheet.getRange("B10:B"); // Data points range
  const posActivityRange = weeklySheet.getRange("C10:C");
  const negActivityRange = weeklySheet.getRange("D10:D");
  const dataRowRangeAtoE = weeklySheet.getRange("A10:E" + weeklySheet.getMaxRows()); // Extend to max rows

  var rules = weeklySheet.getConditionalFormatRules();
  // Clear previous rules for these specific ranges to ensure clean application
  const rangesToClear = [pointsRange.getA1Notation(), posActivityRange.getA1Notation(), negActivityRange.getA1Notation(), dataRowRangeAtoE.getA1Notation()];
  rules = rules.filter(rule => rule.getRanges().every(range => !rangesToClear.includes(range.getA1Notation())));


  // Points coloring
  var positiveRule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(0).setBackground(CONFIG.COLORS.POSITIVE_BG).setRanges([pointsRange]).build();
  var negativeRule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberLessThan(0).setBackground(CONFIG.COLORS.NEGATIVE_BG).setRanges([pointsRange]).build();

  // Activity column background coloring
  var posColRule = SpreadsheetApp.newConditionalFormatRule()
    .whenCellNotEmpty().setBackground(CONFIG.COLORS.POSITIVE_ACTIVITY_COL_BG).setRanges([posActivityRange]).build();
  var negColRule = SpreadsheetApp.newConditionalFormatRule()
    .whenCellNotEmpty().setBackground(CONFIG.COLORS.NEGATIVE_ACTIVITY_COL_BG).setRanges([negActivityRange]).build();

   // Alternating row colors
   var evenRowRule = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND(ROW()>=10, MOD(ROW(),2)=0)') // Even rows >= 10
      .setBackground(CONFIG.COLORS.ALTERNATING_ROW_BG)
      .setRanges([dataRowRangeAtoE])
      .build();
   var oddRowRule = SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND(ROW()>=10, MOD(ROW(),2)=1)') // Odd rows >= 10
      .setBackground('#ffffff') // Explicitly set white for odd
      .setRanges([dataRowRangeAtoE])
      .build();

   // Apply row rules first, then specific column/point rules
   rules.push(oddRowRule, evenRowRule, positiveRule, negativeRule, posColRule, negColRule);

  weeklySheet.setConditionalFormatRules(rules);


  // --- Category & Daily Breakdown (Side Section G:H) ---
  // Category Headers
  weeklySheet.getRange("G1:H1").setValues([["Category", "Count"]])
    .setBackground(CONFIG.COLORS.HEADER_BG)
    .setFontColor(CONFIG.COLORS.HEADER_FG)
    .setFontWeight("bold");

  // Category Labels (Specific categories tracked per week)
  const weeklyCategoryLabels = [
    ["Positive Activities"], ["Negative Activities"],
    ["Health Activities"], ["Household Activities"]
    // Add more if needed
  ];
  weeklySheet.getRange("G2:G5").setValues(weeklyCategoryLabels).setFontWeight("bold");
  weeklySheet.getRange("H2:H5").setValue(0); // Initialize counts

  // Daily Breakdown Headers
  weeklySheet.getRange("G7:H7").setValues([["Day of Week", "Points"]])
    .setBackground(CONFIG.COLORS.HEADER_BG)
    .setFontColor(CONFIG.COLORS.HEADER_FG)
    .setFontWeight("bold");

  // Daily Breakdown Labels & Init
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayValues = daysOfWeek.map(day => [day, 0]);
  weeklySheet.getRange("G8:H14").setValues(dayValues);
  weeklySheet.getRange("G8:G14").setFontWeight("bold");
  weeklySheet.getRange("H8:H14").setNumberFormat(CONFIG.POINTS_FORMAT); // Format daily points

  // Freeze top rows and potentially first column for easier scrolling
   weeklySheet.setFrozenRows(9);
   // weeklySheet.setFrozenColumns(1); // Optional

  Logger.log(`Setup complete for sheet: "${weeklySheet.getName()}"`);
}


/**
 * Updates a single entry (or adds a new one) in the weekly sheet for a given date.
 * Separates positive/negative activities into respective columns.
 * @param {Sheet} weeklySheet The specific weekly sheet object.
 * @param {Date} timestamp The timestamp of the submission.
 * @param {string} email The respondent's email.
 * @param {Array<object>} activities An array of processed activity objects { name, points, category, streakInfo }.
 * @param {number} totalPoints The total points for this submission.
 * @return {number} The row index that was updated or added.
 */
function updateWeeklySheetEntry(weeklySheet, timestamp, email, activities, totalPoints) {
  const formattedDate = formatDateYMD(timestamp); // YYYY-MM-DD for comparison
  let rowIndex = -1;
  const lastRow = weeklySheet.getLastRow();

  // Find existing row for the date (search backward from row 10)
  if (lastRow >= 10) {
     const dateValues = weeklySheet.getRange(10, 1, lastRow - 9, 1).getValues();
     for (let i = dateValues.length - 1; i >= 0; i--) {
        const cellDate = dateValues[i][0];
        if (cellDate instanceof Date && cellDate.getTime() > 0) {
           if (formatDateYMD(cellDate) === formattedDate) {
              rowIndex = i + 10; // +10 because data starts at row 10
              break;
           }
        }
     }
  }

  // Prepare activity strings (positive/negative)
  const positiveActivities = [];
  const negativeActivities = [];
  activities.forEach(activity => {
    const symbol = activity.points >= 0 ? "➕" : "➖";
    const formattedPts = activity.points >= 0 ? `+${activity.points}` : activity.points;
    // Include streak info visually if streak exists
    let streakText = "";
    if (activity.streakInfo && activity.streakInfo.streakLength >= 2) {
        streakText = ` (🔥${activity.streakInfo.streakLength})`;
    }
    const formattedActivity = `${symbol} ${activity.name}${streakText} (${formattedPts})`;

    if (activity.points >= 0) {
      positiveActivities.push(formattedActivity);
    } else {
      negativeActivities.push(formattedActivity);
    }
  });
  const newPositiveActivitiesString = positiveActivities.join(", ");
  const newNegativeActivitiesString = negativeActivities.join(", ");

  if (rowIndex === -1) {
    // Add new row
    rowIndex = Math.max(10, lastRow + 1); // Ensure we start at row 10 minimum
    const newRowData = [
       timestamp,
       totalPoints,
       newPositiveActivitiesString,
       newNegativeActivitiesString,
       email
    ];
    // weeklySheet.appendRow(newRowData); // Avoid appendRow with frozen rows/formatting issues
    weeklySheet.getRange(rowIndex, 1, 1, 5).setValues([newRowData]);

     // Ensure formatting is applied (sometimes needed even if CF rules exist)
     weeklySheet.getRange(rowIndex, 1).setNumberFormat(CONFIG.DATE_FORMAT_SHORT);
     weeklySheet.getRange(rowIndex, 2).setNumberFormat(CONFIG.POINTS_FORMAT);

  } else {
    // Update existing row
    const pointsCell = weeklySheet.getRange(rowIndex, 2);
    const posActivitiesCell = weeklySheet.getRange(rowIndex, 3);
    const negActivitiesCell = weeklySheet.getRange(rowIndex, 4);
    // Email might change if multiple users log on the same day - decide policy (overwrite? append?)
    // weeklySheet.getRange(rowIndex, 5).setValue(email); // Simple overwrite for now

    const existingPoints = pointsCell.getValue() || 0;
    const existingPosActivities = posActivitiesCell.getValue() || "";
    const existingNegActivities = negActivitiesCell.getValue() || "";

    pointsCell.setValue(existingPoints + totalPoints);
    // Append new activities, handling empty existing strings
    posActivitiesCell.setValue(existingPosActivities ? `${existingPosActivities}, ${newPositiveActivitiesString}` : newPositiveActivitiesString);
    negActivitiesCell.setValue(existingNegActivities ? `${existingNegActivities}, ${newNegativeActivitiesString}` : newNegativeActivitiesString);
  }

   // Let conditional formatting handle row/column colors based on rules set in setupWeeklySheet

  return rowIndex;
}

/**
 * Updates the summary statistics and charts for a specific weekly sheet.
 * Reads data from rows 10 onwards in that sheet.
 * @param {Sheet} weeklySheet The specific weekly sheet object.
 */
function updateWeeklySummary(weeklySheet) {
  const lastRow = weeklySheet.getLastRow();
  if (lastRow < 10) {
    Logger.log(`No data rows found in sheet "${weeklySheet.getName()}" to update summary.`);
    // Reset summary values to 0/None
    weeklySheet.getRange("B3").setValue(0); // Total Points
    weeklySheet.getRange("B4:B5").setValue(0); // Pos/Neg Count
    weeklySheet.getRange("B6").setValue("None"); // Top Activity
    weeklySheet.getRange("B7").setValue(0); // Top Activity Count
    weeklySheet.getRange("H2:H5").setValue(0); // Category Counts
    weeklySheet.getRange("H8:H14").setValue(0); // Daily Points
    return; // Nothing to summarize
  }

  const data = weeklySheet.getRange(10, 1, lastRow - 9, 4).getValues(); // A10:D<lastRow>
  const activityData = getActivityDataCached(); // For categories

  let totalPoints = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  const activityCounts = {}; // For top activity
  const categoryCounts = { // Mirroring labels in setupWeeklySheet G2:G5
    "Positive Activities": 0,
    "Negative Activities": 0,
    "Health Activities": 0,
    "Household Activities": 0
  };
  const dayPoints = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }; // Sun-Sat
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]; // For mapping index to name later

  data.forEach(row => {
    const date = row[0];
    const points = Number(row[1]) || 0;
    const positiveActivitiesStr = row[2] || "";
    const negativeActivitiesStr = row[3] || "";

    if (date instanceof Date && date.getTime() > 0) {
      totalPoints += points;
      dayPoints[date.getDay()] += points;

      // Process Positive Activities
      if (positiveActivitiesStr) {
        const posList = positiveActivitiesStr.split(", ");
        positiveCount += posList.length;
        categoryCounts["Positive Activities"] += posList.length;
        posList.forEach(activityEntry => {
          const match = activityEntry.match(/[➕]\s(.+?)\s(\(🔥\d+\))?\s\([\+]/); // Adjusted regex for optional streak
          if (match && match[1]) {
            const activityName = match[1].trim();
            activityCounts[activityName] = (activityCounts[activityName] || 0) + 1;
            const category = activityData.categories[activityName];
            if (category === 'Health') categoryCounts["Health Activities"]++;
            if (category === 'Household') categoryCounts["Household Activities"]++;
            // Add more specific categories if tracked
          }
        });
      }

      // Process Negative Activities
      if (negativeActivitiesStr) {
        const negList = negativeActivitiesStr.split(", ");
        negativeCount += negList.length;
        categoryCounts["Negative Activities"] += negList.length;
         negList.forEach(activityEntry => {
          const match = activityEntry.match(/[➖]\s(.+?)\s\([\-]/);
          if (match && match[1]) {
            const activityName = match[1].trim();
            activityCounts[activityName] = (activityCounts[activityName] || 0) + 1;
             // Don't double-count categories here if they were already counted above
             // Only count specific negative categories if needed (e.g., "Spending")
          }
        });
      }
    }
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

  // Update Summary Section (B3:B7)
  weeklySheet.getRange("B3").setValue(totalPoints);
  weeklySheet.getRange("B4").setValue(positiveCount);
  weeklySheet.getRange("B5").setValue(negativeCount);
  weeklySheet.getRange("B6").setValue(topActivityName);
  weeklySheet.getRange("B7").setValue(maxCount);

  // Update Category Counts (H2:H5)
  weeklySheet.getRange("H2").setValue(categoryCounts["Positive Activities"]);
  weeklySheet.getRange("H3").setValue(categoryCounts["Negative Activities"]);
  weeklySheet.getRange("H4").setValue(categoryCounts["Health Activities"]);
  weeklySheet.getRange("H5").setValue(categoryCounts["Household Activities"]);

  // Update Daily Breakdown (H8:H14)
  const dailyTotals = daysOfWeek.map((day, index) => [dayPoints[index]]); // Map index 0-6 to points
  weeklySheet.getRange("H8:H14").setValues(dailyTotals);


  // Regenerate charts for this specific weekly sheet
  createWeeklySheetCharts(weeklySheet);

  // Logger.log(`Updated summary for sheet: "${weeklySheet.getName()}"`); // Reduce log noise
}

/**
 * Updates the Mobile View sheet with current data for today and the week.
 * Prioritizes data from the current weekly sheet if available.
 */
function updateMobileView() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mobileSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.MOBILE_VIEW);
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);

  if (!mobileSheet) {
    Logger.log("Mobile View sheet not found in updateMobileView.");
    return false;
  }
  if (!dashboardSheet) {
    Logger.log("Dashboard sheet not found in updateMobileView.");
     // Clear mobile view or show error? Clear for now.
     mobileSheet.getRange("B3:B4").clearContent();
     mobileSheet.getRange("B7:B10").clearContent();
     mobileSheet.getRange("A14:B18").clearContent(); // Clear recent data rows
     mobileSheet.getRange("B3").setValue("Error: Dashboard Missing");
     return false;
  }

  const today = new Date();
  const formattedToday = formatDateYMD(today);
  const formattedTodayShort = Utilities.formatDate(today, Session.getScriptTimeZone(), CONFIG.DATE_FORMAT_SHORT);

  // --- Update Today's Data ---
  mobileSheet.getRange("B3").setValue(formattedTodayShort);

  let todayPoints = 0;
  // Find today's points directly from dashboard (usually faster than full recalc)
  const dashLastRow = dashboardSheet.getLastRow();
   if (dashLastRow > 1) {
      const dateValues = dashboardSheet.getRange(2, 1, dashLastRow - 1, 1).getValues();
      const pointsValues = dashboardSheet.getRange(2, 2, dashLastRow - 1, 1).getValues();
      for (let i = dateValues.length - 1; i >= 0; i--) {
         if (dateValues[i][0] instanceof Date && formatDateYMD(dateValues[i][0]) === formattedToday) {
            todayPoints = Number(pointsValues[i][0]) || 0;
            break;
         }
      }
   }
  mobileSheet.getRange("B4").setValue(todayPoints);


  // --- Update Weekly Summary & Recent Activities ---
  const weekSheetName = getWeekSheetName(today);
  const weeklySheet = ss.getSheetByName(weekSheetName);

  let weeklyTotal = 0;
  let weeklyPositive = 0;
  let weeklyNegative = 0;
  let topActivity = "None";
  let recentActivities = []; // Array of [DateString, Points]

  if (weeklySheet) {
    // Prioritize data from the weekly sheet's summary (recalculate for accuracy)
    const currentWeeklySummary = updateWeeklySummary(weeklySheet); // Recalc before reading
    // Logger.log("Updating mobile view using weekly sheet data.");
    weeklyTotal = weeklySheet.getRange("B3").getValue() || 0;
    weeklyPositive = weeklySheet.getRange("B4").getValue() || 0;
    weeklyNegative = weeklySheet.getRange("B5").getValue() || 0;
    topActivity = weeklySheet.getRange("B6").getValue() || "None";

    // Get recent activities from weekly sheet data rows (A10:B)
    const weeklyLastRow = weeklySheet.getLastRow();
    if (weeklyLastRow >= 10) {
       const startRow = Math.max(10, weeklyLastRow - 4); // Get up to 5 rows
       const numRows = weeklyLastRow - startRow + 1;
       const recentData = weeklySheet.getRange(startRow, 1, numRows, 2).getValues(); // Date, Points
       // Process and format, sort descending by date
       recentActivities = recentData
         .filter(row => row[0] instanceof Date)
         .sort((a, b) => b[0] - a[0]) // Sort date descending
         .slice(0, 5) // Take top 5
         .map(row => [Utilities.formatDate(row[0], Session.getScriptTimeZone(), CONFIG.DATE_FORMAT_SHORT), row[1]]);
    }

  } else {
    // Fallback to dashboard summary if weekly sheet doesn't exist (recalculate for accuracy)
    const currentDashSummary = updateWeeklyTotals(); // Recalc before reading
    // Logger.log("Updating mobile view using dashboard summary data (weekly sheet missing).");
    weeklyTotal = dashboardSheet.getRange("H2").getValue() || 0;
    weeklyPositive = dashboardSheet.getRange("H3").getValue() || 0;
    weeklyNegative = dashboardSheet.getRange("H4").getValue() || 0;
    topActivity = dashboardSheet.getRange("H5").getValue() || "None";

     // Get recent activities from dashboard sheet (A:B)
     if (dashLastRow > 1) {
       const startRow = Math.max(2, dashLastRow - 4); // Get up to 5 rows
       const numRows = dashLastRow - startRow + 1;
       const recentData = dashboardSheet.getRange(startRow, 1, numRows, 2).getValues(); // Date, Points
       // Process and format, sort descending by date
        recentActivities = recentData
         .filter(row => row[0] instanceof Date)
         .sort((a, b) => b[0] - a[0]) // Sort date descending
         .slice(0, 5) // Take top 5
         .map(row => [Utilities.formatDate(row[0], Session.getScriptTimeZone(), CONFIG.DATE_FORMAT_SHORT), row[1]]);
     }
  }

  // Update Mobile View weekly summary cells
  mobileSheet.getRange("B7").setValue(weeklyTotal);
  mobileSheet.getRange("B8").setValue(weeklyPositive);
  mobileSheet.getRange("B9").setValue(weeklyNegative);
  mobileSheet.getRange("B10").setValue(topActivity);

  // Update Mobile View recent activities (A14:B18 - allowing 5 entries below header)
  mobileSheet.getRange("A14:B18").clearContent(); // Clear old data
  if (recentActivities.length > 0) {
     mobileSheet.getRange(14, 1, recentActivities.length, 2).setValues(recentActivities);
  } else {
     mobileSheet.getRange("A14").setValue("No recent data");
  }

  // Logger.log("Mobile view updated successfully."); // Reduce log noise
  return true;
}


// --- Charting Functions ---

/**
 * Creates/updates charts on the Dashboard sheet.
 */
function createDashboardCharts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  if (!dashboardSheet) return;

  // Remove existing charts owned by this sheet
  dashboardSheet.getCharts().forEach(chart => dashboardSheet.removeChart(chart));

  const lastRow = dashboardSheet.getLastRow();
  if (lastRow < 2) return; // No data to chart

  try {
    // Chart 1: Points Over Time (Line Chart) - Uses A2:B<lastRow>
    const dateRange = dashboardSheet.getRange(2, 1, lastRow - 1, 1); // A2:A<lastRow>
    const pointsRange = dashboardSheet.getRange(2, 2, lastRow - 1, 1); // B2:B<lastRow>

    const lineChart = dashboardSheet.newChart()
      .setChartType(Charts.ChartType.LINE)
      .addRange(dateRange) // X-axis
      .addRange(pointsRange) // Y-axis
      .setMergeStrategy(Charts.MergeStrategy.MERGE_COLUMNS)
      .setTransposeRowsAndColumns(false)
      .setNumHeaders(0) // Data ranges don't include headers
      .setOption('title', 'Points Over Time')
      .setOption('legend', { position: 'none' })
      .setOption('colors', [CONFIG.COLORS.CHART_MAIN_LINE])
      .setOption('hAxis', { title: 'Date', format: CONFIG.DATE_FORMAT_SHORT })
      .setOption('vAxis', { title: 'Points' })
      .setOption('width', 450)
      .setOption('height', 300)
      .setPosition(2, 7, 10, 10) // Place near summary: Row 2, Col G(7), offset 10,10
      .build();
    dashboardSheet.insertChart(lineChart);

    // Chart 2: Positive vs Negative Activities (Pie Chart) - Uses K2:K3 (Assuming these are Total Pos/Neg counts)
    const pieLabelsRange = dashboardSheet.getRange("J2:J3"); // Labels: Total Positive, Total Negative
    const pieValuesRange = dashboardSheet.getRange("K2:K3"); // Values

    const pieChart = dashboardSheet.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(pieLabelsRange) // Add labels first
      .addRange(pieValuesRange) // Add values
      .setMergeStrategy(Charts.MergeStrategy.MERGE_COLUMNS)
      .setTransposeRowsAndColumns(false)
      .setNumHeaders(0)
      .setOption('title', 'Positive vs Negative Activity Count (This Week)')
      .setOption('pieSliceText', 'value') // Show counts on slices
      .setOption('legend', { position: 'right' })
      .setOption('colors', [CONFIG.COLORS.CHART_POSITIVE, CONFIG.COLORS.CHART_NEGATIVE]) // Green, Red
      .setOption('width', 450)
      .setOption('height', 300)
      .setPosition(18, 7, 10, 10) // Below line chart: Row 18, Col G(7)
      .build();
    dashboardSheet.insertChart(pieChart);

    // Chart 3: Specific Category Distribution (Column Chart) - Uses J4:K5 (or more)
     const categoryLabelsRange = dashboardSheet.getRange("J4:J5"); // Labels: Health Specific, Household Specific
     const categoryValuesRange = dashboardSheet.getRange("K4:K5"); // Values

     const categoryChart = dashboardSheet.newChart()
       .setChartType(Charts.ChartType.COLUMN)
       .addRange(categoryLabelsRange) // X-axis labels
       .addRange(categoryValuesRange) // Y-axis values
       .setMergeStrategy(Charts.MergeStrategy.MERGE_COLUMNS)
       .setTransposeRowsAndColumns(false)
       .setNumHeaders(0)
       .setOption('title', 'Specific Category Counts (This Week)')
       .setOption('legend', { position: 'none' })
       .setOption('colors', [CONFIG.COLORS.CHART_HEALTH, CONFIG.COLORS.CHART_HOUSEHOLD]) // Colors match order J4, J5
       .setOption('hAxis', { title: 'Category', slantedText: true, slantedTextAngle: 30 })
       .setOption('vAxis', { title: 'Count', minValue: 0 })
       .setOption('width', 450)
       .setOption('height', 300)
       .setPosition(34, 7, 10, 10) // Below pie chart: Row 34, Col G(7)
       .build();
     dashboardSheet.insertChart(categoryChart);


    // Logger.log("Dashboard charts updated."); // Reduce log noise

  } catch (e) {
    Logger.log(`Error creating dashboard charts: ${e}`);
  }
}

/**
 * Creates/updates charts on a specific weekly sheet.
 * @param {Sheet} weeklySheet The sheet object for the specific week.
 */
function createWeeklySheetCharts(weeklySheet) {
  if (!weeklySheet) return;

  // Remove existing charts owned by this sheet
  weeklySheet.getCharts().forEach(chart => weeklySheet.removeChart(chart));

  const lastRow = weeklySheet.getLastRow();
  // Only chart if summary data likely exists (check summary cell maybe?)
  // Or check if data rows exist: if (lastRow < 10) return;

  try {
    // Chart 1: Points by Day (Column Chart) - Uses G8:H14
    const dayLabelsRange = weeklySheet.getRange("G8:G14"); // Day names
    const dayValuesRange = weeklySheet.getRange("H8:H14"); // Points values

    const dayChart = weeklySheet.newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(dayLabelsRange) // X-axis labels
      .addRange(dayValuesRange) // Y-axis values
      .setMergeStrategy(Charts.MergeStrategy.MERGE_COLUMNS)
      .setTransposeRowsAndColumns(false)
      .setNumHeaders(0)
      .setOption('title', 'Points by Day of Week')
      .setOption('legend', { position: 'none' })
      .setOption('colors', [CONFIG.COLORS.CHART_MAIN_LINE])
      .setOption('hAxis', { title: 'Day' })
      .setOption('vAxis', { title: 'Points' })
      .setOption('width', 350) // Mobile friendly size
      .setOption('height', 250)
      .setPosition(10, 7, 5, 5) // Place near data: Row 10, Col G(7)
      .build();
    weeklySheet.insertChart(dayChart);

    // Chart 2: Category Distribution (Pie Chart) - Uses G2:H5
     const categoryLabelsRange = weeklySheet.getRange("G2:G5"); // Category names
     const categoryValuesRange = weeklySheet.getRange("H2:H5"); // Category counts

     const categoryChart = weeklySheet.newChart()
       .setChartType(Charts.ChartType.PIE)
       .addRange(categoryLabelsRange) // Add labels first
       .addRange(categoryValuesRange) // Add values
       .setMergeStrategy(Charts.MergeStrategy.MERGE_COLUMNS)
       .setTransposeRowsAndColumns(false)
       .setNumHeaders(0)
       .setOption('title', 'Activity Category Counts')
       .setOption('pieSliceText', 'value')
       .setOption('legend', { position: 'right' })
        .setOption('colors', [CONFIG.COLORS.CHART_POSITIVE, CONFIG.COLORS.CHART_NEGATIVE, CONFIG.COLORS.CHART_HEALTH, CONFIG.COLORS.CHART_HOUSEHOLD]) // Match order G2:G5
       .setOption('width', 350) // Mobile friendly size
       .setOption('height', 250)
       .setPosition(26, 7, 5, 5) // Below day chart: Row 26, Col G(7)
       .build();
     weeklySheet.insertChart(categoryChart);


    // Logger.log(`Charts updated for sheet: "${weeklySheet.getName()}"`); // Reduce log noise

  } catch (e) {
    Logger.log(`Error creating charts for sheet "${weeklySheet.getName()}": ${e}`);
  }
}


// --- Form Update Functions ---

/**
 * Updates the Google Form dropdown/checkbox options based on the Points Reference sheet.
 * Groups activities by category.
 */
function updateFormFromSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let form;

  // Try linked form first, then configured URL
  try {
    const formUrl = ss.getFormUrl();
    if (formUrl) {
      form = FormApp.openByUrl(formUrl);
    } else {
      Logger.log("Spreadsheet form URL not found, trying CONFIG URL.");
      if (CONFIG.FORM_URL) {
        form = FormApp.openByUrl(CONFIG.FORM_URL);
      } else {
        SpreadsheetApp.getUi().alert("Error: No form linked or configured in CONFIG.FORM_URL.");
        return false;
      }
    }
  } catch (e) {
    Logger.log(`Error opening form: ${e}. Trying CONFIG URL as fallback.`);
    try {
       if (CONFIG.FORM_URL) {
          form = FormApp.openByUrl(CONFIG.FORM_URL);
       } else {
          SpreadsheetApp.getUi().alert("Error opening form. No linked or configured URL available.");
          return false;
       }
    } catch (e2) {
       Logger.log(`FATAL: Could not open form using linked URL or CONFIG URL: ${e2}`);
       SpreadsheetApp.getUi().alert(`Error: Could not open form. Check URL and permissions.\nDetails: ${e2.message}`);
       return false;
    }
  }

  const activityData = getActivityDataCached(); // Use cached data
  const { pointValues, categories } = activityData;

  if (Object.keys(pointValues).length === 0) {
     Logger.log("No activities found in Points Reference. Form not updated.");
     // Optional: Alert user?
     // SpreadsheetApp.getUi().alert("Warning: No activities found in 'Points Reference' sheet. Form could not be updated.");
     return false;
  }


  // Group activities by category for form sections
  const categoryGroups = {};
  CONFIG.CATEGORIES.forEach(cat => categoryGroups[cat] = []); // Initialize all categories

  Object.keys(pointValues).forEach(activity => {
    const category = categories[activity];
    const points = pointValues[activity];
    const formattedPoints = points >= 0 ? `+${points}` : points;
    const choiceString = `${activity} (${formattedPoints})`;

    if (category && categoryGroups[category] !== undefined) { // Check if category key exists
      categoryGroups[category].push(choiceString);
    } else {
      Logger.log(`Warning: Activity "${activity}" has unknown or uninitialized category "${category}". Skipping form update for this item.`);
      // Optionally add to a default "Other" category if desired
    }
  });

  // Sort choices alphabetically within each category
  CONFIG.CATEGORIES.forEach(cat => {
      if(categoryGroups[cat]) categoryGroups[cat].sort();
  });

  // --- Update Form Items ---
  const formItems = form.getItems(FormApp.ItemType.CHECKBOX); // Get only checkbox items
  const existingItemTitles = formItems.map(item => item.getTitle());
  const updatedCategories = new Set(); // Track which categories have had their form item updated

  formItems.forEach(item => {
    const itemTitle = item.getTitle();
    let categoryFound = null;

    // Try matching title directly to a pattern like "Which [Category] activities...?"
    const titleMatch = itemTitle.match(/Which (.*?) activities/i);
    if (titleMatch && CONFIG.CATEGORIES.includes(titleMatch[1].trim())) {
      categoryFound = titleMatch[1].trim();
    } else {
      // Fallback: Infer category from existing choices if title didn't match standard pattern
      const choices = item.asCheckboxItem().getChoices();
      if (choices.length > 0) {
        const firstChoice = choices[0].getValue();
        const choiceMatch = firstChoice.match(/(.*?)\s*\([+-]?\d+\)/);
        if (choiceMatch) {
          const activityName = choiceMatch[1].trim();
          const inferredCategory = categories[activityName];
          if (CONFIG.CATEGORIES.includes(inferredCategory)) {
            categoryFound = inferredCategory;
            // Logger.log(`Inferred category "${categoryFound}" for item "${itemTitle}" from first choice.`);
            // Optional: Update the item title for consistency? Requires care not to infinite loop if title doesn't match pattern
             // if (!titleMatch) { item.setTitle(`Which ${categoryFound} activities did you complete?`); }
          }
        }
      }
    }

    if (categoryFound) {
      const choicesForCategory = categoryGroups[categoryFound] || [];
      try {
        item.asCheckboxItem().setChoiceValues(choicesForCategory);
        updatedCategories.add(categoryFound); // Mark this category as updated
        if (choicesForCategory.length > 0) {
           // Logger.log(`Updated choices for form item: "${itemTitle}" (Category: ${categoryFound})`); // Reduce log noise
        } else {
           Logger.log(`No activities for category "${categoryFound}". Cleared choices for "${itemTitle}".`);
        }
      } catch (updateError) {
        Logger.log(`Error updating choices for form item "${itemTitle}": ${updateError}`);
      }
    } else {
        // Item exists but couldn't identify its category - maybe delete it or leave it?
        Logger.log(`Could not determine category for existing checkbox item: "${itemTitle}". Leaving as is.`);
    }
  });

  // Add new items for categories that weren't found/updated and have activities
  CONFIG.CATEGORIES.forEach(category => {
    const expectedTitle = `Which ${category} activities did you complete?`; // Standard title format
    if (!updatedCategories.has(category) && categoryGroups[category].length > 0) {
      // Double check if item with exact title already exists (e.g., if created manually)
      if (!existingItemTitles.includes(expectedTitle)) {
         try {
           form.addCheckboxItem()
             .setTitle(expectedTitle)
             .setChoiceValues(categoryGroups[category]);
           Logger.log(`Added new form item for category: "${category}"`);
         } catch (addError) {
           Logger.log(`Error adding new form item for category "${category}": ${addError}`);
         }
      } else {
          Logger.log(`Skipping add for category "${category}": Item with title "${expectedTitle}" already exists but wasn't matched during update phase.`);
          // Might indicate an issue with the matching logic above or manual form edits.
      }
    }
  });

  // Optional: Add the "Resend Daily Digest?" question if it doesn't exist
  addResendDigestQuestion(form); // Pass form object

  SpreadsheetApp.getActiveSpreadsheet().toast('Form updated from Points Reference.', 'Update Complete', 5);
  return true;
}

/**
 * Adds the "Resend Daily Digest?" question to the form if it doesn't exist.
 * @param {Form} form The Form object.
 */
function addResendDigestQuestion(form) {
  const questionTitle = "Resend Daily Digest?";
  // Check *all* item types in case it was added differently before
  const items = form.getItems();
  let exists = false;
  for (let i = 0; i < items.length; i++) {
    if (items[i].getTitle() === questionTitle) {
      exists = true;
      break;
    }
  }

  if (!exists) {
    try {
      // Add as Multiple Choice for simple Yes/No
      form.addMultipleChoiceItem()
        .setTitle(questionTitle)
        .setChoiceValues(["Yes", "No"])
        .setRequired(false); // Make it optional
      Logger.log(`Added "${questionTitle}" question to the form.`);
    } catch (e) {
       Logger.log(`Error adding "${questionTitle}" question: ${e}`);
    }
  }
}


// --- Email Functions ---

/**
 * Sends the Morning Motivation email with yesterday's recap, suggestions, and challenges.
 * Now includes weather data from OpenWeather API.
 */
function sendMorningMotivationEmail() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);

    if (!dashboardSheet) {
      Logger.log("Morning Email: Dashboard sheet not found");
      return false;
    }

    // --- 1. Get Yesterday's Data ---
    var yesterdayData = getYesterdaysRecapData(dashboardSheet); // Uses helper below
    var formattedYesterdayPoints = yesterdayData.points === null ? "N/A" :
                                  (yesterdayData.points >= 0 ? "+" + yesterdayData.points : yesterdayData.points); // Handle null points

    // --- 2. Get Weather Data ---
    let weatherData = null;
    let weatherMessage = "";
    try {
      weatherData = fetchWeatherData(); // Get weather for default location
      weatherMessage = getWeatherMessage(weatherData);
    } catch (weatherError) {
      Logger.log(`Error getting weather data: ${weatherError}`);
      weatherMessage = "Weather data unavailable, but that won't stop you from having a great day!";
    }

    // --- 3. Generate Smart Suggestions with Weather Influence ---
    var suggestions = [];
    
    // First try weather-specific suggestions
    if (weatherData && typeof getWeatherSuggestions === "function") {
      const weatherSuggestions = getWeatherSuggestions(weatherData);
      if (weatherSuggestions.length > 0) {
        // Use at least one weather suggestion if available
        suggestions.push(weatherSuggestions[Math.floor(Math.random() * weatherSuggestions.length)]);
      }
    }
    
    // Then add regular suggestions
    if (typeof generateSmartSuggestions === "function") {
      const regularSuggestions = generateSmartSuggestions();
      // Add regular suggestions until we reach the max
      for (let i = 0; i < regularSuggestions.length && suggestions.length < CONFIG.SUGGESTION_SETTINGS.MAX_SUGGESTIONS; i++) {
        suggestions.push(regularSuggestions[i]);
      }
    }

    // --- 4. Generate Daily Goal Options with Weather Consideration ---
    var goalOptions = [];
    
    // First try weather-specific goals
    if (weatherData && typeof getWeatherSuggestions === "function") {
      const weatherGoals = getWeatherSuggestions(weatherData)
        .map(suggestion => ({
          text: suggestion.text,
          points: suggestion.activity ? activityData.pointValues[suggestion.activity] : null
        }));
        
      if (weatherGoals.length > 0) {
        // Add one weather-based goal
        goalOptions.push(weatherGoals[Math.floor(Math.random() * weatherGoals.length)]);
      }
    }
    
    // Then add regular goals
    if (typeof generateDailyGoalOptions === "function") {
      const regularGoals = generateDailyGoalOptions();
      // Add regular goals until we reach the desired count
      for (let i = 0; i < regularGoals.length && goalOptions.length < CONFIG.DAILY_GOAL_OPTIONS_COUNT; i++) {
        goalOptions.push(regularGoals[i]);
      }
    }

    // --- 5. Get an appropriate greeting based on weather ---
    let greeting = "";
    if (typeof selectWeatherGreeting === "function" && weatherData) {
      greeting = selectWeatherGreeting(weatherData);
    } else if (typeof selectGreeting === "function") {
      greeting = selectGreeting();
    } else {
      greeting = "Happy " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEEE") + "!";
    }

    // --- 6. Build Email Body ---
    var todayFormatted = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEEE, MMMM d");

    var emailBody = `
    <div style="font-family: Arial, sans-serif; max-width: 550px; margin: 0 auto; background-color: #fcfcfc; padding: 15px; border: 1px solid #eee;">
      <div style="background-color: ${CONFIG.COLORS.MORNING_HEADER_BG}; color: ${CONFIG.COLORS.MORNING_HEADER_FG}; padding: 15px; text-align: center; border-radius: 5px 5px 0 0;">
        <h1 style="font-size: 22px; margin: 0;">${CONFIG.EMAIL_SUBJECTS.MORNING_MOTIVATION}</h1>
        <p style="margin: 5px 0 0 0;">${todayFormatted}</p>
      </div>

      <!-- Weather Section -->
      <div style="background-color: #fff; padding: 15px; margin: 15px 0; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="font-size: 16px; color: #555; margin: 0 0 10px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">🌤️ Today's Weather</h2>
        <p style="margin: 10px 0;">${weatherMessage}</p>
      </div>

      <!-- Today's Greeting -->
      <div style="background-color: #fff; padding: 15px; margin: 15px 0; border: 1px solid #eee; border-radius: 5px;">
        <p style="margin: 5px 0; font-size: 16px; font-weight: bold;">${greeting}</p>
      </div>

      <!-- Yesterday's Recap -->
      <div style="background-color: #fff; padding: 15px; margin: 15px 0; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="font-size: 16px; color: #555; margin: 0 0 10px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">📊 Yesterday's Recap</h2>
        <p style="margin: 5px 0;"><strong>Points Earned:</strong> <span style="font-weight: bold; color: ${yesterdayData.points === null ? '#555' : (yesterdayData.points >= 0 ? CONFIG.COLORS.CHART_POSITIVE : CONFIG.COLORS.CHART_NEGATIVE)};">${formattedYesterdayPoints}</span></p>
        ${yesterdayData.activityCount > 0 ? `<p style="margin: 5px 0;"><strong>Activities Logged:</strong> ${yesterdayData.activityCount}</p>` : '<p style="margin: 5px 0;">No activities logged yesterday.</p>'}
      </div>

      <!-- Smart Suggestions -->
      ${suggestions.length > 0 ? `
      <div style="background-color: ${CONFIG.COLORS.SUGGESTION_BG}; padding: 15px; margin: 15px 0; border: 1px solid ${CONFIG.COLORS.SUGGESTION_BORDER}; border-radius: 5px;">
        <h2 style="font-size: 16px; color: #117A65; margin: 0 0 10px 0; border-bottom: 1px solid ${CONFIG.COLORS.SUGGESTION_BORDER}; padding-bottom: 5px;">💡 Today's Suggestions</h2>
        <ul style="margin: 0; padding-left: 20px; list-style: '✨ '; line-height: 1.5;">` + // Added list-style and line-height
        suggestions.map(s => `<li style="margin-bottom: 8px;">${s.text} ${s.activity ? `<br><small style='color:#555'><em>(Activity: ${s.activity})</em></small>` : ''}</li>`).join('') + // Put activity on new line
        `</ul>
      </div>` : ''}

      <!-- Daily Challenges/Goals -->
      ${goalOptions.length > 0 ? `
      <div style="background-color: ${CONFIG.COLORS.CHALLENGE_BG}; padding: 15px; margin: 15px 0; border: 1px solid ${CONFIG.COLORS.CHALLENGE_BORDER}; border-radius: 5px;">
        <h2 style="font-size: 16px; color: #B9770E; margin: 0 0 10px 0; border-bottom: 1px solid ${CONFIG.COLORS.CHALLENGE_BORDER}; padding-bottom: 5px;">🎯 Today's Challenges (Ideas)</h2>
        <p style="font-size: 0.9em; color: #777; margin-top: 0;">Consider tackling one of these! Log related activities as usual.</p>
        <ul style="margin: 0; padding-left: 20px; list-style: '➡️ '; line-height: 1.5;">` + // Added list-style and line-height
        goalOptions.map(g => `<li style="margin-bottom: 8px;">${g.text} ${g.points ? `(<span style="color:${CONFIG.COLORS.CHART_POSITIVE}">Potential: +${g.points} pts</span>)` : ''}</li>`).join('') + // Colored points
        `</ul>
      </div>` : ''}

      <!-- Footer -->
      <div style="text-align: center; margin-top: 20px;">
        <a href="${ss.getUrl()}" style="display: inline-block; background-color: #5dade2; color: white; text-decoration: none; padding: 10px 20px; border-radius: 4px; font-size: 0.9em;">Open Budget Game</a>
      </div>
      <div style="text-align: center; color: #aaa; font-size: 11px; margin-top: 15px;">
        <p>Budget Game Morning Motivation</p>
      </div>
    </div>
    `;

    // --- 7. Send Email ---
    var subject = CONFIG.EMAIL_SUBJECTS.MORNING_MOTIVATION;
    var recipients = CONFIG.DIGEST_EMAIL_ADDRESSES;

    recipients.forEach(function(emailAddress) {
      if (emailAddress && emailAddress.includes('@')) {
        try {
          MailApp.sendEmail({
            to: emailAddress,
            subject: subject,
            htmlBody: emailBody,
            name: "Budget Game Bot" // Optional sender name
          });
          Logger.log(`Sent morning email to ${emailAddress}`);
        } catch (mailError) {
          Logger.log(`Error sending morning email to ${emailAddress}: ${mailError}`);
        }
      }
    });

    return true;

  } catch (error) {
    Logger.log(`CRITICAL ERROR in sendMorningMotivationEmail: ${error}`);
    Logger.log(`Stack: ${error.stack}`);
    return false;
  }
}

/**
 * Helper function to get yesterday's points and activity count.
 * @param {Sheet} dashboardSheet The dashboard sheet object.
 * @return {object} { points: number|null, activityCount: number }
 */
function getYesterdaysRecapData(dashboardSheet) {
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var formattedYesterday = formatDateYMD(yesterday); // Use existing helper

  var points = null;
  var activityCount = 0;

  try {
    const lastRow = dashboardSheet.getLastRow();
    if (lastRow < 2) return { points: null, activityCount: 0 }; // No data

    const range = dashboardSheet.getRange(2, 1, lastRow - 1, 3); // Get A, B, C
    const data = range.getValues();

    for (let i = data.length - 1; i >= 0; i--) { // Search backwards
      const rowData = data[i];
      const cellDate = rowData[0]; // Date in Col A
      if (cellDate instanceof Date && cellDate.getTime() > 0) {
        if (formatDateYMD(cellDate) === formattedYesterday) {
          points = Number(rowData[1]) || 0; // Points in Col B
          // Count activities by splitting the string, handle empty strings
          const activitiesStr = rowData[2] || ""; // Activities in Col C
          if (activitiesStr.trim()) {
             // Count non-empty segments after splitting
             activityCount = activitiesStr.split(',').filter(act => act.trim() !== '').length;
          }
          break; // Found yesterday's data
        }
      }
    }
  } catch (e) {
    Logger.log(`Error fetching yesterday's data: ${e}`);
  }

  return { points: points, activityCount: activityCount };
}


/**
 * Sends the daily summary digest email. Includes today's points/activities,
 * weekly progress, goals, and streaks. Corrected version.
 * Uses formatting from CONFIG.
 * Assumes supporting functions (trackActivityStreaks, checkWeeklyGoalProgressWithDetails etc.) exist.
 */
function sendDailyDigest() {
  try {
    // Add diagnostic log at the very beginning
    Logger.log("--- Starting sendDailyDigest ---");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
    if (!dashboardSheet) {
      Logger.log("Daily Digest: Dashboard sheet not found.");
      return false;
    }

    // --- Get Data ---
    const today = new Date();
    const formattedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), "EEEE, MMMM d");
    const formattedYMD = formatDateYMD(today);

    // Today's Data from Dashboard
    let todayPoints = 0;
    let todayActivitiesStr = "No activities recorded yet today";
    const dashLastRow = dashboardSheet.getLastRow();
    if (dashLastRow > 1) {
       const dates = dashboardSheet.getRange(2, 1, dashLastRow-1, 1).getValues();
       const data = dashboardSheet.getRange(2, 1, dashLastRow-1, 3).getValues(); // A:C
       for (let i = dates.length - 1; i >= 0; i--) {
          if (dates[i][0] instanceof Date && formatDateYMD(dates[i][0]) === formattedYMD) {
             todayPoints = data[i][1] || 0;
             todayActivitiesStr = data[i][2] || "No activities recorded yet today";
             break;
          }
       }
    }
    const formattedTodayPoints = todayPoints >= 0 ? `+${todayPoints}` : todayPoints;
    Logger.log(`Today's Points: ${formattedTodayPoints}, Activities String Length: ${todayActivitiesStr.length}`);


    // Weekly Summary Data from Dashboard (Current state)
    const weeklyData = updateWeeklyTotals(); // Recalculate for current state
    if (!weeklyData) {
        Logger.log("Daily Digest: Failed to get weekly summary data.");
        weeklyData = { total: 0, positive: 0, negative: 0, topActivity: "N/A" }; // Fallback
    }
    const formattedWeeklyTotal = weeklyData.total >= 0 ? `+${weeklyData.total}` : weeklyData.total;
    const weekStartDate = getWeekStartDate(today);
    const weekEndDate = getWeekEndDate(today);
    const weekStartFormatted = Utilities.formatDate(weekStartDate, Session.getScriptTimeZone(), CONFIG.DATE_FORMAT_SHORT);
    const weekEndFormatted = Utilities.formatDate(weekEndDate, Session.getScriptTimeZone(), CONFIG.DATE_FORMAT_SHORT);


    // Game Data (Streaks, Goals - Fetch current status)
    // --- Diagnostic Log for Streaks ---
    let streakData = {}; // Default empty
    try {
        if (typeof trackActivityStreaks === "function") {
            streakData = trackActivityStreaks(); // Assumes exists in Bonuses.gs or similar
          //  Logger.log("Streak Data fetched in sendDailyDigest: " + JSON.stringify(streakData));
        } else {
          //  Logger.log("Warning: trackActivityStreaks function not found.");
        }
    } catch(streakFetchErr) {
      //  Logger.log("ERROR fetching streak data in sendDailyDigest: " + streakFetchErr);
    }

    let goalsWithProgress = []; // Default empty
    try {
        if (typeof checkWeeklyGoalProgressWithDetails === "function") {
             goalsWithProgress = checkWeeklyGoalProgressWithDetails(); // Assumes exists in GoalSetting.gs and provides progress details
        //     Logger.log(`Fetched ${goalsWithProgress.length} goals with progress details.`);
        } else {
        //     Logger.log("Warning: checkWeeklyGoalProgressWithDetails function not found.");
        }
    } catch (goalFetchErr) {
      //  Logger.log("ERROR fetching goal progress in sendDailyDigest: " + goalFetchErr);
    }


    // --- Build Email Body ---
    let emailBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f9fa; padding: 20px; border: 1px solid #ddd;">
      <div style="text-align: center; padding: 10px 0; margin-bottom: 20px;">
        <h1 style="color: #333; font-size: 24px; margin: 0;">${CONFIG.EMAIL_SUBJECTS.DAILY_DIGEST}</h1>
        <p style="color: #666; margin: 5px 0;">${formattedDate}</p>
      </div>

      <!-- Today's Points -->
      <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
        <h2 style="font-size: 28px; margin: 0 0 10px 0; color: ${todayPoints >= 0 ? CONFIG.COLORS.CHART_POSITIVE : CONFIG.COLORS.CHART_NEGATIVE};">
          TODAY'S POINTS: ${formattedTodayPoints}
        </h2>
      </div>

      <!-- Today's Activities -->
      <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">Today's Activities Logged:</h3>
        <ul style="padding-left: 20px; list-style-type: none; margin: 0;">`;

    // --- Loop through activities and format with color and streak info ---
    if (todayActivitiesStr && todayActivitiesStr !== "No activities recorded yet today" && todayActivitiesStr !== "No activities recorded") {
      const activitiesList = todayActivitiesStr.split(", ");
      activitiesList.forEach(activity => {
        if (activity.trim()) {
          const isPositive = activity.includes("➕") || /\(\+\d+\)/.test(activity);
          const isNegative = activity.includes("➖") || /\(-\d+\)/.test(activity);
          const icon = isPositive ? "➕" : (isNegative ? "➖" : "▪️");
          const color = isPositive ? CONFIG.COLORS.CHART_POSITIVE : (isNegative ? CONFIG.COLORS.CHART_NEGATIVE : "#555");

          let cleanActivity = activity.replace("➕ ", "").replace("➖ ", "");
          let streakDisplay = "";
          const streakMatch = cleanActivity.match(/\(🔥(\d+)\)/);

          if (streakMatch) {
             const streakLength = parseInt(streakMatch[1]);
             if (streakLength >= CONFIG.STREAK_THRESHOLDS.BONUS_1) {
                const streakEmoji = streakLength >= CONFIG.STREAK_THRESHOLDS.MULTIPLIER ? "🔥🔥🔥" :
                                  (streakLength >= CONFIG.STREAK_THRESHOLDS.BONUS_2 ? "🔥🔥" : "🔥");
                streakDisplay = ` <span style="color: ${CONFIG.COLORS.STREAK_COLOR}; font-size: 0.9em;">${streakEmoji} ${streakLength}-day streak!</span>`;
             }
             cleanActivity = cleanActivity.replace(streakMatch[0], "").trim();
          }

          emailBody += `<li style="margin-bottom: 10px; line-height: 1.4;">
              <span style="color: ${color}; font-weight: bold; display: inline-block; width: 20px;">${icon}</span>
              ${cleanActivity} ${streakDisplay}
            </li>`;
        }
      });
    } else {
      emailBody += `<li>${todayActivitiesStr}</li>`;
    }
    emailBody += `</ul></div>`;


    // --- Weekly Goals Progress Section --- (Restored)
    if (goalsWithProgress && goalsWithProgress.length > 0) {
       emailBody += `
       <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
         <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">🎯 Weekly Goals Progress:</h3>`;

       goalsWithProgress.forEach(goal => {
          const progressBarWidth = Math.min(100, Math.max(0, goal.percentComplete || 0));
          const progressBarColor = progressBarWidth >= 100 ? CONFIG.COLORS.CHART_POSITIVE : "#2196F3";
          let statusText = "";
          if (progressBarWidth >= 100) {
             statusText = `<span style="color: ${CONFIG.COLORS.CHART_POSITIVE}; font-weight: bold;">Completed! (+${goal.bonusPoints} pts)</span>`;
          } else if (goal.remainingValue !== undefined && goal.remainingValue > 0) {
             statusText = `<span style="color: ${CONFIG.COLORS.STREAK_COLOR};">${goal.remainingValue} more to go!</span>`;
          } else if (goal.currentValue !== undefined && goal.targetValue !== undefined) {
             if(goal.type === 'negative_limit'){
                statusText = `Current Negative: ${goal.currentValue} / Limit: ${goal.targetValue}`;
             } else {
                statusText = `Current: ${goal.currentValue} / Target: ${goal.targetValue}`;
             }
          }

          emailBody += `
          <div style="margin-bottom: 15px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; align-items: center;">
              <strong style="font-size: 1.1em;">${goal.name}</strong>
              <span style="font-size: 0.9em; color: #555;">${progressBarWidth}% Complete</span>
            </div>
            <div style="background-color: #e0e0e0; height: 12px; border-radius: 6px; overflow: hidden; margin-bottom: 5px;">
              <div style="background-color: ${progressBarColor}; height: 100%; width: ${progressBarWidth}%;"></div>
            </div>
            <p style="margin: 5px 0; color: #666; font-size: 0.9em;">
              ${goal.description}<br>
              ${statusText}
            </p>
          </div>`;
       });
       emailBody += `</div>`;
    }


     // --- Streaks Section --- (Restored & with Diagnostic Logging)
     const buildingStreaks = streakData.buildingStreaks || {};
     const fullStreaks = streakData.streaks || {};
     const hasBuildingStreaks = Object.keys(buildingStreaks).length > 0;
     const hasFullStreaks = Object.keys(fullStreaks).length > 0;
     Logger.log(`Streak Check: hasBuilding=${hasBuildingStreaks}, hasFull=${hasFullStreaks}`); // Diagnostic Log

     if (hasBuildingStreaks || hasFullStreaks) {
        Logger.log("Entering streak display block in email."); // Diagnostic Log
        emailBody += `
        <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">🔥 Current Activity Streaks:</h3>`;

        if (hasFullStreaks) {
           Logger.log(`Full streaks exist (${Object.keys(fullStreaks).length}), adding list.`); // Diagnostic Log
           emailBody += `<h4 style="color: ${CONFIG.COLORS.STREAK_COLOR}; margin: 10px 0 5px 0;">Active Streaks (3+ days):</h4>
                         <ul style="list-style-type: none; padding-left: 20px; margin: 0;">`;
           Object.entries(fullStreaks).sort(([,aDays],[,bDays]) => bDays - aDays).forEach(([activity, days]) => {
              const streakEmoji = days >= CONFIG.STREAK_THRESHOLDS.MULTIPLIER ? "🔥🔥🔥" : (days >= CONFIG.STREAK_THRESHOLDS.BONUS_2 ? "🔥🔥" : "🔥");
              let rewardText = "";
              if (days >= CONFIG.STREAK_THRESHOLDS.MULTIPLIER) rewardText = `<span style="color: ${CONFIG.COLORS.CHART_POSITIVE}; font-size: 0.9em;">(2x Points Active!)</span>`;
              else if (days >= CONFIG.STREAK_THRESHOLDS.BONUS_2) rewardText = `<span style="color: ${CONFIG.COLORS.CHART_POSITIVE}; font-size: 0.9em;">(+${CONFIG.STREAK_BONUS_POINTS.BONUS_2} Bonus Pts!)</span>`;
              else if (days >= CONFIG.STREAK_THRESHOLDS.BONUS_1) rewardText = `<span style="color: ${CONFIG.COLORS.CHART_POSITIVE}; font-size: 0.9em;">(+${CONFIG.STREAK_BONUS_POINTS.BONUS_1} Bonus Pt!)</span>`;

              emailBody += `<li style="margin-bottom: 8px;">
                             <strong>${activity}</strong>: ${days} days ${streakEmoji} ${rewardText}
                          </li>`;
           });
           emailBody += `</ul>`;
        }

        if (hasBuildingStreaks) {
            Logger.log(`Building streaks exist (${Object.keys(buildingStreaks).length}), adding list.`); // Diagnostic Log
            emailBody += `<h4 style="color: #E67E22; margin: 15px 0 5px 0;">Building Streaks (2 days):</h4>
                          <ul style="list-style-type: none; padding-left: 20px; margin: 0;">`;
             Object.keys(buildingStreaks).forEach(activity => {
                emailBody += `<li style="margin-bottom: 8px;">
                                <strong>${activity}</strong>: 2 days - Keep it up for a bonus! 💪
                             </li>`;
             });
             emailBody += `</ul>`;
        }
        emailBody += `</div>`;
     } else {
        Logger.log("No building or full streaks found to display in email."); // Diagnostic Log
     }


    // --- Weekly Progress Section --- (Kept from simplified version)
    emailBody += `
    <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">📅 Weekly Progress (${weekStartFormatted} - ${weekEndFormatted}):</h3>
      <p><strong>Current Weekly Total:</strong> <span style="font-weight: bold; color: ${weeklyData.total >= 0 ? CONFIG.COLORS.CHART_POSITIVE : CONFIG.COLORS.CHART_NEGATIVE}">${formattedWeeklyTotal} points</span></p>
      <p><strong>Positive Activities (Week):</strong> ${weeklyData.positive || 0}</p>
      <p><strong>Negative Activities (Week):</strong> ${weeklyData.negative || 0}</p>
      <p><strong>Top Activity (Week):</strong> ${weeklyData.topActivity || "None"}</p>
    </div>

    <!-- Footer & Links -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="${ss.getUrl()}" style="display: inline-block; background-color: ${CONFIG.COLORS.HEADER_BG}; color: white; text-decoration: none; padding: 12px 30px; border-radius: 4px; font-weight: bold;">LOG MORE ACTIVITIES</a>
    </div>
    <div style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
      <p>This email was automatically generated by Budget Game.</p>
    </div>
  </div>`;


    // --- Send Email ---
    const subject = CONFIG.EMAIL_SUBJECTS.DAILY_DIGEST;
    CONFIG.DIGEST_EMAIL_ADDRESSES.forEach(emailAddress => {
      if (emailAddress && emailAddress.includes('@')) {
        try {
          MailApp.sendEmail({
            to: emailAddress,
            subject: subject,
            htmlBody: emailBody,
            name: "Budget Game Bot"
          });
          Logger.log(`Sent daily digest to ${emailAddress}`);
        } catch (mailError) {
          Logger.log(`Error sending daily digest to ${emailAddress}: ${mailError}`);
        }
      }
    });

    Logger.log("--- Finished sendDailyDigest ---");
    return true;

  } catch (error) {
    Logger.log(`CRITICAL ERROR in sendDailyDigest: ${error}`);
    Logger.log(`Stack: ${error.stack}`);
    return false;
  }
}


// --- Trigger and Edit Handling ---

/**
 * Handles edits made directly to the Points Reference sheet.
 * Updates the form after a short delay if a row seems complete.
 * Clears activity data cache.
 * @param {Event} e The edit event object.
 */
function handlePointsReferenceEdit(e) {
  try { // Added try/catch block
    const sheet = e.source.getActiveSheet();
    const sheetName = sheet.getName();
    const pointsRefSheetName = CONFIG.SHEET_NAMES.POINTS_REFERENCE;

    if (sheetName === pointsRefSheetName) {
      const range = e.range;
      const row = range.getRow();

      // Ignore header row edits
      if (row === 1) return;

      // Check if the edited row (or newly added row) seems complete
      const activityRange = sheet.getRange(row, 1, 1, 3); // A:C for the edited row
      const values = activityRange.getValues()[0];
      const hasActivity = values[0] && String(values[0]).trim() !== "";
      const hasPoints = values[1] !== "" && !isNaN(values[1]);
      const hasCategory = values[2] && String(values[2]).trim() !== "" && CONFIG.CATEGORIES.includes(String(values[2]).trim());

      if (hasActivity && hasPoints && hasCategory) {
        Logger.log(`Complete row edit detected in ${pointsRefSheetName} at row ${row}. Scheduling form update and cache clear.`);
        // Add a delay to allow for multiple quick edits before updating
        Utilities.sleep(CONFIG.POINTS_EDIT_DELAY_MS);

        // Clear the cache *before* updating the form (form update reads fresh data)
        activityDataCache = null;
        CacheService.getScriptCache().remove('activityData');
        Logger.log("Cleared activity data cache due to Points Reference edit.");

        // Update the form
        updateFormFromSheet();

      } else {
        // Optional: Log incomplete edit without taking action
        // Logger.log(`Incomplete edit detected in ${pointsRefSheetName} at row ${row}. Form not updated.`);
      }
    }
  } catch (err) {
     Logger.log(`ERROR in handlePointsReferenceEdit: ${err}`);
  }
}

/**
 * Sets up an onEdit trigger specifically for the Points Reference sheet.
 */
function setupPointsReferenceEditTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const triggers = ScriptApp.getProjectTriggers();
  const handlerFunction = CONFIG.TRIGGERS.POINTS_EDIT;
  let triggerExists = false;

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === handlerFunction) {
      triggerExists = true;
    }
  });

  if (!triggerExists) {
    try {
      ScriptApp.newTrigger(handlerFunction)
        .forSpreadsheet(ss)
        .onEdit()
        .create();
      Logger.log(`Created onEdit trigger for ${handlerFunction}.`);
      SpreadsheetApp.getUi().alert(`Auto-update trigger for '${CONFIG.SHEET_NAMES.POINTS_REFERENCE}' has been set up.`);
    } catch (e) {
        Logger.log(`Failed to create onEdit trigger for ${handlerFunction}: ${e}`);
        SpreadsheetApp.getUi().alert(`Error setting up auto-update trigger: ${e.message}`);
    }
  } else {
    Logger.log(`onEdit trigger for ${handlerFunction} already exists.`);
    SpreadsheetApp.getUi().alert(`Auto-update trigger for '${CONFIG.SHEET_NAMES.POINTS_REFERENCE}' already exists.`);
  }
}


/**
 * Handles edits made directly to the Form Responses sheet.
 * Triggers a full rebuild of derived data.
 * @param {Event} e The edit event object.
 */
function handleFormResponsesEdit(e) {
  try {
    const sheet = e.source.getActiveSheet();
    const sheetName = sheet.getName();
    const responsesSheetName = CONFIG.SHEET_NAMES.FORM_RESPONSES;

    // Check if the edit occurred in the configured responses sheet
    if (sheetName === responsesSheetName) {
      // Check if it was a row deletion or significant content change
      // e.changeType gives 'EDIT', 'INSERT_ROW', 'REMOVE_ROW', 'INSERT_COLUMN', 'REMOVE_COLUMN', 'FORMAT', 'OTHER'
      if (e.changeType === 'REMOVE_ROW' || e.changeType === 'EDIT' || e.changeType === 'INSERT_ROW') {
         Logger.log(`Edit (${e.changeType}) detected in ${responsesSheetName}. Triggering rebuild.`);
         SpreadsheetApp.getActiveSpreadsheet().toast(`Detected edit in ${responsesSheetName}. Rebuilding derived sheets...`, 'Rebuilding Data', 10);
         // Add a small delay to let Sheets catch up before rebuild
         Utilities.sleep(1500);
         const rebuildResult = rebuildAllFromFormResponses();
         if (rebuildResult) {
            Logger.log("Rebuild completed successfully after Form Responses edit.");
            SpreadsheetApp.getActiveSpreadsheet().toast("Rebuild complete.", 'Success', 5);
         } else {
            Logger.log("Rebuild failed after Form Responses edit.");
            SpreadsheetApp.getUi().alert("Rebuild failed after editing Form Responses. Check logs.");
         }
      }
    }
  } catch (error) {
    Logger.log(`Error in handleFormResponsesEdit: ${error}\nStack: ${error.stack}`);
  }
}

/**
 * Sets up an onEdit trigger specifically for the Form Responses sheet.
 */
function setupOnEditTrigger() { // Consider renaming to setupFormResponsesEditTrigger
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const triggers = ScriptApp.getProjectTriggers();
  const handlerFunction = CONFIG.TRIGGERS.RESPONSES_EDIT;
  let triggerExists = false;

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === handlerFunction) {
      triggerExists = true;
    }
  });

  if (!triggerExists) {
     try {
        ScriptApp.newTrigger(handlerFunction)
          .forSpreadsheet(ss)
          .onEdit()
          .create();
        Logger.log(`Created onEdit trigger for ${handlerFunction}.`);
        SpreadsheetApp.getUi().alert(`Edit detection trigger for '${CONFIG.SHEET_NAMES.FORM_RESPONSES}' has been set up. Edits will trigger a rebuild.`);
     } catch (e) {
         Logger.log(`Failed to create onEdit trigger for ${handlerFunction}: ${e}`);
         SpreadsheetApp.getUi().alert(`Error setting up edit detection trigger: ${e.message}`);
     }
  } else {
    Logger.log(`onEdit trigger for ${handlerFunction} already exists.`);
    // SpreadsheetApp.getUi().alert(`Edit detection trigger for '${CONFIG.SHEET_NAMES.FORM_RESPONSES}' already exists.`); // Maybe don't alert if it exists
  }
}

/**
 * Sets up ALL required triggers for the Budget Game.
 * Deletes only triggers related to this script before creating them.
 * Uses CONFIG for handler names and settings.
 */
function setupAllTriggers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const currentTriggers = ScriptApp.getProjectTriggers();
  const expectedHandlers = Object.values(CONFIG.TRIGGERS); // Get list of handler names from CONFIG

  Logger.log("Setting up all triggers...");
  let triggersDeletedCount = 0;
  let triggersCreatedCount = 0;
  let triggerErrors = [];

  // Delete existing triggers managed by this script
  currentTriggers.forEach(trigger => {
    const handler = trigger.getHandlerFunction();
    if (expectedHandlers.includes(handler)) {
      try {
        ScriptApp.deleteTrigger(trigger);
        Logger.log(`Deleted existing trigger for: ${handler}`);
        triggersDeletedCount++;
      } catch (e) {
         Logger.log(`Failed to delete trigger for ${handler}: ${e}`);
         triggerErrors.push(`Delete failed for ${handler}: ${e.message}`);
      }
    }
  });
  if (triggersDeletedCount > 0) Logger.log(`Deleted ${triggersDeletedCount} existing script triggers.`);

  // --- Create New Triggers ---

  // 1. Morning Motivation Email
  try {
    ScriptApp.newTrigger(CONFIG.TRIGGERS.MORNING_EMAIL)
      .timeBased().atHour(CONFIG.MORNING_EMAIL_HOUR).everyDays(1).create();
    Logger.log(`Created trigger: ${CONFIG.TRIGGERS.MORNING_EMAIL} (Hour ${CONFIG.MORNING_EMAIL_HOUR})`);
    triggersCreatedCount++;
  } catch (e) { Logger.log(`FAIL ${CONFIG.TRIGGERS.MORNING_EMAIL}: ${e}`); triggerErrors.push(`Create ${CONFIG.TRIGGERS.MORNING_EMAIL}: ${e.message}`); }

  // 2. Daily Digest (Evening)
  try {
    ScriptApp.newTrigger(CONFIG.TRIGGERS.DAILY_DIGEST)
      .timeBased().atHour(CONFIG.DAILY_DIGEST_HOUR).everyDays(1).create();
     Logger.log(`Created trigger: ${CONFIG.TRIGGERS.DAILY_DIGEST} (Hour ${CONFIG.DAILY_DIGEST_HOUR})`);
     triggersCreatedCount++;
  } catch (e) { Logger.log(`FAIL ${CONFIG.TRIGGERS.DAILY_DIGEST}: ${e}`); triggerErrors.push(`Create ${CONFIG.TRIGGERS.DAILY_DIGEST}: ${e.message}`); }

  // 3. Weekly Digest
  try {
      ScriptApp.newTrigger(CONFIG.TRIGGERS.WEEKLY_DIGEST)
        .timeBased().onWeekDay(CONFIG.WEEKLY_DIGEST_DAY).atHour(CONFIG.WEEKLY_DIGEST_HOUR).create();
       Logger.log(`Created trigger: ${CONFIG.TRIGGERS.WEEKLY_DIGEST} (Day ${CONFIG.WEEKLY_DIGEST_DAY}, Hour ${CONFIG.WEEKLY_DIGEST_HOUR})`);
       triggersCreatedCount++;
  } catch (e) { Logger.log(`FAIL ${CONFIG.TRIGGERS.WEEKLY_DIGEST}: ${e}`); triggerErrors.push(`Create ${CONFIG.TRIGGERS.WEEKLY_DIGEST}: ${e.message}`); }

  // 4. Form Submit
  let formLinked = false;
  try {
    const formUrl = ss.getFormUrl() || CONFIG.FORM_URL; // Try linked, then config
    if (formUrl) {
       const form = FormApp.openByUrl(formUrl);
       ScriptApp.newTrigger(CONFIG.TRIGGERS.FORM_SUBMIT)
         .forForm(form).onFormSubmit().create();
       Logger.log(`Created trigger: ${CONFIG.TRIGGERS.FORM_SUBMIT}`);
       triggersCreatedCount++;
       formLinked = true;
    } else {
       Logger.log("Skipping form submit trigger: No form linked or configured.");
    }
  } catch (e) { Logger.log(`FAIL ${CONFIG.TRIGGERS.FORM_SUBMIT}: ${e}`); triggerErrors.push(`Create ${CONFIG.TRIGGERS.FORM_SUBMIT}: ${e.message}`); }

  // 5. Points Reference Edit
  try {
     ScriptApp.newTrigger(CONFIG.TRIGGERS.POINTS_EDIT)
      .forSpreadsheet(ss).onEdit().create();
     Logger.log(`Created trigger: ${CONFIG.TRIGGERS.POINTS_EDIT} (onEdit)`);
     triggersCreatedCount++;
  } catch (e) { Logger.log(`FAIL ${CONFIG.TRIGGERS.POINTS_EDIT}: ${e}`); triggerErrors.push(`Create ${CONFIG.TRIGGERS.POINTS_EDIT}: ${e.message}`); }

  // 6. Form Responses Edit
  try {
     ScriptApp.newTrigger(CONFIG.TRIGGERS.RESPONSES_EDIT)
      .forSpreadsheet(ss).onEdit().create();
     Logger.log(`Created trigger: ${CONFIG.TRIGGERS.RESPONSES_EDIT} (onEdit)`);
     triggersCreatedCount++;
  } catch (e) { Logger.log(`FAIL ${CONFIG.TRIGGERS.RESPONSES_EDIT}: ${e}`); triggerErrors.push(`Create ${CONFIG.TRIGGERS.RESPONSES_EDIT}: ${e.message}`); }


  // --- Report Results ---
  let message = `Trigger Setup Complete.\nCreated: ${triggersCreatedCount} triggers.`;
  if (!formLinked) message += "\nWarning: Form submit trigger not created (form not linked or configured).";
  if (triggerErrors.length > 0) {
     message += `\n\nERRORS ENCOUNTERED:\n- ${triggerErrors.join('\n- ')}`;
     Logger.log(`Trigger setup finished with ${triggerErrors.length} errors.`);
     SpreadsheetApp.getUi().alert(message); // Show errors prominently
  } else {
     Logger.log("Trigger setup finished successfully.");
     SpreadsheetApp.getActiveSpreadsheet().toast('All Budget Game triggers have been set up/updated!', 'Success', 7);
  }
}


// --- Rebuild Functions ---

/**
 * Rebuilds Dashboard, Weekly Sheets, and Mobile View from the Form Responses sheet.
 * USE WITH CAUTION - Clears existing derived data first.
 */
function rebuildAllFromFormResponses() {
  activityDataCache = null; // Clear cache at start of rebuild

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
     'Confirm Rebuild',
     'This will clear and rebuild the Dashboard, all Weekly sheets, and Mobile View from "Form Responses 1". This can take time and cannot be undone. Proceed?',
     ui.ButtonSet.YES_NO);

  if (response !== ui.Button.YES) {
    Logger.log("Rebuild cancelled by user.");
    return false;
  }

  Logger.log("Starting rebuild process...");
  SpreadsheetApp.getActiveSpreadsheet().toast('Starting rebuild...', 'In Progress', -1); // Indefinite toast

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const formSheetName = CONFIG.SHEET_NAMES.FORM_RESPONSES;
    const formSheet = ss.getSheetByName(formSheetName);

    if (!formSheet) {
      Logger.log(`ERROR: Form Responses sheet "${formSheetName}" not found. Cannot rebuild.`);
      ui.alert(`Error: Sheet "${formSheetName}" not found. Rebuild aborted.`);
      SpreadsheetApp.getActiveSpreadsheet().toast('Rebuild Failed: Responses sheet missing.', 'Error', 10);
      return false;
    }

    // 1. Clear Derived Sheets
    Logger.log("Clearing derived sheets...");
    const clearSuccess = clearDerivedSheets();
    if (!clearSuccess) {
      Logger.log("Warning: Issues encountered during sheet clearing. Attempting rebuild anyway.");
      // Decide whether to abort or continue if clearing fails
    }
    SpreadsheetApp.flush(); // Ensure sheets are cleared before proceeding

    // 2. Get Form Data
    const lastRow = formSheet.getLastRow();
    if (lastRow <= 1) {
      Logger.log("No data found in Form Responses sheet. Rebuild finished (nothing to process).");
      SpreadsheetApp.getActiveSpreadsheet().toast('Rebuild Complete: No responses found.', 'Complete', 10);
      updateMobileView(); // Update mobile view to show empty state
      return true;
    }
    const formData = formSheet.getRange(2, 1, lastRow - 1, formSheet.getLastColumn()).getValues();
    Logger.log(`Processing ${formData.length} form responses...`);

    const activityData = getActivityDataCached(); // Pre-cache data once for the loop

    // 3. Process Each Row
    let errorsDuringProcessing = 0;
    for (let i = 0; i < formData.length; i++) {
      const row = formData[i];
      const timestamp = row[0]; // Assuming Timestamp is column A

      if (!(timestamp instanceof Date) || timestamp.getTime() === 0) {
         Logger.log(`Skipping row ${i + 2}: Invalid timestamp.`);
         continue; // Skip rows with invalid timestamps
      }

      // Assume email isn't in responses, use placeholder or derive if possible
      const email = "Rebuild"; // Indicate source? Or use configured emails?

      let rowTotalPoints = 0;
      let rowActivities = [];

      // Process activity columns (assuming they start from column B, index 1)
      const numCols = row.length;
      for (let col = 1; col < numCols; col++) {
         const cellValue = row[col];
         // Skip simple Yes/No answers during rebuild too
         if (cellValue && typeof cellValue === 'string' && cellValue.trim() !== 'Yes' && cellValue.trim() !== 'No') {
           const cellResult = processCheckboxCell(cellValue); // Uses cached data
           rowTotalPoints += cellResult.points;
           rowActivities = rowActivities.concat(cellResult.activities);
         }
      }

      // Update Dashboard and Weekly Sheet for this entry
      try {
         // Note: Pass rowActivities (detailed list) and rowTotalPoints
         updateDashboard(timestamp, email, rowActivities, rowTotalPoints);
      } catch (dashErr) {
         Logger.log(`Rebuild Error (Dashboard Update) for row ${i + 2}: ${dashErr}`);
         errorsDuringProcessing++;
      }

      try {
         createOrUpdateWeeklySheet(timestamp, email, rowActivities, rowTotalPoints);
      } catch (weeklyErr) {
         Logger.log(`Rebuild Error (Weekly Update) for row ${i + 2}: ${weeklyErr}`);
         errorsDuringProcessing++;
      }

       // Optional: Add progress update and sleep
       if ((i + 1) % 20 === 0) { // Update toast every 20 rows
          SpreadsheetApp.getActiveSpreadsheet().toast(`Rebuilding... Processed ${i + 1}/${formData.length} responses.`, 'In Progress', -1);
          Utilities.sleep(CONFIG.REBUILD_SLEEP_MS); // Small pause
       }

    } // End row processing loop

    // 4. Final Updates
    Logger.log("Updating Mobile View after rebuild...");
    updateMobileView(); // Make sure this is called *after* loop finishes

    Logger.log(`Rebuild process completed. ${errorsDuringProcessing} errors occurred during row processing.`);
    if(errorsDuringProcessing > 0) {
        SpreadsheetApp.getActiveSpreadsheet().toast(`Rebuild Complete with ${errorsDuringProcessing} errors. Check logs.`, 'Warning', 10);
    } else {
        SpreadsheetApp.getActiveSpreadsheet().toast('Rebuild Complete!', 'Success', 10);
    }
    return true;

  } catch (error) {
    Logger.log(`CRITICAL ERROR during rebuild: ${error}\nStack: ${error.stack}`);
    ui.alert(`Rebuild failed due to a critical error: ${error.message}. Check script logs for details.`);
    SpreadsheetApp.getActiveSpreadsheet().toast('Rebuild Failed Critically! Check Logs.', 'Error', 10);
    return false;
  } finally {
     activityDataCache = null; // Clear cache when done
  }
}

/**
 * Clears data from Dashboard, Mobile View, and all Weekly sheets.
 * Intended for use before a rebuild. Handles errors more gracefully.
 * @return {boolean} True if clearing was generally successful, false if major errors occurred.
 */
function clearDerivedSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let overallSuccess = true;
  const errors = [];

  Logger.log("Starting sheet clearing process...");

  // --- Clear Dashboard ---
  try {
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent(); // Clear only content A2:LastCol<LastRow>
      }
      // Reset summary values
      sheet.getRange("H2:H6").setValue(0);
      sheet.getRange("H5").setValue("None");
      sheet.getRange("K2:K5").setValue(0); // Adjust range if more categories
      // Remove charts
      sheet.getCharts().forEach(chart => sheet.removeChart(chart));
      Logger.log(`Cleared Dashboard sheet.`);
    } else {
      Logger.log(`Dashboard sheet not found during clear.`);
    }
  } catch (e) {
    Logger.log(`Error clearing Dashboard: ${e}`);
    errors.push(`Dashboard clear failed: ${e.message}`);
    overallSuccess = false; // Dashboard is critical
  }
  Utilities.sleep(100); // Pause

  // --- Clear Mobile View ---
  try {
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.MOBILE_VIEW);
    if (sheet) {
      // Clear specific value cells B3, B4, B7-B10, A14-B18
      sheet.getRangeList(["B3","B4","B7","B8","B9","B10","A14:B18"]).clearContent();
      Logger.log(`Cleared Mobile View sheet.`);
    } else {
       Logger.log(`Mobile View sheet not found during clear.`);
    }
  } catch (e) {
    Logger.log(`Error clearing Mobile View: ${e}`);
    errors.push(`Mobile View clear failed: ${e.message}`);
    // Continue even if mobile view clear fails
  }
   Utilities.sleep(100); // Pause

  // --- Clear Weekly Sheets ---
  try {
    const sheets = ss.getSheets();
    const weekPrefix = CONFIG.SHEET_NAMES.WEEK_PREFIX;
    sheets.forEach(sheet => {
      const sheetName = sheet.getName();
      if (sheetName.startsWith(weekPrefix)) {
        try {
          const lastRow = sheet.getLastRow();
          if (lastRow >= 10) {
            sheet.getRange(10, 1, lastRow - 9, 5).clearContent(); // Clear A10:E<LastRow>
          }
          // Reset summary values
          sheet.getRange("B3:B7").setValue(0);
          sheet.getRange("B6").setValue("None");
          sheet.getRange("H2:H5").setValue(0); // Categories
          sheet.getRange("H8:H14").setValue(0); // Daily breakdown
          // Remove charts
          sheet.getCharts().forEach(chart => sheet.removeChart(chart));
          Logger.log(`Cleared weekly sheet: "${sheetName}"`);
           Utilities.sleep(50); // Small pause per sheet
        } catch (eSheet) {
           Logger.log(`Error clearing weekly sheet "${sheetName}": ${eSheet}`);
           errors.push(`Weekly sheet "${sheetName}" clear failed: ${eSheet.message}`);
           // Continue to next sheet, but mark overall as potentially failed
           overallSuccess = false;
        }
      }
    });
  } catch (e) {
     Logger.log(`Error iterating through sheets for clearing: ${e}`);
     errors.push(`Sheet iteration failed: ${e.message}`);
     overallSuccess = false;
  }

  if (errors.length > 0) {
     Logger.log(`Sheet clearing finished with ${errors.length} errors.`);
  } else {
     Logger.log("Sheet clearing process completed successfully.");
  }
  return overallSuccess;
}


// --- Helper Functions ---

/** Calculates ISO 8601 week number */
function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/** Gets the start date (Sunday) of the week for a given date */
function getWeekStartDate(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // Sunday is day 0
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Gets the end date (Saturday) of the week for a given date */
function getWeekEndDate(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + (6 - d.getDay())); // Saturday is day 6
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Formats a date object as YYYY-MM-DD string using script's timezone */
function formatDateYMD(date) {
  if (!(date instanceof Date)) return ""; // Handle invalid input
  return Utilities.formatDate(date, Session.getScriptTimeZone(), CONFIG.DATE_FORMAT_YMD);
}

/** Creates the standard name for a weekly sheet based on its start date */
function getWeekSheetName(date) {
  const startDate = getWeekStartDate(date);
  // Using MM-dd-yyyy format for the name
  const formattedStartDate = Utilities.formatDate(startDate, Session.getScriptTimeZone(), "MM-dd-yyyy");
  return `${CONFIG.SHEET_NAMES.WEEK_PREFIX}${formattedStartDate}`;
}
