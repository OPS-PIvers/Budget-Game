// EmailService.gs
/**
 * Handles generation and sending of automated emails (Daily/Weekly Digests).
 */

/**
 * Sends the daily summary digest email, supporting households.
 * Iterates through households or sends individual digests based on CONFIG.
 * Summarizes today's activities, current weekly progress, streaks, and goals.
 */
function sendDailyDigest() {
  try {
    Logger.log("--- Starting sendDailyDigest (Household Aware) ---");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Check if Dashboard exists, needed for generating content later
    const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
     if (!dashboardSheet) {
       Logger.log("Daily Digest: Dashboard sheet not found. Cannot generate digests. Aborting.");
       return false;
     }

    // Check if households are enabled
    if (CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
      Logger.log("Households enabled. Processing digests per household.");
      // Get all households
      const householdsSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HOUSEHOLDS);
      if (!householdsSheet || householdsSheet.getLastRow() <= 1) {
        Logger.log("Households sheet not found or empty. Falling back to individual digests for configured list.");
        return sendRegularDailyDigest(); // Fallback to original logic
      }

      // Using getHouseholdAdminData groups members by household correctly
      const households = getHouseholdAdminData(); // From HouseholdManagement.gs

      // Track emails processed to handle non-household recipients later
      const allHouseholdEmails = new Set();
      households.forEach(h => h.members.forEach(m => allHouseholdEmails.add(m.email.toLowerCase())));

      // Process each household
      households.forEach(household => {
          const householdId = household.id;
          const householdName = household.name;
          const validEmails = household.members.map(m => m.email).filter(email => email && email.includes('@'));

          if (validEmails.length === 0) {
              Logger.log(`Skipping digest for Household ${householdName} (ID: ${householdId}) - No valid emails.`);
              return; // continue to next household
          }

          Logger.log(`Generating digest for Household: ${householdName} (ID: ${householdId})`);
          const emailContent = generateDailyDigestForHousehold(householdId, validEmails, householdName); // Use helper
          const subject = `${CONFIG.EMAIL_SUBJECTS.DAILY_DIGEST} - ${householdName}`;

          // Send email to each member
          validEmails.forEach(email => {
              try {
                  MailApp.sendEmail({ to: email, subject: subject, htmlBody: emailContent, name: "Budget Game Bot" });
                  Logger.log(`Sent household daily digest to ${email} (Household: ${householdName})`);
              } catch (mailError) {
                  Logger.log(`Error sending household daily digest to ${email}: ${mailError}`);
              }
          });
      });

      // Also send to any configured digest recipients who AREN'T in a household
      const nonHouseholdRecipients = CONFIG.DIGEST_EMAIL_ADDRESSES.filter(
        email => email && email.includes('@') && !allHouseholdEmails.has(email.toLowerCase())
      );

      if (nonHouseholdRecipients.length > 0) {
        Logger.log(`Sending regular digest to ${nonHouseholdRecipients.length} non-household recipients.`);
        // generateDailyDigestForNonHousehold could reuse parts of generateDailyDigestForHousehold logic without filtering
        const regularContent = generateDailyDigestForHousehold(null, nonHouseholdRecipients, "Your"); // Pass null ID, use "Your"
        const subject = CONFIG.EMAIL_SUBJECTS.DAILY_DIGEST;

        nonHouseholdRecipients.forEach(email => {
          try {
            MailApp.sendEmail({ to: email, subject: subject, htmlBody: regularContent, name: "Budget Game Bot" });
            Logger.log(`Sent regular daily digest to ${email} (non-household)`);
          } catch (mailError) {
            Logger.log(`Error sending regular daily digest to ${email}: ${mailError}`);
          }
        });
      }

      Logger.log("--- Finished sending household-aware daily digests ---");
      return true;

    } else {
      // Households disabled, send the regular digest to configured list
      Logger.log("Households disabled. Sending regular digest.");
      return sendRegularDailyDigest();
    }
  } catch (error) {
    Logger.log(`CRITICAL ERROR in sendDailyDigest (Main Entry): ${error}\nStack: ${error.stack}`);
    return false;
  }
}

/**
 * Generates the daily digest email content for a specific household (or individual).
 * Reads data primarily from the Dashboard sheet.
 * REMOVED the separate Streaks section as it was redundant with the activity list.
 * @param {string|null} householdId - The ID of the household, or null for non-household digest.
 * @param {Array<string>} recipientEmails - Array of email addresses for the household/individual.
 * @param {string} householdName - The name of the household or "Your" for individual.
 * @return {string} The HTML email body content.
 */
function generateDailyDigestForHousehold(householdId, recipientEmails, householdName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
    if (!dashboardSheet) {
      Logger.log(`Digest Generation Error (${householdId || 'Individual'}): Dashboard sheet not found.`);
      return "<p>Error: Could not generate digest. Dashboard sheet missing.</p>";
    }

    // --- Get Data ---
    const today = new Date();
    const formattedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), "EEEE, MMMM d");
    const formattedYMD = formatDateYMD(today);

    // Get Today's Data aggregated from Dashboard for the specific household/emails
    let todayPoints = 0;
    let todayActivitiesStr = ""; // Build combined string
    let activitiesListForEmail = []; // Formatted list items
    const dashLastRow = dashboardSheet.getLastRow();

    if (dashLastRow > 1) {
      // Read Dashboard: Date(A), Points(B), Activities(C), Email(G)
      const data = dashboardSheet.getRange(2, 1, dashLastRow - 1, 7).getValues();
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowDate = row[0];
        const rowEmail = row[6] || "";

        if (rowDate instanceof Date && formatDateYMD(rowDate) === formattedYMD &&
            recipientEmails.some(email => email.toLowerCase() === rowEmail.toLowerCase()))
        {
          todayPoints += Number(row[1]) || 0; // Sum points
          const activities = row[2] || "";
          if (activities) {
            todayActivitiesStr += (todayActivitiesStr ? ", " : "") + activities; // Append activities
          }
        }
      }
    }
    const formattedTodayPoints = todayPoints >= 0 ? `+${todayPoints}` : todayPoints;
    Logger.log(`Digest Gen (${householdName}): Today's Points=${formattedTodayPoints}`);

    // Process the combined activities string for display in the email
    if (todayActivitiesStr) {
      const combinedActivities = todayActivitiesStr.split(", ").filter(a => a.trim() !== ""); // Filter empty strings
      // Use a Map to store unique activities and their details for the email list
       const uniqueActivitiesMap = new Map();
       combinedActivities.forEach(activity => {
            // Regex updated to correctly capture all parts even without streak
            const match = activity.match(/(➕|➖)\s(.+?)(\s\(🔥\d+\))?\s\(([+-]\d+)\)/);
            if (match) {
                const icon = match[1];
                const name = match[2].trim();
                const streakMatchText = match[3] || ""; // Full streak text e.g., " (🔥5)" or empty
                const pointsText = match[4]; // Point text e.g., "+3" or "-1"
                const color = icon === "➕" ? CONFIG.COLORS.CHART_POSITIVE : CONFIG.COLORS.CHART_NEGATIVE;

                // Extract streak number if present
                let streakDisplay = "";
                const streakNumMatch = streakMatchText.match(/\(🔥(\d+)\)/);
                 if (streakNumMatch) {
                    const streakLength = parseInt(streakNumMatch[1]);
                    // Use streak settings thresholds for display logic
                    const streakSettings = getCurrentStreakSettings(); // Get current settings
                    if (streakLength >= streakSettings.thresholds.BONUS_1) { // Show fire from first bonus threshold
                       const streakEmoji = streakLength >= streakSettings.thresholds.MULTIPLIER ? "🔥🔥🔥" :
                                         (streakLength >= streakSettings.thresholds.BONUS_2 ? "🔥🔥" : "🔥");
                       streakDisplay = ` <span style="color: ${CONFIG.COLORS.STREAK_COLOR}; font-size: 0.9em;">${streakEmoji} ${streakLength}-day streak!</span>`;
                    }
                 }

                 // Store unique entries based on name (to avoid listing the same activity multiple times if logged separately)
                 if (!uniqueActivitiesMap.has(name)) {
                   uniqueActivitiesMap.set(name, `
                     <li style="margin-bottom: 10px; line-height: 1.4;">
                       <span style="color: ${color}; font-weight: bold; display: inline-block; width: 20px;">${icon}</span>
                       ${name} (${pointsText}) ${streakDisplay}
                     </li>`);
                 } else {
                    // Optional: If activity logged multiple times, maybe update the list item?
                    // For now, just showing the first instance encountered.
                 }
            } else { Logger.log(`Could not parse activity for email list: ${activity}`) }
       });
       activitiesListForEmail = Array.from(uniqueActivitiesMap.values());
    }


    // Weekly Summary Data (using helper that reads Dashboard)
    const weeklyData = getHouseholdWeeklyTotals(recipientEmails); // From DataProcessing.gs
    const formattedWeeklyTotal = weeklyData.total >= 0 ? `+${weeklyData.total}` : weeklyData.total;
    const weekStartDate = getWeekStartDate(today);
    const weekEndDate = getWeekEndDate(today);
    const weekStartFormatted = Utilities.formatDate(weekStartDate, Session.getScriptTimeZone(), CONFIG.DATE_FORMAT_SHORT);
    const weekEndFormatted = Utilities.formatDate(weekEndDate, Session.getScriptTimeZone(), CONFIG.DATE_FORMAT_SHORT);

    // --- Build Email Body ---
    let emailBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f9fa; padding: 20px; border: 1px solid #ddd;">
      <div style="text-align: center; padding: 10px 0; margin-bottom: 20px;">
        <h1 style="color: #333; font-size: 24px; margin: 0;">${CONFIG.EMAIL_SUBJECTS.DAILY_DIGEST}</h1>
        <p style="color: #666; margin: 5px 0;">${formattedDate}</p>
      </div>`;

      // Add Household Info if applicable
      if (householdId) {
         emailBody += `
         <div style="background-color: #e3f2fd; padding: 15px; margin-bottom: 20px; border-radius: 5px; border: 1px solid #bbdefb;">
            <p style="margin: 0; color: #1565c0; font-size: 14px;">🏠 Daily summary for the <strong>${householdName}</strong> household.</p>
         </div>`;
      }

      // Today's Points
      emailBody += `
      <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
        <h2 style="font-size: 28px; margin: 0 0 10px 0; color: ${todayPoints >= 0 ? CONFIG.COLORS.CHART_POSITIVE : CONFIG.COLORS.CHART_NEGATIVE};">
          ${householdName}'s Points Today: ${formattedTodayPoints}
        </h2>
      </div>

      <!-- Today's Activities -->
      <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">Today's Activities Logged:</h3>
        <ul style="padding-left: 20px; list-style-type: none; margin: 0;">`;

    if (activitiesListForEmail.length > 0) {
      emailBody += activitiesListForEmail.join('');
    } else {
      emailBody += `<li>No activities recorded yet today.</li>`;
    }
    emailBody += `</ul></div>`;

     // --- REMOVED Streaks Section ---
     // The block generating the separate "Current Activity Streaks" list was removed from here.
     // Streak information is now only shown within the "Today's Activities Logged" list above.

    // --- Weekly Progress Section ---
    emailBody += `
    <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">📅 ${householdName}'s Weekly Progress (${weekStartFormatted} - ${weekEndFormatted}):</h3>
      <p><strong>Current Weekly Total:</strong> <span style="font-weight: bold; color: ${weeklyData.total >= 0 ? CONFIG.COLORS.CHART_POSITIVE : CONFIG.COLORS.CHART_NEGATIVE}">${formattedWeeklyTotal} points</span></p>
      <p><strong>Positive Activities (Week):</strong> ${weeklyData.positive || 0}</p>
      <p><strong>Negative Activities (Week):</strong> ${weeklyData.negative || 0}</p>
      <p><strong>Top Activity (Week):</strong> ${weeklyData.topActivity || "None"}</p>
    </div>

    <!-- Footer & Links -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="${getScriptUrl()}" style="display: inline-block; background-color: ${CONFIG.COLORS.HEADER_BG}; color: white; text-decoration: none; padding: 12px 30px; border-radius: 4px; font-weight: bold;">LOG MORE ACTIVITIES</a>
    </div>
    <div style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
      <p>This email was automatically generated by Budget Game.</p>
    </div>
  </div>`;

    return emailBody;

  } catch (error) {
    Logger.log(`CRITICAL ERROR generating digest for ${householdId || 'Individual'}: ${error}\nStack: ${error.stack}`);
    return `<p>Error generating digest content. Please check script logs.</p>`;
  }
}


/**
 * Fallback function to send the original daily digest to CONFIG emails if households disabled/fail.
 * @return {boolean} Success or failure
 */
function sendRegularDailyDigest() {
  try {
    Logger.log("--- Starting sendRegularDailyDigest (Fallback/Non-Household) ---");
    const recipients = CONFIG.DIGEST_EMAIL_ADDRESSES;
    if (!recipients || recipients.length === 0) {
        Logger.log("No default recipients configured in CONFIG.DIGEST_EMAIL_ADDRESSES.");
        return false;
    }

    // Generate content using the same helper, passing null for household ID
    const emailContent = generateDailyDigestForHousehold(null, recipients, "Your"); // Use "Your" for generic name
    const subject = CONFIG.EMAIL_SUBJECTS.DAILY_DIGEST;

    recipients.forEach(emailAddress => {
      if (emailAddress && emailAddress.includes('@')) {
        try {
          MailApp.sendEmail({ to: emailAddress, subject: subject, htmlBody: emailContent, name: "Budget Game Bot" });
          Logger.log(`Sent regular daily digest to ${emailAddress}`);
        } catch (mailError) {
          Logger.log(`Error sending regular daily digest to ${emailAddress}: ${mailError}`);
        }
      }
    });

    Logger.log("--- Finished sendRegularDailyDigest ---");
    return true;

  } catch (error) {
    Logger.log(`CRITICAL ERROR in sendRegularDailyDigest: ${error}\nStack: ${error.stack}`);
    return false;
  }
}


/**
 * Sends the weekly digest email summarizing the *past* week's performance.
 * Reads historical data from the Dashboard sheet. Checks the two specific goals.
 */
function sendWeeklyDigestEmail() {
  try {
    Logger.log("--- Starting sendWeeklyDigestEmail ---");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
    if (!dashboardSheet) {
      Logger.log("Weekly Digest: Dashboard sheet not found. Aborting.");
      return false;
    }

    // Determine Date Range for the Past Week
    const today = new Date();
    const endOfWeekSummarized = getWeekStartDate(today);
    endOfWeekSummarized.setMilliseconds(endOfWeekSummarized.getMilliseconds() - 1);
    const startOfWeekSummarized = getWeekStartDate(endOfWeekSummarized);
    const weekStartFormatted = Utilities.formatDate(startOfWeekSummarized, Session.getScriptTimeZone(), "MMMM d, yyyy");
    const weekEndFormatted = Utilities.formatDate(endOfWeekSummarized, Session.getScriptTimeZone(), "MMMM d, yyyy");

    // --- Process per Household OR Send Single Digest ---
    if (CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
        const households = getHouseholdAdminData(); // From HouseholdManagement.gs
        const allHouseholdEmails = new Set();
        households.forEach(h => h.members.forEach(m => allHouseholdEmails.add(m.email.toLowerCase())));

        households.forEach(household => {
            const householdId = household.id;
            const householdName = household.name;
            const validEmails = household.members.map(m => m.email).filter(email => email && email.includes('@'));
            if (validEmails.length === 0) return;

            Logger.log(`Generating Weekly Digest for Household: ${householdName} (ID: ${householdId})`);
            const { body, subject } = generateWeeklyDigestContent(startOfWeekSummarized, endOfWeekSummarized, householdId, householdName);

            validEmails.forEach(email => {
                try {
                    MailApp.sendEmail({ to: email, subject: subject, htmlBody: body, name: "Budget Game Bot" });
                    Logger.log(`Sent household weekly digest to ${email} (Household: ${householdName})`);
                } catch (mailError) {
                    Logger.log(`Error sending household weekly digest to ${email}: ${mailError}`);
                }
            });
        });

        // Send to non-household recipients
        const nonHouseholdRecipients = CONFIG.DIGEST_EMAIL_ADDRESSES.filter(
            email => email && email.includes('@') && !allHouseholdEmails.has(email.toLowerCase())
        );
        if (nonHouseholdRecipients.length > 0) {
            Logger.log(`Sending weekly digest to ${nonHouseholdRecipients.length} non-household recipients.`);
            const { body, subject } = generateWeeklyDigestContent(startOfWeekSummarized, endOfWeekSummarized, null, "Your"); // Use null ID

            nonHouseholdRecipients.forEach(email => {
                try {
                    MailApp.sendEmail({ to: email, subject: subject, htmlBody: body, name: "Budget Game Bot" });
                    Logger.log(`Sent regular weekly digest to ${email} (non-household)`);
                } catch (mailError) {
                    Logger.log(`Error sending regular weekly digest to ${email}: ${mailError}`);
                }
            });
        }

    } else {
        // Households disabled - send single digest
        Logger.log("Households disabled. Sending single weekly digest.");
        const recipients = CONFIG.DIGEST_EMAIL_ADDRESSES;
        if (!recipients || recipients.length === 0) return false;

        const { body, subject } = generateWeeklyDigestContent(startOfWeekSummarized, endOfWeekSummarized, null, "Your"); // Use null ID

        recipients.forEach(emailAddress => {
          if (emailAddress && emailAddress.includes('@')) {
            try {
              MailApp.sendEmail({ to: emailAddress, subject: subject, htmlBody: body, name: "Budget Game Bot" });
              Logger.log(`Sent weekly digest to ${emailAddress}`);
            } catch (mailError) {
              Logger.log(`Error sending weekly digest to ${emailAddress}: ${mailError}`);
            }
          }
        });
    }

    Logger.log("--- Finished sendWeeklyDigestEmail ---");
    return true;

  } catch (error) {
    Logger.log(`CRITICAL ERROR in sendWeeklyDigestEmail: ${error}\nStack: ${error.stack}`);
    return false;
  }
}

/**
 * Generates the HTML content for the weekly digest email.
 * Includes a dedicated streaks section.
 * @param {Date} startDate - Start date of the summarized week.
 * @param {Date} endDate - End date of the summarized week.
 * @param {string|null} householdId - The household ID or null for global/individual.
 * @param {string} householdName - The household name or "Your".
 * @return {object} { body: string, subject: string }
 */
function generateWeeklyDigestContent(startDate, endDate, householdId, householdName) {
    const weekStartFormatted = Utilities.formatDate(startDate, Session.getScriptTimeZone(), "MMMM d, yyyy");
    const weekEndFormatted = Utilities.formatDate(endDate, Session.getScriptTimeZone(), "MMMM d, yyyy");
    const subject = `${CONFIG.EMAIL_SUBJECTS.WEEKLY_DIGEST} (${householdName} Summary)`;

    // Get Household Emails needed for filtering
    let householdEmails = [];
    if (householdId && CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
      householdEmails = getHouseholdEmails(householdId);
    } else {
      // For non-household, filter by configured digest emails for consistency
      // If the configured list is empty, calculations will be based on potentially no data
      householdEmails = CONFIG.DIGEST_EMAIL_ADDRESSES;
    }

    // --- Get Past Week Summary Data (reading Dashboard) ---
    const pastWeekSummary = getHouseholdWeeklyTotals(householdEmails); // Use helper, passing household emails
    const basePoints = pastWeekSummary.total || 0;

    // --- Check the two specific goals based on Dashboard History ---
    const goalStatus = calculateDashboardGoalStatus(householdId); // From DashboardGoalChecker.gs
    let goalBonusPoints = 0;
    const completedGoalsList = [];
    // Assign points based on CONFIG or fixed values if goals met
    if (goalStatus.higherThanPrevious.achieved) {
        goalBonusPoints += 5; // Example bonus points
        completedGoalsList.push({ name: "Higher Than Previous Week", bonusPoints: 5 });
    }
    if (goalStatus.doublePoints.achieved) {
        goalBonusPoints += 10; // Example bonus points
        completedGoalsList.push({ name: "Double Previous Week Points", bonusPoints: 10 });
    }

    // --- Specific Bonus Check (e.g., Grad School) for the past week ---
    let gradSchoolBonusPoints = 0;
    let gradCount = 0;
    // Re-fetch activities specifically for the past week to check counts accurately
    // Use getWeekActivities from DataProcessing.gs, passing emails
    const pastWeekActivities = getWeekActivities(startDate, endDate, householdEmails);
    try {
       const targetGradActivity = "Dedicated study/work block (e.g., Grad School)";
       gradCount = pastWeekActivities.filter(act => act.name === targetGradActivity).length;
       if (gradCount >= 5) { // Assuming 5 is the threshold
           gradSchoolBonusPoints = 2; // Assuming +2 points
           Logger.log(`Grad school bonus earned (${householdName}): Count=${gradCount}`);
       }
    } catch(e) { Logger.log(`Error checking grad school bonus (${householdName}): ${e}`); }


    // --- Final Score ---
    const totalBonusPointsEarned = goalBonusPoints + gradSchoolBonusPoints;
    const finalWeekScore = basePoints + totalBonusPointsEarned;
    Logger.log(`Weekly Digest Gen (${householdName}): Base=${basePoints}, GoalBonus=${goalBonusPoints}, GradBonus=${gradSchoolBonusPoints}, Final=${finalWeekScore}`);

    // --- Current Streaks (as of today) ---
    // Fetch current streak data for the household (or globally if no ID)
    let streakData = { buildingStreaks: {}, streaks: {} };
    try {
       if (householdId && CONFIG.HOUSEHOLD_SETTINGS.ENABLED && typeof trackActivityStreaksForHousehold === "function") {
          streakData = trackActivityStreaksForHousehold(householdId);
       } else if (typeof trackActivityStreaks === "function") {
          streakData = trackActivityStreaks(); // Use global for individual digests
       }
    } catch(e) { Logger.log(`Error fetching streaks for weekly digest (${householdName}): ${e}`); }

    // --- Build Email Body ---
    let body = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f8f9fa; padding: 20px; border: 1px solid #ddd;">
      <div style="text-align: center; padding: 10px 0; margin-bottom: 20px;">
        <h1 style="color: #333; font-size: 24px; margin: 0;">${CONFIG.EMAIL_SUBJECTS.WEEKLY_DIGEST}</h1>
        <p style="color: #666; margin: 5px 0;">${householdName} Summary: ${weekStartFormatted} to ${weekEndFormatted}</p>
      </div>

      <!-- Final Score -->
      <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center;">
        <h2 style="font-size: 28px; margin: 0 0 10px 0; color: ${finalWeekScore >= 0 ? CONFIG.COLORS.CHART_POSITIVE : CONFIG.COLORS.CHART_NEGATIVE};">
          FINAL WEEK SCORE: ${finalWeekScore >= 0 ? '+' : ''}${finalWeekScore}
        </h2>
        <p style="color: #666; margin: 0;">
          Base Points: ${basePoints} | Bonus Points Earned: +${totalBonusPointsEarned}
        </p>
      </div>`;

    // --- Goals Completed Last Week ---
    const hasAchievements = completedGoalsList.length > 0 || gradSchoolBonusPoints > 0;
    if (hasAchievements) {
       body += `
       <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
         <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">🏆 Goals & Bonuses Achieved (Last Week):</h3>
         <ul style="padding-left: 20px; list-style: '✅ '; margin: 0; line-height: 1.5;">`;
       if (gradSchoolBonusPoints > 0) {
            body += `<li style="margin-bottom: 10px;"><strong>Grad School Blocks:</strong> +${gradSchoolBonusPoints} points (${gradCount} times)</li>`;
       }
       completedGoalsList.forEach(goal => {
           body += `<li style="margin-bottom: 10px;"><strong>${goal.name}:</strong> +${goal.bonusPoints} points</li>`;
       });
       body += `</ul></div>`;
    }

    // --- Current Streaks Section ---
    const buildingStreaks = streakData.buildingStreaks || {};
    const fullStreaks = streakData.streaks || {};
    const hasBuildingStreaks = Object.keys(buildingStreaks).length > 0;
    const hasFullStreaks = Object.keys(fullStreaks).length > 0;
    if (hasBuildingStreaks || hasFullStreaks) {
        body += `
        <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">🔥 Current Streaks (Going into this week):</h3>`;

        // Get current streak settings for display thresholds
        const streakSettings = getCurrentStreakSettings();

        if (hasFullStreaks) {
            body += `<h4 style="margin-bottom: 5px; color: #555;">Active Streaks (3+ Days):</h4><ul style="padding-left: 20px; margin: 0 0 15px 0; list-style-type: none;">`;
            for (const activityName in fullStreaks) {
               const length = fullStreaks[activityName];
               const streakEmoji = length >= streakSettings.thresholds.MULTIPLIER ? "🔥🔥🔥" :
                                 (length >= streakSettings.thresholds.BONUS_2 ? "🔥🔥" : "🔥");
               body += `<li style="margin-bottom: 5px;">${streakEmoji} <strong>${activityName}</strong>: ${length} days</li>`;
            }
            body += `</ul>`;
        }
        if (hasBuildingStreaks) {
             body += `<h4 style="margin-bottom: 5px; color: #555;">Building Streaks (2 Days):</h4><ul style="padding-left: 20px; margin: 0; list-style-type: none;">`;
            for (const activityName in buildingStreaks) {
                body += `<li style="margin-bottom: 5px;">🔥 <strong>${activityName}</strong>: ${buildingStreaks[activityName]} days</li>`;
            }
             body += `</ul>`;
        }
        body += `</div>`;
    }

    // --- Past Week Stats Section ---
    body += `
    <div style="background-color: #fff; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">📊 Past Week Stats (${householdName}):</h3>
      <p><strong>Total Points (Base):</strong> ${basePoints}</p>
      <p><strong>Total Positive Activities:</strong> ${pastWeekSummary.positive || 0}</p>
      <p><strong>Total Negative Activities:</strong> ${pastWeekSummary.negative || 0}</p>
      <p><strong>Top Activity:</strong> ${pastWeekSummary.topActivity || "None"} (${pastWeekSummary.topActivityCount || 0} times)</p>
    </div>

    <!-- Footer & Links -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="${getScriptUrl()}" style="display: inline-block; background-color: ${CONFIG.COLORS.HEADER_BG}; color: white; text-decoration: none; padding: 12px 30px; border-radius: 4px; font-weight: bold;">VIEW DASHBOARD</a>
    </div>
    <div style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
      <p>Budget Game Weekly Summary</p>
    </div>
  </div>`;

    return { body, subject };
}

/**
 * Helper function to get yesterday's points and activity count from Dashboard.
 * Filters by household emails if provided.
 * @param {Array<string>} [householdEmails=null] Optional array of emails to filter by household.
 * @return {object} { points: number|null, activityCount: number }
 */
function getYesterdaysRecapData(householdEmails = null) {
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var formattedYesterday = formatDateYMD(yesterday);

  var points = null; // Use null to indicate no data found
  var activityCount = 0;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
    if (!dashboardSheet) return { points: null, activityCount: 0 };

    const lastRow = dashboardSheet.getLastRow();
    if (lastRow < 2) return { points: null, activityCount: 0 };

    // Read Date(A), Points(B), Activities(C), Email(G)
    const data = dashboardSheet.getRange(2, 1, lastRow - 1, 7).getValues();
    let yesterdayTotalPoints = 0;
    let entriesFound = 0;
    let yesterdayActivityCount = 0;

    for (let i = data.length - 1; i >= 0; i--) { // Search backwards
      const rowData = data[i];
      const cellDate = rowData[0];
      const rowEmail = rowData[6] || "";

      if (cellDate instanceof Date && formatDateYMD(cellDate) === formattedYesterday) {
         // Filter by household if needed
         let includeRow = true;
         if (householdEmails && householdEmails.length > 0) {
             if (!householdEmails.some(he => he.toLowerCase() === rowEmail.toLowerCase())) {
                 includeRow = false;
             }
         }

         if (includeRow) {
             yesterdayTotalPoints += Number(rowData[1]) || 0; // Sum points for the household
             const activitiesStr = rowData[2] || ""; // Activities in Col C
             if (activitiesStr.trim()) {
                // Count based on entries like "➕ Activity Name..." or "➖ Activity Name..."
                const count = (activitiesStr.match(/[➕➖]\s/g) || []).length;
                yesterdayActivityCount += count;
             }
             entriesFound++;
         }
      }
    }
     // If entries were found for yesterday (for the household/user), set the points
     if (entriesFound > 0) {
         points = yesterdayTotalPoints;
         activityCount = yesterdayActivityCount;
     }

  } catch (e) {
    Logger.log(`Error fetching yesterday's data: ${e}`);
  }

  return { points: points, activityCount: activityCount };
}