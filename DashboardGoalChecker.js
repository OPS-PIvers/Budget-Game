// DashboardGoalChecker.gs
/**
 * Calculates status for the two specific Dashboard Goals
 * (Higher than Previous Week, Double Previous Week) based on CURRENT week's progress.
 */

/**
 * Helper function to calculate goal completion percentage, handling edge cases.
 * @param {number} current The current progress value.
 * @param {number} target The target value.
 * @return {number} Percentage completion (0-100).
 */
function calculatePercentage(current, target) {
  if (target <= 0) {
    // If target is zero or negative, any positive progress is 100%
    return current > 0 ? 100 : 0;
  } else {
    // Calculate percentage relative to the positive target
    const percentage = (current / target) * 100;
    // Clamp the result between 0 and 100 and round
    return Math.min(100, Math.max(0, Math.round(percentage)));
  }
}


/**
 * Calculates the status of the 'Higher than Previous' and 'Double Points' goals
 * based on the current week's progress compared to the previous completed week's total.
 * Reads historical data from the Dashboard sheet to determine weekly totals.
 * @param {string} [householdId=null] Optional household ID to filter data. If null, uses data for the calling user.
 * @return {object} An object containing the status of the two goals.
 */
function calculateDashboardGoalStatus(householdId = null) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
    const goals = {
        higherThanPrevious: { achieved: false, description: "Higher point total *this* week than *last* week", target: 0, current: 0, percentComplete: 0 },
        doublePoints: { achieved: false, description: "Double *last* week's point total *this* week", target: 0, current: 0, percentComplete: 0 }
    };

    if (!dashboardSheet) {
        Logger.log("Dashboard sheet not found in calculateDashboardGoalStatus.");
        return goals; // Return default goals
    }

    // --- Get Household Emails if ID is provided ---
    let householdEmails = [];
    const currentUserEmail = Session.getEffectiveUser().getEmail(); // Use effective user for filtering if no household
    if (householdId && CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
        householdEmails = getHouseholdEmails(householdId); // From HouseholdManagement.gs
        if (!householdEmails || householdEmails.length === 0) {
            Logger.log(`No members found for household ${householdId} in goal check.`);
            // Decide behavior: If no members, use current user? For now, return default.
            return goals;
        }
        Logger.log(`Goal Calc: Filtering for household members: ${householdEmails.join(', ')}`);
    } else {
        // If no household ID, calculate based on the single user accessing the app
        householdEmails = [currentUserEmail];
        Logger.log(`Goal Calc: Filtering for individual user: ${currentUserEmail}`);
    }
    // --- End Household Emails ---

    // --- Aggregate Weekly Totals from Dashboard ---
    const weeklyTotalsMap = new Map(); // { weekStartDateStr: totalPoints }
    const lastRow = dashboardSheet.getLastRow();

    if (lastRow > 1) {
        // Read Date(A), Points(B), Email(G)
        const data = dashboardSheet.getRange(2, 1, lastRow - 1, 7).getValues();

        data.forEach(row => {
            const dateObj = row[0];
            const rowEmail = row[6] || ""; // Email in Col G

            // Check if date is valid and if email matches household/user
            if (dateObj instanceof Date && dateObj.getTime() > 0) {
                if (householdEmails.some(he => he.toLowerCase() === rowEmail.toLowerCase())) {
                    const points = Number(row[1]) || 0;
                    const weekStartDate = getWeekStartDate(dateObj); // From Utilities.gs
                    const weekStartDateStr = formatDateYMD(weekStartDate); // From Utilities.gs

                    weeklyTotalsMap.set(weekStartDateStr, (weeklyTotalsMap.get(weekStartDateStr) || 0) + points);
                }
            }
        });
    }
    // --- End Aggregation ---

    // --- Identify Key Weeks and Totals ---
    const today = new Date();
    const currentWeekStartDate = getWeekStartDate(today);
    const currentRunningWeekStartStr = formatDateYMD(currentWeekStartDate);

    // Get current week's running total
    const currentWeekTotal = weeklyTotalsMap.get(currentRunningWeekStartStr) || 0;

    // Find the start date of the *previous completed* week
    let previousWeekStartStr = null;
    const sortedWeeks = Array.from(weeklyTotalsMap.keys()).sort();
    for (let i = sortedWeeks.length - 1; i >= 0; i--) {
        if (sortedWeeks[i] < currentRunningWeekStartStr) {
            previousWeekStartStr = sortedWeeks[i];
            break; // Found the most recent completed week
        }
    }

    // Get the total for the previous completed week
    const previousWeekTotal = previousWeekStartStr ? (weeklyTotalsMap.get(previousWeekStartStr) || 0) : 0;

    Logger.log(`Goal Calc: Current Week (${currentRunningWeekStartStr}) Total = ${currentWeekTotal}, Previous Week (${previousWeekStartStr || 'N/A'}) Total = ${previousWeekTotal}`);

    if (previousWeekStartStr === null) {
        Logger.log("Not enough historical data (< 1 previous week) to calculate goal status relative to last week.");
        // Update descriptions to reflect lack of comparison data
        goals.higherThanPrevious.description = "Score more points than last week (No previous week data)";
        goals.doublePoints.description = "Double last week's points (No previous week data)";
        goals.higherThanPrevious.current = currentWeekTotal; // Show current progress
        goals.doublePoints.current = currentWeekTotal;
        return goals; // Need a previous week to compare against
    }

    // --- Calculate Goal Status based on CURRENT week vs PREVIOUS week ---

    // Goal 1: Higher Than Previous
    goals.higherThanPrevious.target = previousWeekTotal;
    goals.higherThanPrevious.current = currentWeekTotal;
    goals.higherThanPrevious.achieved = currentWeekTotal > previousWeekTotal;
    goals.higherThanPrevious.percentComplete = calculatePercentage(currentWeekTotal, previousWeekTotal);

    // Goal 2: Double Previous Week
    goals.doublePoints.target = previousWeekTotal * 2;
    goals.doublePoints.current = currentWeekTotal;
    // Achieved if previous was positive and current meets double target, OR if previous was zero/negative and current is positive
    goals.doublePoints.achieved = (previousWeekTotal > 0 && currentWeekTotal >= goals.doublePoints.target) || (previousWeekTotal <= 0 && currentWeekTotal > 0);
    goals.doublePoints.percentComplete = calculatePercentage(currentWeekTotal, goals.doublePoints.target);

    Logger.log(`Goal Status Calculated: Higher=${goals.higherThanPrevious.achieved} (${goals.higherThanPrevious.percentComplete}%), Double=${goals.doublePoints.achieved} (${goals.doublePoints.percentComplete}%)`);
    return goals;
}