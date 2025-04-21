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
    sheet.getRange(2, 1, lastRow - 1, 3).sort([{column: 3, ascending: true}, {column: 1, ascending: true}]);
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
    ["Weekly budget review/planning session", 3, C.FIN],["Review one subscription for necessity", 1, C.FIN],["Cancel an unused subscription", 3, C.FIN],
    ["Spend zero money in a day", 2, C.FIN],
    ["Home made dinner", 1, C.MEAL],
    ["Eat leftovers", 3, C.MEAL],
    ["Pack lunch for work/school", 1, C.MEAL],
    ["Get up with alarm (no snooze)", 1, C.DISC],
    ["Lights out by 10pm", 1, C.DISC],
    ["Walk the dog", 1, C.DISC],
    ["Dedicated study/work block (e.g., Grad School)", 2, C.DISC],
    ["Eat vegetables with dinner", 1, C.HLTH],
    ["Get 7+ hours of sleep", 2, C.HLTH],
    ["Drink water instead of sugary drinks all day", 1, C.HLTH],
    ["Take a stretch break during work", 1, C.HLTH],
    ["Cook with olive oil instead of butter", 1, C.HLTH],["Have a meat-free day", 1, C.HLTH],
    ["Exercise for 30 minutes", 3, C.HLTH],
    ["Clean bathroom", 2, C.HSHD],
    ["Clean glass shower door", 1, C.HSHD],
    ["Vacuum downstairs", 1, C.HSHD],
    ["Windex all windows", 2, C.HSHD],
    ["Dust all surfaces", 1, C.HSHD],
    ["Clean out refrigerator", 1, C.HSHD],
    ["Declutter one area", 2, C.HSHD],
    ["Laundry folded and put away", 1, C.HSHD],
    ["Clean kitchen thoroughly", 2, C.HSHD],
    ["Order food for delivery", -10, C.NEG],
    ["Go out to dinner", -5, C.NEG],
    ["Fast casual or donuts", -2, C.NEG],
    ["Trip to grocery store", -1, C.NEG],
    ["Grocery delivery", -2, C.NEG],
    ["Order from Target or Amazon", -2, C.NEG],
    ["Go into Target (non-essential trip)", -3, C.NEG],["Starbucks/coffee/fast snack", -1, C.NEG],
    ["Impulse buy (any size)", -2, C.NEG],
    ["Unnecessary Spending (Small)", -1, C.NEG],
    ["Unnecessary Spending (Medium)", -2, C.NEG],
    ["Unnecessary Spending (Large)", -3, C.NEG],
    ["Lights out after 10:30pm", -1, C.NEG],
    ["1 week without eating out", 10, C.ACH],
    ["Meet savings goal for the month", 10, C.ACH],
    ["Complete a no-spend weekend", 5, C.ACH],
    ["Paid off a debt early", 15, C.ACH]
 ];
 const validDefaultActivities = defaultActivities.filter(act => CONFIG.CATEGORIES.includes(act[2])); // Still validate against original CONFIG list for adding defaults
 if (validDefaultActivities.length > 0) { sheet.getRange(2, 1, validDefaultActivities.length, 3).setValues(validDefaultActivities); Logger.log(`Added ${validDefaultActivities.length} default activities.`); }
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