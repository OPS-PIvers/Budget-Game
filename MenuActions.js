// MenuActions.gs
/**
 * Wrapper functions called directly by the custom menu items.
 * These provide user feedback via UI alerts or toasts.
 */

// --- Digest Sending Wrappers ---

function forceSendDailyDigestMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.showSidebar(HtmlService.createHtmlOutput('<p>Sending Daily Digest...</p>').setTitle('Sending...')); // Show progress
    // sendDailyDigest is in EmailService.gs
    const success = sendDailyDigest();
    SpreadsheetApp.getActiveSpreadsheet().toast(success ? 'Daily Digest sent successfully.' : 'Failed to send Daily Digest. Check Logs.', 'Daily Digest', 5);
  } catch (e) {
    Logger.log(`Error sending daily digest from menu: ${e}`);
    ui.alert(`Error sending Daily Digest: ${e.message}`);
  } finally {
     // How to close sidebar? Typically done client-side. For now, it stays open.
  }
}

function forceSendWeeklyDigestMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.showSidebar(HtmlService.createHtmlOutput('<p>Sending Weekly Digest...</p>').setTitle('Sending...')); // Show progress
    // sendWeeklyDigestEmail is in EmailService.gs
    const success = sendWeeklyDigestEmail();
    SpreadsheetApp.getActiveSpreadsheet().toast(success ? 'Weekly Digest sent successfully.' : 'Failed to send Weekly Digest. Check Logs.', 'Weekly Digest', 5);
  } catch (e) {
    Logger.log(`Error sending weekly digest from menu: ${e}`);
    ui.alert(`Error sending Weekly Digest: ${e.message}`);
  } finally {
     // Close sidebar?
  }
}


// --- Setup Wrappers ---

function setupDashboardMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    // setupDashboard is in SheetSetup.gs
    setupDashboard();
    ui.alert('Dashboard sheet setup complete.');
  } catch (e) {
    Logger.log(`Error setting up dashboard from menu: ${e}`);
    ui.alert(`Error setting up Dashboard: ${e.message}`);
  }
}

function setupPointsReferenceMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    // setupPointsReferenceSheet is in SheetSetup.gs
    setupPointsReferenceSheet();
    ui.alert('Points Reference sheet setup complete.');
  } catch (e) {
    Logger.log(`Error setting up points reference from menu: ${e}`);
    ui.alert(`Error setting up Points Reference: ${e.message}`);
  }
}

function setupHouseholdsMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    // setupHouseholdsSheet is in SheetSetup.gs
    setupHouseholdsSheet();
    ui.alert('Households sheet setup complete.');
  } catch (e) {
    Logger.log(`Error setting up households from menu: ${e}`);
    ui.alert(`Error setting up Households: ${e.message}`);
  }
}

function setupGoalsMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    // setupGoalsSheet is in SheetSetup.gs
    setupGoalsSheet();
    ui.alert('Goals sheet setup complete.');
  } catch (e) {
    Logger.log(`Error setting up goals from menu: ${e}`);
    ui.alert(`Error setting up Goals: ${e.message}`);
  }
}

function setupExpenseTrackerMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    // setupExpenseTrackerSheet is in SheetSetup.gs
    setupExpenseTrackerSheet();
    ui.alert('Expense Tracker sheet setup complete.');
  } catch (e) {
    Logger.log(`Error setting up expense tracker from menu: ${e}`);
    ui.alert(`Error setting up Expense Tracker: ${e.message}`);
  }
}

function setupBudgetCategoriesMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    // setupBudgetCategoriesSheet is in SheetSetup.gs
    setupBudgetCategoriesSheet();
    ui.alert('Budget Categories sheet setup complete.');
  } catch (e) {
    Logger.log(`Error setting up budget categories from menu: ${e}`);
    ui.alert(`Error setting up Budget Categories: ${e.message}`);
  }
}

function setupLocationMappingMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    // setupLocationMappingSheet is in SheetSetup.gs
    setupLocationMappingSheet();
    ui.alert('Location Mapping sheet setup complete.');
  } catch (e) {
    Logger.log(`Error setting up location mapping from menu: ${e}`);
    ui.alert(`Error setting up Location Mapping: ${e.message}`);
  }
}

function setupAllExpenseSheetsMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    setupExpenseTrackerSheet();
    setupBudgetCategoriesSheet();
    setupLocationMappingSheet();
    ui.alert('All expense tracking sheets setup complete.');
  } catch (e) {
    Logger.log(`Error setting up all expense sheets from menu: ${e}`);
    ui.alert(`Error setting up expense sheets: ${e.message}`);
  }
}


// --- Maintenance Wrappers ---

function cleanupLegacyCacheMenu() {
  const ui = SpreadsheetApp.getUi();
  if (!isCurrentUserAdmin()) {
    ui.alert('You must be an admin to perform this action.');
    return;
  }
  const response = ui.prompt(
    'Confirm Legacy Cache Cleanup',
    'This will remove old, generic cache keys. This is a one-time operation. Type "CLEANUP" to confirm.',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() == ui.Button.OK && response.getResponseText() == 'CLEANUP') {
    try {
      const result = cleanupLegacyCacheKeys();
      if (result.success) {
        ui.alert('Success', result.message, ui.ButtonSet.OK);
      } else {
        ui.alert('Error', result.message, ui.ButtonSet.OK);
      }
    } catch (e) {
      Logger.log(`Error cleaning up legacy cache from menu: ${e}`);
      ui.alert(`An error occurred: ${e.message}`);
    }
  } else {
    ui.alert('Cleanup cancelled.');
  }
}

function setupAllTriggersMenu() {
    const ui = SpreadsheetApp.getUi();
    try {
        // setupAllTriggers is in Triggers.gs
        setupAllTriggers();
        // UI feedback is handled within the function
    } catch (e) {
        Logger.log(`Error setting up triggers from menu: ${e}`);
        ui.alert(`Error setting up triggers: ${e.message}`);
    }
}

// --- Debugging Wrappers ---
function debugStreakCalculationMenu() {
     const ui = SpreadsheetApp.getUi();
     try {
        Logger.log("--- Manual Streak Debug Triggered via Menu ---");
        // debugStreakCalculation is in Bonuses.gs
        debugStreakCalculation();
        ui.alert("Streak calculation debug finished. Check the script logs (View > Logs) for details.");
     } catch (e) {
        Logger.log(`Error running streak debug from menu: ${e}`);
        ui.alert(`Error during streak debug: ${e.message}`);
     }
}