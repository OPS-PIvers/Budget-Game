/**
 * Helper Functions for Budget Game Menu Items v3
 * Provides simple wrappers for more complex operations triggered via the UI.
 */

/**
 * Menu Item Wrapper: Generates suggested weekly goals and saves them to the sheet.
 * Calls setup/generation/saving functions from GoalSetting.gs.
 */
function generateAndSaveWeeklyGoals() {
  const ui = SpreadsheetApp.getUi();
  try {
    Logger.log("Manual Trigger: generateAndSaveWeeklyGoals");

    // Ensure the goal sheet exists or is created first
    // Use the setup function from GoalSetting.gs which handles creation/validation
    if (typeof setupWeeklyGoalsSheet !== "function") {
        ui.alert("Error: Required function 'setupWeeklyGoalsSheet' not found.");
        return;
    }
    const goalSheet = setupWeeklyGoalsSheet(); // Ensure sheet is ready
    if (!goalSheet) {
       ui.alert("Failed to set up the Weekly Goals sheet. Cannot save goals.");
       return;
    }

    // Generate the goals using the function from GoalSetting.gs
    if (typeof generateWeeklyGoals !== "function") {
        ui.alert("Error: Required function 'generateWeeklyGoals' not found.");
        return;
    }
    const newGoals = generateWeeklyGoals();

    // Save the generated goals using the function from GoalSetting.gs
    if (newGoals && newGoals.length > 0) {
       if (typeof saveWeeklyGoals !== "function") {
           ui.alert("Error: Required function 'saveWeeklyGoals' not found.");
           return;
       }
      saveWeeklyGoals(newGoals);
      ui.alert(`Generated and saved ${newGoals.length} new weekly goals for the current week!`);
      Logger.log("Successfully generated and saved weekly goals via menu item.");
    } else {
      ui.alert('Could not generate weekly goals. Check logs or ensure enough historical data from the previous week exists.');
      Logger.log("Goal generation returned no goals via menu item.");
    }
  } catch (e) {
     Logger.log(`Error in generateAndSaveWeeklyGoals (Menu Wrapper): ${e}\nStack: ${e.stack}`);
     ui.alert(`An error occurred while generating goals: ${e.message}`);
  }
}


/**
 * Menu Item Wrapper: Displays calculated weekly bonuses for the *previous* week in an alert.
 * Calls calculation functions from Bonuses.gs.
 */
function displayWeeklyBonuses() {
  const ui = SpreadsheetApp.getUi();
  try {
    Logger.log("Manual Trigger: displayWeeklyBonuses");

    // Ensure calculation functions exist before calling
    if (typeof calculateWeeklyThresholdBonuses !== "function") {
       ui.alert("Error: Required function 'calculateWeeklyThresholdBonuses' not found.");
       return;
    }
    // Note: checkGradSchoolAlarmBonus might be specific, check existence if needed
    // if (typeof checkGradSchoolAlarmBonus !== "function") { ... }


    // Calculate bonuses for the week that just ended (pass today's date)
    const thresholdBonuses = calculateWeeklyThresholdBonuses(new Date());

    // Calculate specific bonuses like Grad School for the *previous* week manually here
    // (as checkGradSchoolAlarmBonus was designed for current week in some versions)
    let gradSchoolBonusPoints = 0;
    let gradCount = 0;
    try {
        const targetGradActivity = "Dedicated study/work block (e.g., Grad School)";
        const today = new Date();
        const endOfWeekSummarized = getWeekStartDate(today);
        endOfWeekSummarized.setMilliseconds(endOfWeekSummarized.getMilliseconds() - 1);
        const startOfWeekSummarized = getWeekStartDate(endOfWeekSummarized);

        // Check if getWeekActivities exists
        if (typeof getWeekActivities === "function") {
            const pastWeekActivities = getWeekActivities(startOfWeekSummarized, endOfWeekSummarized);
            gradCount = pastWeekActivities.filter(act => act.name === targetGradActivity).length;
            if (gradCount >= 5) { // Assuming 5 is the threshold
                gradSchoolBonusPoints = 2; // Assuming +2 points
            }
        } else {
            Logger.log("Warning: getWeekActivities not found for grad school bonus check in displayWeeklyBonuses.");
        }
    } catch(e) { Logger.log("Error checking grad school bonus in displayWeeklyBonuses: " + e); }


    let message = "Bonuses Earned for Last Week:\n";
    let totalPoints = (thresholdBonuses.totalBonusPoints || 0) + gradSchoolBonusPoints;
    let bonusCount = (thresholdBonuses.earnedBonuses ? thresholdBonuses.earnedBonuses.length : 0) + (gradSchoolBonusPoints > 0 ? 1 : 0);

    if (bonusCount > 0) {
      message += "--------------------------\n";
      if (gradSchoolBonusPoints > 0) {
         message += `- Graduate School Dedication: +${gradSchoolBonusPoints} points (Logged ${gradCount} times)\n`;
      }
      if (thresholdBonuses.earnedBonuses) {
          thresholdBonuses.earnedBonuses.forEach(bonus => {
            message += `- ${bonus.name}: +${bonus.bonusPoints} points\n`;
            message += `  (${bonus.description}, Count: ${bonus.count})\n`;
          });
      }
      message += "--------------------------\n";
      message += `Total Bonus Points Earned: ${totalPoints}`;
    } else {
      message = "No automatic weekly bonuses were calculated as earned for the past week.";
    }

    // Display using a preformatted text area within an alert for better readability
    const htmlOutput = HtmlService.createHtmlOutput(`<pre>${message}</pre>`)
        .setWidth(400)
        .setHeight(300);
    ui.showModalDialog(htmlOutput, 'Weekly Bonus Check');
    // ui.alert("Weekly Bonus Check", message, ui.ButtonSet.OK); // Old simple alert

  } catch (e) {
     Logger.log(`Error in displayWeeklyBonuses (Menu Wrapper): ${e}\nStack: ${e.stack}`);
     ui.alert(`An error occurred while checking bonuses: ${e.message}`);
  }
}

// Add other simple helper/wrapper functions here if needed for menu items.
// For example, wrappers for manual email sends already exist in Code.gs via CONFIG.TRIGGERS
