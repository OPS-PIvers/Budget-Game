// Code.gs (Refactored - Main Entry Points & Event Handlers)
/**
 * Budget Game Apps Script - v3 (Streamlined)
 * Main script file containing core event handlers and menu setup.
 */

/**
 * Creates the main custom menu when the spreadsheet opens.
 * Reads configuration from CONFIG object.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu(CONFIG.MENU_NAME)
    // Daily operations
    .addItem('Send Daily Digest', 'forceSendDailyDigestMenu') // Wrapper in MenuActions.gs
    .addItem('Send Weekly Digest', 'forceSendWeeklyDigestMenu') // Wrapper in MenuActions.gs

    // Setup & Maintenance section
    .addSeparator()
    .addSubMenu(ui.createMenu('Setup & Maintenance')
      .addItem('Setup Dashboard Sheet', 'setupDashboardMenu') // Wrapper
      .addItem('Setup Points Reference Sheet', 'setupPointsReferenceMenu') // Wrapper
      .addItem('Setup Households Sheet', 'setupHouseholdsMenu') // Wrapper
      // .addItem('Update Form From Points Reference', 'updateFormMenu') // Obsolete - Removed
      .addItem('Rebuild Dashboard From Form Responses', 'rebuildDashboardMenu') // Wrapper - CAUTION: Check if this logic is still valid/needed without a Form Responses sheet being the primary input
      .addItem('Setup/Update All Triggers', 'setupAllTriggersMenu') // Wrapper
      .addItem('Debug: Calculate Streaks', 'debugStreakCalculationMenu') // Wrapper
      )
    .addToUi();
}

/**
 * Handles edits made directly to the Points Reference sheet.
 * Clears activity data cache after a short delay if a row seems complete.
 * NOTE: No longer updates Google Form.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e The edit event object.
 */
function handlePointsReferenceEdit(e) {
  try {
    const sheet = e.source.getActiveSheet();
    const sheetName = sheet.getName();
    const pointsRefSheetName = CONFIG.SHEET_NAMES.POINTS_REFERENCE;

    if (sheetName === pointsRefSheetName) {
      const range = e.range;
      const row = range.getRow();

      // Ignore header row edits
      if (row === 1) return;

      // Check if the edited row seems complete (basic check)
      // Columns: A=Activity, B=Points, C=Category
      const activityRange = sheet.getRange(row, 1, 1, 3);
      const values = activityRange.getValues()[0];
      const hasActivity = values[0] && String(values[0]).trim() !== "";
      const hasPoints = values[1] !== "" && !isNaN(values[1]);
      const hasCategory = values[2] && String(values[2]).trim() !== "" && CONFIG.CATEGORIES.includes(String(values[2]).trim());

      if (hasActivity && hasPoints && hasCategory) {
        Logger.log(`Complete row edit detected in ${pointsRefSheetName} at row ${row}. Scheduling cache clear.`);
        // Add a delay to allow for multiple quick edits before clearing cache
        Utilities.sleep(CONFIG.POINTS_EDIT_DELAY_MS);

        // Clear the cache because Points Reference data has changed
        // resetActivityDataCache is now defined in DataProcessing.gs
        resetActivityDataCache();
        Logger.log("Cleared activity data cache due to Points Reference edit.");

        // Obsolete - Removed call to updateFormFromSheet();

      } else {
         Logger.log(`Incomplete edit detected in ${pointsRefSheetName} at row ${row}. Cache not cleared yet.`);
      }
    }
  } catch (err) {
     Logger.log(`ERROR in handlePointsReferenceEdit: ${err}\nStack: ${err.stack}`);
     // Optional: Notify user of error?
     // SpreadsheetApp.getActiveSpreadsheet().toast(`Error handling points edit: ${err.message}`, "Error", 5);
  }
}