// Triggers.gs
/**
 * Functions for setting up and managing script triggers for Budget Game v3 (Streamlined).
 */

// Removed obsolete function setupPointsReferenceEditTrigger()

/**
 * Sets up ALL required triggers for the Budget Game.
 * Deletes only triggers related to this script before creating them.
 * Uses CONFIG for handler names and settings.
 */
function setupAllTriggers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const currentTriggers = ScriptApp.getProjectTriggers();
  // Define only the handlers for USED triggers
  const expectedHandlers = [
      CONFIG.TRIGGERS.DAILY_DIGEST,
      CONFIG.TRIGGERS.WEEKLY_DIGEST,
      CONFIG.TRIGGERS.POINTS_EDIT,
      // CONFIG.TRIGGERS.FORM_SUBMIT, // Obsolete - Removed
      // CONFIG.TRIGGERS.RESPONSES_EDIT // Obsolete - Removed
  ];

  Logger.log("Setting up all required triggers...");
  let triggersDeletedCount = 0;
  let triggersCreatedCount = 0;
  let triggerErrors = [];

  // Delete existing triggers managed by this script
  currentTriggers.forEach(trigger => {
    const handler = trigger.getHandlerFunction();
    // Check if the handler belongs to our list of expected handlers OR if it's one of the now-obsolete handlers we want to clean up
    const obsoleteHandlers = ['handleFormSubmit', 'handleFormResponsesEdit']; // Explicitly list obsolete handlers by name
    if (expectedHandlers.includes(handler) || obsoleteHandlers.includes(handler)) {
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
  if (triggersDeletedCount > 0) Logger.log(`Deleted ${triggersDeletedCount} existing script triggers (including potentially obsolete ones).`);

  // --- Create New Triggers ---

  // 1. Daily Digest (Evening)
  try {
    ScriptApp.newTrigger(CONFIG.TRIGGERS.DAILY_DIGEST)
      .timeBased().atHour(CONFIG.DAILY_DIGEST_HOUR).everyDays(1).create();
     Logger.log(`Created trigger: ${CONFIG.TRIGGERS.DAILY_DIGEST} (Hour ${CONFIG.DAILY_DIGEST_HOUR})`);
     triggersCreatedCount++;
  } catch (e) { Logger.log(`FAIL ${CONFIG.TRIGGERS.DAILY_DIGEST}: ${e}`); triggerErrors.push(`Create ${CONFIG.TRIGGERS.DAILY_DIGEST}: ${e.message}`); }

  // 2. Weekly Digest
  try {
      ScriptApp.newTrigger(CONFIG.TRIGGERS.WEEKLY_DIGEST)
        .timeBased().onWeekDay(CONFIG.WEEKLY_DIGEST_DAY).atHour(CONFIG.WEEKLY_DIGEST_HOUR).create();
       Logger.log(`Created trigger: ${CONFIG.TRIGGERS.WEEKLY_DIGEST} (Day ${CONFIG.WEEKLY_DIGEST_DAY}, Hour ${CONFIG.WEEKLY_DIGEST_HOUR})`);
       triggersCreatedCount++;
  } catch (e) { Logger.log(`FAIL ${CONFIG.TRIGGERS.WEEKLY_DIGEST}: ${e}`); triggerErrors.push(`Create ${CONFIG.TRIGGERS.WEEKLY_DIGEST}: ${e.message}`); }


  // 4. Points Reference Edit
  try {
     ScriptApp.newTrigger(CONFIG.TRIGGERS.POINTS_EDIT)
      .forSpreadsheet(ss).onEdit().create();
     Logger.log(`Created trigger: ${CONFIG.TRIGGERS.POINTS_EDIT} (onEdit)`);
     triggersCreatedCount++;
  } catch (e) { Logger.log(`FAIL ${CONFIG.TRIGGERS.POINTS_EDIT}: ${e}`); triggerErrors.push(`Create ${CONFIG.TRIGGERS.POINTS_EDIT}: ${e.message}`); }


  // --- Report Results ---
  let message = `Trigger Setup Complete.\nCreated: ${triggersCreatedCount} triggers.`;
  // if (!formLinked) message += "\nWarning: Form submit trigger not created (CONFIG.FORM_URL missing?)."; // Obsolete check
  if (triggerErrors.length > 0) {
     message += `\n\nERRORS ENCOUNTERED:\n- ${triggerErrors.join('\n- ')}`;
     Logger.log(`Trigger setup finished with ${triggerErrors.length} errors.`);
     SpreadsheetApp.getUi().alert(message); // Show errors prominently
  } else {
     Logger.log("Trigger setup finished successfully.");
     SpreadsheetApp.getActiveSpreadsheet().toast('All required triggers have been set up/updated!', 'Success', 7);
  }
}