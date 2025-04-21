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


// --- Maintenance Wrappers ---
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