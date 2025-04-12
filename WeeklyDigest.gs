/**
 * Weekly Digest Email Generation for Budget Game v3
 */

/**
 * Sends an enhanced weekly digest email summarizing the past week's performance,
 * including earned bonuses, completed goals, streaks, and stats.
 * Typically triggered on Sunday evening. Uses CONFIG settings and helper functions.
 */
function sendWeeklyDigestEmail() {
  try {
    // --- Start Log ---
    Logger.log("--- Starting sendWeeklyDigestEmail ---");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD); // Used for fallback/context if needed

    if (!dashboardSheet) {
      Logger.log("Weekly Digest: Dashboard sheet not found. Aborting.");
      return false;
    }

    // --- Determine Date Range for the Past Week ---
    const today = new Date(); // Use today as reference for "last week"
    const endOfWeekSummarized = getWeekStartDate(today); // Start of current week = end of last week + 1ms
    endOfWeekSummarized.setMilliseconds(endOfWeekSummarized.getMilliseconds() - 1); // Go back to Sat 23:59:59.999
    const startOfWeekSummarized = getWeekStartDate(endOfWeekSummarized); // Sunday of that previous week

    const weekStartFormatted = Utilities.formatDate(startOfWeekSummarized, Session.getScriptTimeZone(), "MMMM d, yyyy");
    const weekEndFormatted = Utilities.formatDate(endOfWeekSummarized, Session.getScriptTimeZone(), "MMMM d, yyyy");
    const weekSheetName = getWeekSheetName(startOfWeekSummarized); // Get name for the summarized week
    const weeklySheet = ss.getSheetByName(weekSheetName);


    // --- Get Data for the Past Week ---
    Logger.log(`Generating Weekly Digest for week: ${formatDateYMD(startOfWeekSummarized)} to ${formatDateYMD(endOfWeekSummarized)}`);

    let pastWeekSummary;
    let pastWeekActivities = []; // Default to empty array
    const activityData = getActivityDataCached(); // Needed for summaries/bonuses

    // Check if getWeekActivities function exists before calling
    if (typeof getWeekActivities === "function") {
        pastWeekActivities = getWeekActivities(startOfWeekSummarized, endOfWeekSummarized); // Get detailed list from Form Responses
    } else {
        Logger.log("ERROR: getWeekActivities function not found in sendWeeklyDigestEmail.");
        // Cannot proceed without activity details for bonus/goal calculation
        return false;
    }

    // Calculate summary based on the detailed activities list for accuracy
    if (typeof calculateSummaryFromActivities === "function") {
        pastWeekSummary = calculateSummaryFromActivities(pastWeekActivities, activityData);
        // Log if the weekly sheet existed but we used calculated summary anyway
        // if (weeklySheet) { Logger.log("Used calculated summary even though weekly sheet exists."); }
    } else {
        Logger.log("ERROR: calculateSummaryFromActivities function not found. Cannot generate summary.");
        return false; // Cannot proceed without summary
    }

    if (!pastWeekSummary) {
        Logger.log(`Weekly Digest: Could not calculate summary data for the past week. Aborting.`);
        return false;
    }
    Logger.log(`Past Week Summary: Total=${pastWeekSummary.total}, Pos=${pastWeekSummary.positive}, Neg=${pastWeekSummary.negative}`);

    // --- Calculate Bonuses & Finalize Goals for the Past Week ---
    let thresholdBonusesResult = { earnedBonuses: [], totalBonusPoints: 0 };
    if(typeof calculateWeeklyThresholdBonuses === "function") {
        try { thresholdBonusesResult = calculateWeeklyThresholdBonuses(today); } // Pass today to check PREVIOUS week
        catch(e) { Logger.log("Error calculating threshold bonuses: " + e); }
    } else { Logger.log("Warning: calculateWeeklyThresholdBonuses function not found."); }

    let finalizedGoalsResult = { completedGoals: [], totalBonusPoints: 0 };
    if (typeof finalizeWeeklyGoals === "function") {
        try { finalizedGoalsResult = finalizeWeeklyGoals(); } // Checks previous week's goals based on current date
        catch(e) { Logger.log("Error finalizing weekly goals: " + e); }
    } else { Logger.log("Warning: finalizeWeeklyGoals function not found."); }


    // --- Specific Bonuses (Example: Grad School) - check for the *past* week ---
    let gradSchoolBonusPoints = 0;
    let gradCount = 0;
    try {
       const targetGradActivity = "Dedicated study/work block (e.g., Grad School)";
       gradCount = pastWeekActivities.filter(act => act.name === targetGradActivity).length;
       if (gradCount >= 5) { // Assuming 5 is the threshold
           gradSchoolBonusPoints = 2; // Assuming +2 points
           Logger.log(`Grad school bonus earned for past week (Count: ${gradCount})`);
       }
    } catch(e) { Logger.log("Error checking grad school bonus: " + e); }


    const totalBonusPointsEarned = (thresholdBonusesResult.totalBonusPoints || 0) + (finalizedGoalsResult.totalBonusPoints || 0) + gradSchoolBonusPoints;
    const finalWeekScore = (pastWeekSummary.total || 0) + totalBonusPointsEarned;
    Logger.log(`Final Week Score Calculation: Base=${pastWeekSummary.total}, Bonus=${totalBonusPointsEarned}, Final=${finalWeekScore}`);


    // --- Get Current Streaks (as of today, for display) ---
    let streakData = { buildingStreaks: {}, streaks: {} }; // Default empty
     try {
        if (typeof trackActivityStreaks === "function") {
            streakData = trackActivityStreaks();
            Logger.log("Weekly Digest: Fetched current streak data: " + JSON.stringify(streakData));
        } else { Logger.log("Warning: trackActivityStreaks function not found for weekly digest."); }
     } catch(e) { Logger.log("Error fetching streaks for weekly digest: " + e); }


    // --- Build Email Body ---
    const subject = CONFIG.EMAIL_SUBJECTS.WEEKLY_DIGEST;

    let body = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f9fa; padding: 20px; border: 1px solid #ddd;">
      <div style="text-align: center; padding: 10px 0; margin-bottom: 20px;">
        <h1 style="color: #333; font-size: 24px; margin: 0;">${subject}</h1>
        <p style="color: #666; margin: 5px 0;">Summary for ${weekStartFormatted} to ${weekEndFormatted}</p>
      </div>

      <!-- Final Score -->
      <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
        <h2 style="font-size: 28px; margin: 0 0 10px 0; color: ${finalWeekScore >= 0 ? CONFIG.COLORS.CHART_POSITIVE : CONFIG.COLORS.CHART_NEGATIVE};">
          FINAL WEEK SCORE: ${finalWeekScore >= 0 ? '+' : ''}${finalWeekScore}
        </h2>
        <p style="color: #666; margin: 0;">
          Base Points: ${pastWeekSummary.total || 0} | Bonus Points Earned: +${totalBonusPointsEarned}
        </p>
      </div>`;

    // --- Bonuses & Goals Completed Last Week ---
    const earnedBonusesList = thresholdBonusesResult.earnedBonuses || [];
    const completedGoalsList = finalizedGoalsResult.completedGoals || [];
    const hasAchievements = earnedBonusesList.length > 0 || completedGoalsList.length > 0 || gradSchoolBonusPoints > 0;

    if (hasAchievements) {
       body += `
       <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
         <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">🏆 Bonuses & Goals Achieved (Last Week):</h3>
         <ul style="padding-left: 20px; list-style: '✅ '; margin: 0; line-height: 1.5;">`;

       if (gradSchoolBonusPoints > 0) {
          body += `<li style="margin-bottom: 10px;">
                     <strong>Graduate School Dedication:</strong> +${gradSchoolBonusPoints} points
                     <br><small style="color: #666;">(Logged study block ${gradCount} times)</small>
                   </li>`;
       }
       earnedBonusesList.forEach(bonus => {
          body += `<li style="margin-bottom: 10px;">
                     <strong>${bonus.name}:</strong> +${bonus.bonusPoints} points
                     <br><small style="color: #666;">(${bonus.description}, Count: ${bonus.count})</small>
                   </li>`;
       });
       completedGoalsList.forEach(goal => {
           body += `<li style="margin-bottom: 10px;">
                      <strong>Goal: ${goal.name}:</strong> +${goal.bonusPoints} points
                    </li>`;
       });
       body += `</ul></div>`;
    } else {
        body += `<!-- No specific bonuses or goals completed last week -->`;
    }


    // --- Current Streaks Section ---
    const buildingStreaks = streakData.buildingStreaks || {};
    const fullStreaks = streakData.streaks || {};
    const hasBuildingStreaks = Object.keys(buildingStreaks).length > 0;
    const hasFullStreaks = Object.keys(fullStreaks).length > 0;

    if (hasBuildingStreaks || hasFullStreaks) {
       body += `
       <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
         <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">🔥 Current Activity Streaks (Going into this week):</h3>`;

       if (hasFullStreaks) {
          body += `<h4 style="color: ${CONFIG.COLORS.STREAK_COLOR}; margin: 10px 0 5px 0;">Active Streaks (3+ days):</h4>
                      <ul style="list-style-type: none; padding-left: 20px; margin: 0;">`;
          Object.entries(fullStreaks).sort(([,aDays],[,bDays]) => bDays - aDays).forEach(([activity, days]) => {
             const streakEmoji = days >= CONFIG.STREAK_THRESHOLDS.MULTIPLIER ? "🔥🔥🔥" : (days >= CONFIG.STREAK_THRESHOLDS.BONUS_2 ? "🔥🔥" : "🔥");
             let rewardText = "";
             if (days >= CONFIG.STREAK_THRESHOLDS.MULTIPLIER) rewardText = `<span style="color: ${CONFIG.COLORS.CHART_POSITIVE}; font-size: 0.9em;">(2x Points Active!)</span>`;
             else if (days >= CONFIG.STREAK_THRESHOLDS.BONUS_2) rewardText = `<span style="color: ${CONFIG.COLORS.CHART_POSITIVE}; font-size: 0.9em;">(+${CONFIG.STREAK_BONUS_POINTS.BONUS_2} Bonus Pts!)</span>`;
             else if (days >= CONFIG.STREAK_THRESHOLDS.BONUS_1) rewardText = `<span style="color: ${CONFIG.COLORS.CHART_POSITIVE}; font-size: 0.9em;">(+${CONFIG.STREAK_BONUS_POINTS.BONUS_1} Bonus Pt!)</span>`;

             body += `<li style="margin-bottom: 8px;"><strong>${activity}</strong>: ${days} days ${streakEmoji} ${rewardText}</li>`;
          });
          body += `</ul>`;
       }

       if (hasBuildingStreaks) {
           body += `<h4 style="color: #E67E22; margin: 15px 0 5px 0;">Building Streaks (2 days):</h4>
                      <ul style="list-style-type: none; padding-left: 20px; margin: 0;">`;
            Object.keys(buildingStreaks).forEach(activity => {
               body += `<li style="margin-bottom: 8px;"><strong>${activity}</strong>: 2 days - Log today for a bonus! 💪</li>`;
            });
            body += `</ul>`;
       }
       body += `</div>`;
    }


    // --- Past Week Stats Section ---
    body += `
    <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">📊 Past Week Stats:</h3>
      <p><strong>Total Positive Activities:</strong> ${pastWeekSummary.positive || 0}</p>
      <p><strong>Total Negative Activities:</strong> ${pastWeekSummary.negative || 0}</p>
      <p><strong>Top Activity:</strong> ${pastWeekSummary.topActivity || "None"} (${pastWeekSummary.topActivityCount || 0} times)</p>
      <p style="margin-top: 15px;"><strong>Category Breakdown (Counts):</strong></p>
      <ul style="margin: 5px 0 0 20px; padding: 0; list-style: disc;">`;
        // Use the categories structure from the summary object
        // Ensure the keys match what calculateSummaryFromActivities provides
        const categoryLabelsMap = {
            "Positive Activities": "Positive",
            "Negative Activities": "Negative",
            "Health Activities": "Health",
            "Household Activities": "Household"
            // Add mappings if summary keys differ from display names
        };
        for (const [summaryKey, count] of Object.entries(pastWeekSummary.categories || {})) {
            const displayLabel = categoryLabelsMap[summaryKey] || summaryKey; // Use mapped name or key itself
            body += `<li>${displayLabel}: ${count}</li>`;
        }
      body +=`</ul>
    </div>

    <!-- Footer & Links -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="${ss.getUrl()}" style="display: inline-block; background-color: ${CONFIG.COLORS.HEADER_BG}; color: white; text-decoration: none; padding: 12px 30px; border-radius: 4px; font-weight: bold;">VIEW SPREADSHEET</a>
    </div>
    <div style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
      <p>This email was automatically generated by Budget Game.</p>
    </div>
  </div>`;

    // --- Send Email ---
    CONFIG.DIGEST_EMAIL_ADDRESSES.forEach(emailAddress => {
      if (emailAddress && emailAddress.includes('@')) {
        try {
          MailApp.sendEmail({
            to: emailAddress,
            subject: subject,
            htmlBody: body,
            name: "Budget Game Bot" // Optional: Set a sender name
          });
          Logger.log(`Sent weekly digest to ${emailAddress}`);
        } catch (mailError) {
          Logger.log(`Error sending weekly digest to ${emailAddress}: ${mailError}`);
        }
      }
    });

    Logger.log("--- Finished sendWeeklyDigestEmail ---");
    return true;

  } catch (error) {
    Logger.log(`CRITICAL ERROR in sendWeeklyDigestEmail: ${error}\nStack: ${error.stack}`);
    return false;
  }
}

// Note: setupWeeklyDigestTrigger() was removed as its logic is incorporated into setupAllTriggers() in Code.gs
