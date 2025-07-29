// SheetSetup.gs
/**
 * Functions for creating and setting up required Google Sheets for Budget Game v3 (Streamlined)
 */

// --- Function setupDashboard remains the same ---
/**
 * Sets up the Dashboard sheet with correct headers and basic formatting for columns A-F and Email.
 * Creates the sheet if it doesn't exist.
 * @return {Sheet} The Dashboard sheet object.
 */
function setupDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = CONFIG.SHEET_NAMES.DASHBOARD;
  let dashboardSheet = ss.getSheetByName(sheetName);

  if (!dashboardSheet) {
    dashboardSheet = ss.insertSheet(sheetName);
    Logger.log(`Created new ${sheetName} sheet.`);
  } else {
    // Optional: Clear existing content if resetting? For now, just ensure headers are right.
    // dashboardSheet.clearContents(); // Uncomment to fully reset on setup
  }

  // Define essential headers
  const headers = [["Date", "Points", "Activities", "Positive Count", "Negative Count", "Week Number", "Email"]];
  // Ensure there are enough columns, add if necessary
  if (dashboardSheet.getMaxColumns() < headers[0].length) {
      dashboardSheet.insertColumnsAfter(dashboardSheet.getMaxColumns(), headers[0].length - dashboardSheet.getMaxColumns());
  }
  // Ensure row 1 exists (might be empty sheet)
  if (dashboardSheet.getMaxRows() < 1) dashboardSheet.insertRowAfter(0);
  dashboardSheet.getRange(1, 1, 1, headers[0].length).setValues(headers)
    .setFontWeight("bold")
    .setBackground(CONFIG.COLORS.HEADER_BG)
    .setFontColor(CONFIG.COLORS.HEADER_FG);

  // Apply formatting and widths to essential columns
  dashboardSheet.setColumnWidth(1, 100); // Date
  dashboardSheet.getRange("A:A").setNumberFormat(CONFIG.DATE_FORMAT_SHORT);

  dashboardSheet.setColumnWidth(2, 70);  // Points
  dashboardSheet.getRange("B:B").setNumberFormat(CONFIG.POINTS_FORMAT);

  dashboardSheet.setColumnWidth(3, 400); // Activities (String)

  dashboardSheet.setColumnWidth(4, 100); // Positive Count
  dashboardSheet.setColumnWidth(5, 100); // Negative Count

  dashboardSheet.setColumnWidth(6, 100); // Week Number

  dashboardSheet.setColumnWidth(7, 200); // Email

  // --- Conditional Formatting for Points Column (B2:B) ---
  // Ensure sheet has more than 1 row before applying range rule
  if (dashboardSheet.getMaxRows() > 1) {
     const pointsRange = dashboardSheet.getRange("B2:B"); // Apply to whole column below header
     let rules = dashboardSheet.getConditionalFormatRules();
     // Remove existing rules for this range to avoid duplicates
     rules = rules.filter(rule => rule.getRanges().every(range => range.getA1Notation() !== pointsRange.getA1Notation()));

     const positiveRule = SpreadsheetApp.newConditionalFormatRule()
       .whenNumberGreaterThan(0)
       .setBackground(CONFIG.COLORS.POSITIVE_BG)
       .setRanges([pointsRange])
       .build();
     const negativeRule = SpreadsheetApp.newConditionalFormatRule()
       .whenNumberLessThan(0)
       .setBackground(CONFIG.COLORS.NEGATIVE_BG)
       .setRanges([pointsRange])
       .build();

     rules.push(positiveRule, negativeRule);
     dashboardSheet.setConditionalFormatRules(rules);
  }

  // Remove potentially leftover columns from old setup
  if (dashboardSheet.getMaxColumns() > headers[0].length) {
     dashboardSheet.deleteColumns(headers[0].length + 1, dashboardSheet.getMaxColumns() - headers[0].length);
  }

  Logger.log(`${sheetName} sheet setup/verified.`);
  return dashboardSheet;
}


/**
 * Sets up the Points Reference sheet with headers, validation, formatting.
 * Creates the sheet and adds default activities if it doesn't exist.
 * Uses dynamic category list for validation.
 * @return {Sheet} The Points Reference sheet object.
 */
function setupPointsReferenceSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = CONFIG.SHEET_NAMES.POINTS_REFERENCE;
  let sheet = ss.getSheetByName(sheetName);
  let createdNew = false;

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    createdNew = true;

    // Headers
    if (sheet.getMaxRows() < 1) sheet.insertRowAfter(0); // Ensure row 1 exists
    sheet.getRange("A1:D1").setValues([["Activity", "Points", "Category", "Required"]])
      .setFontWeight("bold")
      .setBackground(CONFIG.COLORS.HEADER_BG)
      .setFontColor(CONFIG.COLORS.HEADER_FG);

    // Column Widths
    sheet.setColumnWidth(1, 250); // Activity
    sheet.setColumnWidth(2, 80);  // Points
    sheet.setColumnWidth(3, 150); // Category
    sheet.setColumnWidth(4, 100); // Required

    // Add Default Activities (only if sheet is brand new)
    addDefaultActivities(sheet); // Pass the sheet object
  }

  // --- Apply formatting and validation regardless of whether sheet was new ---

  // --- Data Validation for Category Column (C2:C) ---
  // Get the CURRENT category order/list
  const currentCategories = getCurrentCategoryOrder(); // From Utilities.gs

  // Ensure sheet has more than 1 row before applying range rule
  if (sheet.getMaxRows() > 1 && currentCategories.length > 0) {
      const categoryRange = sheet.getRange(2, 3, sheet.getMaxRows() - 1, 1); // Apply to all rows C2:C
      const categoryRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(currentCategories, true) // Use DYNAMIC list
        .setAllowInvalid(false) // Disallow other values
        .setHelpText(`Select a category from the list: ${currentCategories.join(', ')}. (Manage list in Admin Panel)`)
        .build();
      categoryRange.setDataValidation(categoryRule);
  } else if (currentCategories.length === 0) {
      Logger.log("Skipping category validation setup: No categories found/configured.");
  }
  // --- End Data Validation ---


  // Number Formatting for Points Column (B2:B)
  if (sheet.getMaxRows() > 1) {
      sheet.getRange(2, 2, sheet.getMaxRows() - 1, 1).setNumberFormat(CONFIG.POINTS_FORMAT); // Apply B2:B
  }

  // Conditional Formatting for Points Column (B2:B)
  if (sheet.getMaxRows() > 1) {
      const pointsRange = sheet.getRange("B2:B"); // Apply to whole column below header
      let rules = sheet.getConditionalFormatRules();
      // Remove existing rules specific to this range to avoid duplicates
      rules = rules.filter(rule => rule.getRanges().every(range => range.getA1Notation() !== pointsRange.getA1Notation()));

      const positiveRule = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThan(0)
        .setBackground(CONFIG.COLORS.POSITIVE_BG)
        .setRanges([pointsRange])
        .build();
      const negativeRule = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberLessThan(0)
        .setBackground(CONFIG.COLORS.NEGATIVE_BG)
        .setRanges([pointsRange])
        .build();

      rules.push(positiveRule, negativeRule);
      sheet.setConditionalFormatRules(rules);
  }

  // Sort Data by Category, then Activity (if more than one data row exists)
  const lastRow = sheet.getLastRow();
  if (lastRow > 2) { // Check if there are at least 2 data rows
    // Only sort the actual data range, not the whole sheet
    sheet.getRange(2, 1, lastRow - 1, 4).sort([{column: 3, ascending: true}, {column: 1, ascending: true}]);
  }

  if (createdNew) {
     Logger.log(`Points Reference sheet created and set up.`);
  } else {
     Logger.log(`Points Reference sheet validation and formatting updated.`);
  }
  return sheet;
}


/**
 * Adds a predefined list of default activities to the Points Reference sheet.
 * Uses categories defined in CONFIG initially. Note: If categories are added/removed later,
 * these defaults might use categories not currently in the dynamic list, but sheet validation
 * will use the dynamic list.
 * @param {Sheet} sheet The Points Reference sheet object.
 */
function addDefaultActivities(sheet) {
 // ... (function remains the same - it uses CONFIG for initial defaults, which is okay) ...
 if (!sheet) { Logger.log("Sheet object not provided to addDefaultActivities."); return; }
 if (sheet.getLastRow() > 1) { Logger.log("Default activities not added because Points Reference sheet already contains data."); return; }
 const C = {}; CONFIG.CATEGORIES.forEach(cat => { const alias = cat.split(' ')[0].substring(0, 4).toUpperCase(); C[alias] = cat; });
 C.FIN = C.FINA || "Financial Planning"; C.MEAL = C.MEAL || "Meal Planning"; C.DISC = C.SELF || "Self-Discipline"; C.HLTH = C.HEAL || "Health"; C.HSHD = C.HOUS || "Household"; C.NEG = C.NEGA || "Negative"; C.ACH = C.ACHI || "Achievement";
 const defaultActivities = [ /* ... list of default activities ... */
    ["Weekly budget review/planning session", 3, C.FIN, false],["Review one subscription for necessity", 1, C.FIN, false],["Cancel an unused subscription", 3, C.FIN, false],
    ["Spend zero money in a day", 2, C.FIN, false],
    ["Home made dinner", 1, C.MEAL, false],
    ["Eat leftovers", 3, C.MEAL, false],
    ["Pack lunch for work/school", 1, C.MEAL, false],
    ["Get up with alarm (no snooze)", 1, C.DISC, false],
    ["Lights out by 10pm", 1, C.DISC, false],
    ["Walk the dog", 1, C.DISC, false],
    ["Dedicated study/work block (e.g., Grad School)", 2, C.DISC, false],
    ["Eat vegetables with dinner", 1, C.HLTH, false],
    ["Get 7+ hours of sleep", 2, C.HLTH, false],
    ["Drink water instead of sugary drinks all day", 1, C.HLTH, false],
    ["Take a stretch break during work", 1, C.HLTH, false],
    ["Cook with olive oil instead of butter", 1, C.HLTH, false],["Have a meat-free day", 1, C.HLTH, false],
    ["Exercise for 30 minutes", 3, C.HLTH, false],
    ["Clean bathroom", 2, C.HSHD, false],
    ["Clean glass shower door", 1, C.HSHD, false],
    ["Vacuum downstairs", 1, C.HSHD, false],
    ["Windex all windows", 2, C.HSHD, false],
    ["Dust all surfaces", 1, C.HSHD, false],
    ["Clean out refrigerator", 1, C.HSHD, false],
    ["Declutter one area", 2, C.HSHD, false],
    ["Laundry folded and put away", 1, C.HSHD, false],
    ["Clean kitchen thoroughly", 2, C.HSHD, false],
    ["Order food for delivery", -10, C.NEG, false],
    ["Go out to dinner", -5, C.NEG, false],
    ["Fast casual or donuts", -2, C.NEG, false],
    ["Trip to grocery store", -1, C.NEG, false],
    ["Grocery delivery", -2, C.NEG, false],
    ["Order from Target or Amazon", -2, C.NEG, false],
    ["Go into Target (non-essential trip)", -3, C.NEG, false],["Starbucks/coffee/fast snack", -1, C.NEG, false],
    ["Impulse buy (any size)", -2, C.NEG, false],
    ["Unnecessary Spending (Small)", -1, C.NEG, false],
    ["Unnecessary Spending (Medium)", -2, C.NEG, false],
    ["Unnecessary Spending (Large)", -3, C.NEG, false],
    ["Lights out after 10:30pm", -1, C.NEG, false],
    ["1 week without eating out", 10, C.ACH, false],
    ["Meet savings goal for the month", 10, C.ACH, false],
    ["Complete a no-spend weekend", 5, C.ACH, false],
    ["Paid off a debt early", 15, C.ACH, false]
 ];
 const validDefaultActivities = defaultActivities.filter(act => CONFIG.CATEGORIES.includes(act[2])); // Still validate against original CONFIG list for adding defaults
 if (validDefaultActivities.length > 0) { sheet.getRange(2, 1, validDefaultActivities.length, 4).setValues(validDefaultActivities); Logger.log(`Added ${validDefaultActivities.length} default activities.`); }
 else { Logger.log("No valid default activities to add (check category names in script vs CONFIG)."); }
}

// --- Function setupHouseholdsSheet remains the same ---
/**
 * Sets up the Households sheet with correct headers and formatting.
 * Creates the sheet if it doesn't exist.
 * @return {Sheet} The Households sheet object
 */
function setupHouseholdsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = CONFIG.SHEET_NAMES.HOUSEHOLDS; // Use config
  let sheet = ss.getSheetByName(sheetName);

  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (sheet.getMaxRows() < 1) sheet.insertRowAfter(0); // Ensure row 1 exists

    // Add headers
    const headers = [["HouseholdID", "HouseholdName", "UserEmail", "DateAdded"]];
    sheet.getRange("A1:D1").setValues(headers)
      .setFontWeight("bold")
      .setBackground(CONFIG.COLORS.HEADER_BG)
      .setFontColor(CONFIG.COLORS.HEADER_FG);

    // Set column widths
    sheet.setColumnWidth(1, 200); // HouseholdID
    sheet.setColumnWidth(2, 180); // HouseholdName
    sheet.setColumnWidth(3, 250); // UserEmail
    sheet.setColumnWidth(4, 150); // DateAdded

    Logger.log(`Created new ${sheetName} sheet.`);
  }

  // Apply formatting (even if sheet exists)
  // Ensure sheet has more than 1 row before applying range rule
  if (sheet.getMaxRows() > 1) {
      sheet.getRange("D2:D").setNumberFormat(CONFIG.DATE_FORMAT_SHORT); // Apply from row 2 down
  } else {
     Logger.log(`${sheetName} sheet exists but has no data rows yet. Formatting will apply later.`);
  }

  Logger.log(`${sheetName} sheet setup/verified.`);
  return sheet;
}

/**
 * Sets up the Goals sheet with correct headers and formatting.
 * Creates the sheet if it doesn't exist.
 * @return {Sheet} The Goals sheet object
 */
function setupGoalsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = CONFIG.SHEET_NAMES.GOALS;
  let sheet = ss.getSheetByName(sheetName);
  let createdNew = false;

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    createdNew = true;
    
    // Ensure row 1 exists
    if (sheet.getMaxRows() < 1) sheet.insertRowAfter(0);

    // Add headers
    const headers = [["GoalID", "GoalName", "GoalType", "TargetAmount", "CurrentAmount", "StartDate", "TargetDate", "Status", "HouseholdID", "LastUpdated"]];
    sheet.getRange("A1:J1").setValues(headers)
      .setFontWeight("bold")
      .setBackground(CONFIG.COLORS.HEADER_BG)
      .setFontColor(CONFIG.COLORS.HEADER_FG);

    // Set column widths
    sheet.setColumnWidth(1, 120); // GoalID
    sheet.setColumnWidth(2, 200); // GoalName
    sheet.setColumnWidth(3, 120); // GoalType
    sheet.setColumnWidth(4, 120); // TargetAmount
    sheet.setColumnWidth(5, 120); // CurrentAmount
    sheet.setColumnWidth(6, 120); // StartDate
    sheet.setColumnWidth(7, 120); // TargetDate
    sheet.setColumnWidth(8, 100); // Status
    sheet.setColumnWidth(9, 200); // HouseholdID
    sheet.setColumnWidth(10, 150); // LastUpdated

    Logger.log(`Created new ${sheetName} sheet.`);
  }

  // Apply formatting and validation (even if sheet exists)
  if (sheet.getMaxRows() > 1) {
    // Date formatting for date columns
    sheet.getRange("F2:F").setNumberFormat(CONFIG.DATE_FORMAT_SHORT); // StartDate
    sheet.getRange("G2:G").setNumberFormat(CONFIG.DATE_FORMAT_SHORT); // TargetDate
    sheet.getRange("J2:J").setNumberFormat(CONFIG.DATE_FORMAT_SHORT); // LastUpdated
    
    // Currency formatting for amount columns
    sheet.getRange("D2:D").setNumberFormat("$#,##0.00"); // TargetAmount
    sheet.getRange("E2:E").setNumberFormat("$#,##0.00"); // CurrentAmount

    // Data validation for GoalType column
    const goalTypeRange = sheet.getRange("C2:C");
    const goalTypeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(CONFIG.GOAL_TYPES, true)
      .setAllowInvalid(false)
      .setHelpText(`Select a goal type: ${CONFIG.GOAL_TYPES.join(', ')}`)
      .build();
    goalTypeRange.setDataValidation(goalTypeRule);

    // Data validation for Status column
    const statusRange = sheet.getRange("H2:H");
    const statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["active", "completed", "paused", "cancelled"], true)
      .setAllowInvalid(false)
      .setHelpText("Select status: active, completed, paused, or cancelled")
      .build();
    statusRange.setDataValidation(statusRule);
  }

  if (createdNew) {
    Logger.log(`Goals sheet created and set up.`);
  } else {
    Logger.log(`Goals sheet validation and formatting updated.`);
  }
  
  return sheet;
}

/**
 * Sets up the Expense Tracker sheet with correct headers and formatting.
 * Creates the sheet if it doesn't exist.
 * @return {Sheet} The Expense Tracker sheet object
 */
function setupExpenseTrackerSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = CONFIG.SHEET_NAMES.EXPENSE_TRACKER;
  let sheet = ss.getSheetByName(sheetName);
  let createdNew = false;

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    createdNew = true;
    
    // Ensure row 1 exists
    if (sheet.getMaxRows() < 1) sheet.insertRowAfter(0);

    // Add headers
    const headers = [["Date", "Amount", "Location", "Category", "Description", "Email", "HouseholdID", "PayPeriod"]];
    sheet.getRange("A1:H1").setValues(headers)
      .setFontWeight("bold")
      .setBackground(CONFIG.COLORS.HEADER_BG)
      .setFontColor(CONFIG.COLORS.HEADER_FG);

    // Set column widths
    sheet.setColumnWidth(1, 100); // Date
    sheet.setColumnWidth(2, 100); // Amount
    sheet.setColumnWidth(3, 200); // Location
    sheet.setColumnWidth(4, 150); // Category
    sheet.setColumnWidth(5, 250); // Description
    sheet.setColumnWidth(6, 200); // Email
    sheet.setColumnWidth(7, 200); // HouseholdID
    sheet.setColumnWidth(8, 120); // PayPeriod

    Logger.log(`Created new ${sheetName} sheet.`);
  }

  // Apply formatting (even if sheet exists)
  if (sheet.getMaxRows() > 1) {
    // Date formatting
    sheet.getRange("A2:A").setNumberFormat(CONFIG.DATE_FORMAT_SHORT);
    
    // Currency formatting for Amount
    sheet.getRange("B2:B").setNumberFormat("$#,##0.00");
    
    // Conditional formatting for amounts (red for expenses)
    const amountRange = sheet.getRange("B2:B");
    let rules = sheet.getConditionalFormatRules();
    rules = rules.filter(rule => rule.getRanges().every(range => range.getA1Notation() !== amountRange.getA1Notation()));

    const expenseRule = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0)
      .setBackground("#fce5cd") // Light orange for expenses
      .setRanges([amountRange])
      .build();

    rules.push(expenseRule);
    sheet.setConditionalFormatRules(rules);
  }

  if (createdNew) {
    Logger.log(`Expense Tracker sheet created and set up.`);
  } else {
    Logger.log(`Expense Tracker sheet validation and formatting updated.`);
  }
  
  return sheet;
}

/**
 * Sets up the Budget Categories sheet with correct headers and formatting.
 * Creates the sheet if it doesn't exist and adds default categories.
 * @return {Sheet} The Budget Categories sheet object
 */
function setupBudgetCategoriesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = CONFIG.SHEET_NAMES.BUDGET_CATEGORIES;
  let sheet = ss.getSheetByName(sheetName);
  let createdNew = false;

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    createdNew = true;
    
    // Ensure row 1 exists
    if (sheet.getMaxRows() < 1) sheet.insertRowAfter(0);

    // Add headers
    const headers = [["CategoryName", "MonthlyBudget", "CurrentSpent", "PayPeriodBudget", "PayPeriodSpent", "LastReset", "HouseholdID", "IsActive"]];
    sheet.getRange("A1:H1").setValues(headers)
      .setFontWeight("bold")
      .setBackground(CONFIG.COLORS.HEADER_BG)
      .setFontColor(CONFIG.COLORS.HEADER_FG);

    // Set column widths
    sheet.setColumnWidth(1, 150); // CategoryName
    sheet.setColumnWidth(2, 120); // MonthlyBudget
    sheet.setColumnWidth(3, 120); // CurrentSpent
    sheet.setColumnWidth(4, 120); // PayPeriodBudget
    sheet.setColumnWidth(5, 120); // PayPeriodSpent
    sheet.setColumnWidth(6, 120); // LastReset
    sheet.setColumnWidth(7, 200); // HouseholdID
    sheet.setColumnWidth(8, 80);  // IsActive

    // Add default budget categories
    addDefaultBudgetCategories(sheet);
    
    Logger.log(`Created new ${sheetName} sheet.`);
  }

  // Apply formatting (even if sheet exists)
  if (sheet.getMaxRows() > 1) {
    // Currency formatting for budget and spent columns
    sheet.getRange("B2:B").setNumberFormat("$#,##0.00"); // MonthlyBudget
    sheet.getRange("C2:C").setNumberFormat("$#,##0.00"); // CurrentSpent
    sheet.getRange("D2:D").setNumberFormat("$#,##0.00"); // PayPeriodBudget
    sheet.getRange("E2:E").setNumberFormat("$#,##0.00"); // PayPeriodSpent
    
    // Date formatting for LastReset
    sheet.getRange("F2:F").setNumberFormat(CONFIG.DATE_FORMAT_SHORT);
    
    // Data validation for IsActive column
    const activeRange = sheet.getRange("H2:H");
    const activeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList([true, false], true)
      .setAllowInvalid(false)
      .setHelpText("Select true or false")
      .build();
    activeRange.setDataValidation(activeRule);
  }

  if (createdNew) {
    Logger.log(`Budget Categories sheet created and set up.`);
  } else {
    Logger.log(`Budget Categories sheet validation and formatting updated.`);
  }
  
  return sheet;
}

/**
 * Adds default budget categories to the Budget Categories sheet.
 * @param {Sheet} sheet The Budget Categories sheet object.
 */
function addDefaultBudgetCategories(sheet) {
  if (!sheet) {
    Logger.log("Sheet object not provided to addDefaultBudgetCategories.");
    return;
  }
  
  if (sheet.getLastRow() > 1) {
    Logger.log("Default budget categories not added because Budget Categories sheet already contains data.");
    return;
  }
  
  const defaultCategories = CONFIG.EXPENSE_SETTINGS.DEFAULT_BUDGET_CATEGORIES.map(category => [
    category,     // CategoryName
    500,          // MonthlyBudget (default $500)
    0,            // CurrentSpent
    250,          // PayPeriodBudget (default $250)
    0,            // PayPeriodSpent
    new Date(),   // LastReset
    null,         // HouseholdID (will be set when households use it)
    true          // IsActive
  ]);
  
  if (defaultCategories.length > 0) {
    sheet.getRange(2, 1, defaultCategories.length, 8).setValues(defaultCategories);
    Logger.log(`Added ${defaultCategories.length} default budget categories.`);
  }
}

/**
 * Sets up the Location Mapping sheet with correct headers and formatting.
 * Creates the sheet if it doesn't exist.
 * @return {Sheet} The Location Mapping sheet object
 */
function setupLocationMappingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = CONFIG.SHEET_NAMES.LOCATION_MAPPING;
  let sheet = ss.getSheetByName(sheetName);
  let createdNew = false;

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    createdNew = true;
    
    // Ensure row 1 exists
    if (sheet.getMaxRows() < 1) sheet.insertRowAfter(0);

    // Add headers
    const headers = [["LocationName", "DefaultCategory", "UsageCount", "LastUsed", "HouseholdID", "IsActive"]];
    sheet.getRange("A1:F1").setValues(headers)
      .setFontWeight("bold")
      .setBackground(CONFIG.COLORS.HEADER_BG)
      .setFontColor(CONFIG.COLORS.HEADER_FG);

    // Set column widths
    sheet.setColumnWidth(1, 200); // LocationName
    sheet.setColumnWidth(2, 150); // DefaultCategory
    sheet.setColumnWidth(3, 100); // UsageCount
    sheet.setColumnWidth(4, 120); // LastUsed
    sheet.setColumnWidth(5, 200); // HouseholdID
    sheet.setColumnWidth(6, 80);  // IsActive

    // Add some common location mappings
    addDefaultLocationMappings(sheet);
    
    Logger.log(`Created new ${sheetName} sheet.`);
  }

  // Apply formatting (even if sheet exists)
  if (sheet.getMaxRows() > 1) {
    // Date formatting for LastUsed
    sheet.getRange("D2:D").setNumberFormat(CONFIG.DATE_FORMAT_SHORT);
    
    // Number formatting for UsageCount
    sheet.getRange("C2:C").setNumberFormat("0");
    
    // Data validation for IsActive column
    const activeRange = sheet.getRange("F2:F");
    const activeRule = SpreadsheetApp.newDataValidation()
      .requireValueInList([true, false], true)
      .setAllowInvalid(false)
      .setHelpText("Select true or false")
      .build();
    activeRange.setDataValidation(activeRule);
  }

  if (createdNew) {
    Logger.log(`Location Mapping sheet created and set up.`);
  } else {
    Logger.log(`Location Mapping sheet validation and formatting updated.`);
  }
  
  return sheet;
}

/**
 * Adds default location mappings to the Location Mapping sheet.
 * @param {Sheet} sheet The Location Mapping sheet object.
 */
function addDefaultLocationMappings(sheet) {
  if (!sheet) {
    Logger.log("Sheet object not provided to addDefaultLocationMappings.");
    return;
  }
  
  if (sheet.getLastRow() > 1) {
    Logger.log("Default location mappings not added because Location Mapping sheet already contains data.");
    return;
  }
  
  // Common store-to-category mappings
  const defaultMappings = [
    ["Kroger", "Groceries", 0, null, null, true],
    ["Publix", "Groceries", 0, null, null, true],
    ["Walmart", "Shopping", 0, null, null, true],
    ["Target", "Shopping", 0, null, null, true],
    ["Amazon", "Shopping", 0, null, null, true],
    ["Shell", "Gas", 0, null, null, true],
    ["BP", "Gas", 0, null, null, true],
    ["Exxon", "Gas", 0, null, null, true],
    ["McDonald's", "Dining", 0, null, null, true],
    ["Starbucks", "Dining", 0, null, null, true],
    ["Netflix", "Entertainment", 0, null, null, true],
    ["Spotify", "Entertainment", 0, null, null, true]
  ];
  
  if (defaultMappings.length > 0) {
    sheet.getRange(2, 1, defaultMappings.length, 6).setValues(defaultMappings);
    Logger.log(`Added ${defaultMappings.length} default location mappings.`);
  }
}