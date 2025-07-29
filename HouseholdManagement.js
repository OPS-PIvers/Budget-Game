// HouseholdManagement.gs
/**
 * Gets a user's household ID from the Households sheet with improved caching and validation.
 * @param {string} email - The user's email address
 * @return {string|null} The household ID or null if not found
 */
function getUserHouseholdId(email) {
  Logger.log(`[GOALS DEBUG] getUserHouseholdId called with email: ${email}`);
  
  if (!email || !CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
    Logger.log(`[GOALS DEBUG] Email missing or household settings disabled. Email: ${email}, Settings enabled: ${CONFIG.HOUSEHOLD_SETTINGS.ENABLED}`);
    return null;
  }
  
  // Normalize email for consistency
  const normalizedEmail = String(email).trim().toLowerCase();
  Logger.log(`[GOALS DEBUG] Normalized email: ${normalizedEmail}`);

  // Check cache first
  const cache = CacheService.getScriptCache();
  const cacheKey = `household_${normalizedEmail}`;
  try {
    const cachedId = cache.get(cacheKey);
    if (cachedId) {
      Logger.log(`[GOALS DEBUG] Found cached household ID: ${cachedId}`);
      return cachedId === "null" ? null : cachedId; // Handle null stored as string
    }
    Logger.log(`[GOALS DEBUG] No cached household ID found, checking sheet`);
  } catch (cacheError) {
    Logger.log(`[GOALS DEBUG] Cache error in getUserHouseholdId: ${cacheError}. Will check sheet.`);
    // Continue to sheet lookup on cache error
  }

  // Not in cache, look up in sheet
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HOUSEHOLDS);

    if (!sheet) {
      Logger.log(`[GOALS DEBUG] Households sheet not found. Sheet name configured as: ${CONFIG.SHEET_NAMES.HOUSEHOLDS}`);
      cache.put(cacheKey, "null", CONFIG.HOUSEHOLD_SETTINGS.CACHE_TIME);
      return null;
    }

    const lastRow = sheet.getLastRow();
    Logger.log(`[GOALS DEBUG] Households sheet has ${lastRow} rows (including header)`);
    
    if (lastRow <= 1) {
      // Only header row exists
      Logger.log(`[GOALS DEBUG] Households sheet has no data rows`);
      cache.put(cacheKey, "null", CONFIG.HOUSEHOLD_SETTINGS.CACHE_TIME);
      return null;
    }

    // Get all email rows (Col C) and Household IDs (Col A)
    const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues(); // A2:C<lastRow>
    Logger.log(`[GOALS DEBUG] Retrieved ${data.length} rows from Households sheet`);
    
    let householdId = null;

    // Find the household for this email (case-insensitive)
    for (let i = 0; i < data.length; i++) {
      const rowId = data[i][0];      // Household ID from Col A
      const rowEmail = data[i][2];   // Email from Col C
      
      Logger.log(`[GOALS DEBUG] Row ${i + 2}: Household ID = ${rowId}, Email = ${rowEmail}`);
      
      // Skip rows with missing ID or email
      if (!rowId || !rowEmail) continue;
      
      // Normalize row email for comparison
      const normalizedRowEmail = String(rowEmail).trim().toLowerCase();
      
      if (normalizedRowEmail === normalizedEmail) {
        Logger.log(`[GOALS DEBUG] Found matching email! Household ID: ${rowId}`);
        householdId = rowId;
        break;
      }
    }

    if (!householdId) {
      Logger.log(`[GOALS DEBUG] No household found for email: ${normalizedEmail}`);
    }

    // Store in cache (even if null, to avoid repeated lookups)
    try {
      cache.put(cacheKey, householdId || "null", CONFIG.HOUSEHOLD_SETTINGS.CACHE_TIME);
    } catch (cachePutError) {
      Logger.log(`[GOALS DEBUG] Error storing household ID in cache: ${cachePutError}`);
      // Non-critical error, continue
    }

    return householdId;
  } catch (error) {
    Logger.log(`[GOALS DEBUG] Error in getUserHouseholdId for ${email}: ${error}\nStack: ${error.stack}`);
    return null; // Return null on error to avoid causing cascading failures
  }
}

/**
 * Ensures a user has a household, creating one if needed
 * @param {string} email - The user's email address
 * @return {string|null} The household ID or null if creation failed
 */
function ensureUserHasHousehold(email) {
  Logger.log(`[GOALS DEBUG] ensureUserHasHousehold called for email: ${email}`);
  
  // First check if user already has a household
  let householdId = getUserHouseholdId(email);
  if (householdId) {
    Logger.log(`[GOALS DEBUG] User already has household: ${householdId}`);
    return householdId;
  }
  
  // User doesn't have a household, create one
  try {
    Logger.log(`[GOALS DEBUG] Creating new household for user: ${email}`);
    
    const sheet = setupHouseholdsSheet();
    const newHouseholdId = `household_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    
    // Add the user to their own household
    const newRow = [
      newHouseholdId,
      `${email}'s Household`, // Household name
      email, // User email
      now // Created date
    ];
    
    Logger.log(`[GOALS DEBUG] Adding household row: [${newRow.join(', ')}]`);
    sheet.appendRow(newRow);
    
    // Clear cache to ensure fresh lookup
    const cache = CacheService.getScriptCache();
    const normalizedEmail = String(email).trim().toLowerCase();
    const cacheKey = `household_${normalizedEmail}`;
    cache.remove(cacheKey);
    
    Logger.log(`[GOALS DEBUG] Successfully created household ${newHouseholdId} for user ${email}`);
    return newHouseholdId;
    
  } catch (error) {
    Logger.log(`[GOALS DEBUG] Error creating household for user ${email}: ${error.message}\nStack: ${error.stack}`);
    return null;
  }
}

/**
 * Gets all email addresses in a household with improved caching and validation.
 * @param {string} householdId - The household ID
 * @return {Array<string>} Array of email addresses, or empty array if not found
 */
function getHouseholdEmails(householdId) {
  if (!householdId || !CONFIG.HOUSEHOLD_SETTINGS.ENABLED) return [];

  // Check cache first
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = `household_members_${householdId}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      try { 
        const emails = JSON.parse(cachedData);
        if (Array.isArray(emails)) {
          return emails; 
        }
      } catch(e) { 
        Logger.log(`Warning: Error parsing household member cache: ${e}`);
        // Continue to fetch from sheet
      }
    }
  } catch (cacheError) {
    Logger.log(`Warning: Cache error in getHouseholdEmails: ${cacheError}`);
    // Continue to sheet lookup on cache error
  }

  // Not in cache or cache error, look up in sheet
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HOUSEHOLDS);

    if (!sheet) {
      Logger.log("Households sheet not found in getHouseholdEmails");
      return [];
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return []; // Only header row exists
    }

    // Get all household data (Col A and Col C)
    const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues(); // A2:C<lastRow>
    const emails = [];

    // Find all emails for this household
    for (let i = 0; i < data.length; i++) {
      const rowId = data[i][0];       // Household ID from Col A
      const rowEmail = data[i][2];    // Email from Col C
      
      // Skip rows with missing ID or email
      if (!rowId || !rowEmail) continue;
      
      if (rowId === householdId) {
        // Normalize email for consistency
        const normalizedEmail = String(rowEmail).trim();
        if (normalizedEmail) {
          emails.push(normalizedEmail);
        }
      }
    }

    // Store in cache if we found emails
    try {
      const cache = CacheService.getScriptCache();
      cache.put(`household_members_${householdId}`, JSON.stringify(emails), CONFIG.HOUSEHOLD_SETTINGS.CACHE_TIME);
    } catch(e) { 
      Logger.log(`Warning: Error putting household members in cache: ${e}`);
      // Non-critical error, continue
    }

    return emails;
  } catch (error) {
    Logger.log(`Error in getHouseholdEmails for ${householdId}: ${error}\nStack: ${error.stack}`);
    return []; // Return empty array on error to avoid causing cascading failures
  }
}

/**
 * Clears household related caches for a specific household or user.
 * Should be called after any household membership changes.
 * @param {string} householdId - The household ID to clear
 * @param {Array<string>} [affectedEmails] - Optional list of affected emails
 */
function clearHouseholdCaches(householdId, affectedEmails = []) {
  try {
    const cache = CacheService.getScriptCache();
    const cachesToClear = [];
    
    // Always clear the household members cache
    if (householdId) {
      cachesToClear.push(`household_members_${householdId}`);
    }
    
    // Clear individual user caches if provided
    if (Array.isArray(affectedEmails) && affectedEmails.length > 0) {
      affectedEmails.forEach(email => {
        if (email) {
          const normalizedEmail = String(email).trim().toLowerCase();
          cachesToClear.push(`household_${normalizedEmail}`);
        }
      });
    } else if (householdId) {
      // If no emails provided but we have householdId, fetch and clear all members
      try {
        // Get current members directly from sheet (avoid cache)
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HOUSEHOLDS);
        
        if (sheet && sheet.getLastRow() > 1) {
          const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
          
          data.forEach(row => {
            if (row[0] === householdId && row[2]) {
              const memberEmail = String(row[2]).trim().toLowerCase();
              cachesToClear.push(`household_${memberEmail}`);
            }
          });
        }
      } catch (lookupError) {
        Logger.log(`Warning: Error getting household members for cache clearing: ${lookupError}`);
        // Non-critical, continue with what we have
      }
    }
    
    // Batch delete the caches
    if (cachesToClear.length > 0) {
      cache.removeAll(cachesToClear);
      Logger.log(`Cleared ${cachesToClear.length} household-related caches: ${cachesToClear.join(', ')}`);
    }
  } catch (error) {
    Logger.log(`Warning: Error clearing household caches: ${error}`);
    // Non-critical function, don't propagate error
  }
}

/**
 * Gets all households data for admin display.
 * @return {Array} Array of household data objects { id, name, members: [{ email, dateAdded }] }.
 */
function getHouseholdAdminData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HOUSEHOLDS);

  if (!sheet) {
    Logger.log("Households sheet not found for admin data.");
    return [];
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return []; // Only header row exists
  }

  // Read all data A:D
  const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const households = {}; // Use object map for grouping by ID

  // Process and organize data
  for (let i = 0; i < data.length; i++) {
    const id = data[i][0]; // Col A
    const name = data[i][1]; // Col B
    const email = data[i][2]; // Col C
    const dateAdded = data[i][3]; // Col D

    if (!id || !name || !email) {
        Logger.log(`Skipping incomplete household row in admin data: ${data[i]}`);
        continue; // Skip incomplete rows
    }

    if (!households[id]) {
      households[id] = {
        id: id,
        name: name,
        members: []
      };
    }

    // Ensure consistent household name if multiple entries exist (use the first encountered)
    if (!households[id].name) households[id].name = name;

    households[id].members.push({
      email: email,
      dateAdded: dateAdded instanceof Date ?
        Utilities.formatDate(dateAdded, Session.getScriptTimeZone(), CONFIG.DATE_FORMAT_SHORT) :
        "Unknown"
    });
  }

  // Convert map values to array and sort by name
  return Object.values(households).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Adds a new household with an initial member.
 * Called from Web App Admin.
 * @param {string} name - The name of the household
 * @param {string} userEmail - The initial user's email
 * @return {Object} Result object with success status and message
 */
function addHousehold(name, userEmail) {
  if (!CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
    return { success: false, message: "Household feature is disabled." };
  }
  if (!name || !userEmail) {
    return { success: false, message: "Household name and user email are required" };
  }
   if (!userEmail.includes('@')) { // Basic email validation
      return { success: false, message: "Invalid email format provided." };
   }

  try {
    // Make sure the sheet exists
    const sheet = setupHouseholdsSheet(); // Use setup function to ensure it exists

    // Check if user already belongs to a household
    const existingHouseholdId = getUserHouseholdId(userEmail);
    if (existingHouseholdId) {
      const existingHouseholdName = getHouseholdName(existingHouseholdId);
      return {
        success: false,
        message: `User ${userEmail} already belongs to household "${existingHouseholdName || existingHouseholdId}". Please remove them first.`
      };
    }

    // Generate a new UUID for the household
    const householdId = Utilities.getUuid();

    // Add the new household with the initial user
    const newRow = [
      householdId,
      name.trim(), // Trim name
      userEmail.trim(), // Trim email
      new Date()
    ];

    // Append row safely
    sheet.appendRow(newRow);

    // Clear cache for this user
    const cache = CacheService.getScriptCache();
    cache.remove(`household_${userEmail.trim().toLowerCase()}`); // Use trimmed/lowercase

    return {
      success: true,
      message: `Created household "${name}" with user ${userEmail}`,
      householdId: householdId
    };
  } catch (error) {
    Logger.log(`Error adding household: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error: ${error.message}` };
  }
}

/**
 * Adds a user to an existing household with improved validation and cache clearing.
 * Called from Web App Admin.
 * @param {string} householdId - The household ID
 * @param {string} userEmail - The user's email to add
 * @return {Object} Result object with success status and message
 */
function addUserToHousehold(householdId, userEmail) {
  if (!CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
    return { success: false, message: "Household feature is disabled." };
  }
  if (!householdId || !userEmail) {
    return { success: false, message: "Household ID and user email are required" };
  }
  
  // Validate email format
  const normalizedEmail = String(userEmail).trim();
  if (!normalizedEmail.includes('@')) {
    return { success: false, message: "Invalid email format provided." };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HOUSEHOLDS);

    if (!sheet) {
      return { success: false, message: "Households sheet not found" };
    }

    // Check if user already belongs to a household
    const existingHouseholdId = getUserHouseholdId(normalizedEmail);
    if (existingHouseholdId) {
      if (existingHouseholdId === householdId) {
        return {
          success: false,
          message: `User ${normalizedEmail} is already a member of this household.`
        };
      } else {
        const existingHouseholdName = getHouseholdName(existingHouseholdId);
        return {
          success: false,
          message: `User ${normalizedEmail} already belongs to household "${existingHouseholdName || existingHouseholdId}". Please remove them first.`
        };
      }
    }

    // Find the household to get its name
    const lastRow = sheet.getLastRow();
    let householdName = null;
    if (lastRow > 1) {
      const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // HouseholdID, HouseholdName
      for (let i = 0; i < data.length; i++) {
        if (data[i][0] === householdId) {
          householdName = data[i][1];
          break;
        }
      }
    }

    if (!householdName) {
      return { success: false, message: `Household ID ${householdId} not found` };
    }

    // Add the user to the household
    const newRow = [
      householdId,
      householdName,
      normalizedEmail,
      new Date()
    ];

    sheet.appendRow(newRow);

    // Clear relevant caches
    clearHouseholdCaches(householdId, [normalizedEmail]);

    return {
      success: true,
      message: `Added user ${normalizedEmail} to household "${householdName}"`
    };
  } catch (error) {
    Logger.log(`Error adding user to household: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error: ${error.message}` };
  }
}


/**
 * Removes a user from a household with improved validation and cache handling.
 * Called from Web App Admin.
 * @param {string} householdId - The household ID
 * @param {string} userEmail - The user's email to remove
 * @return {Object} Result object with success status and message
 */
function removeUserFromHousehold(householdId, userEmail) {
  if (!CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
    return { success: false, message: "Household feature is disabled." };
  }
  if (!householdId || !userEmail) {
    return { success: false, message: "Household ID and user email are required" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HOUSEHOLDS);

    if (!sheet) {
      return { success: false, message: "Households sheet not found" };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { success: false, message: "No household data found" };
    }

    // Find the user in the household (case-insensitive)
    const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues(); // A:C
    let rowToDelete = -1;
    const normalizedEmail = String(userEmail).trim().toLowerCase();

    for (let i = data.length - 1; i >= 0; i--) { // Iterate backwards for safe deletion
      const rowId = data[i][0];
      const rowEmail = data[i][2];
      
      if (!rowId || !rowEmail) continue;
      
      if (rowId === householdId && String(rowEmail).trim().toLowerCase() === normalizedEmail) {
        rowToDelete = i + 2; // +2 because data starts at row 2 and i is 0-based
        break;
      }
    }

    if (rowToDelete === -1) {
      return {
        success: false,
        message: `User ${userEmail} not found in household ${householdId}`
      };
    }

    // Save household name before deletion
    let householdName = null;
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === householdId && data[i][1]) {
        householdName = data[i][1];
        break;
      }
    }

    // Delete the row
    sheet.deleteRow(rowToDelete);
    Logger.log(`Deleted row ${rowToDelete} for user ${userEmail} from household ${householdId}`);

    // Clear relevant caches
    clearHouseholdCaches(householdId, [normalizedEmail]);

    // Check remaining members
    const remainingData = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues() : [];
    const remainingMembers = remainingData.filter(row => row[0] === householdId).length;

    let message = `Removed ${userEmail} from household`;
    if (householdName) {
      message += ` "${householdName}"`;
    }
    
    if (remainingMembers === 0) {
      message += ". This was the last member, so the household is now empty.";
    }

    return {
      success: true,
      message: message,
      remainingMembers: remainingMembers
    };
  } catch (error) {
    Logger.log(`Error removing user from household: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error: ${error.message}` };
  }
}


/**
 * Deletes a household and all its user assignments.
 * Called from Web App Admin.
 * @param {string} householdId - The household ID to delete
 * @return {Object} Result object with success status and message
 */
function deleteHousehold(householdId) {
  if (!CONFIG.HOUSEHOLD_SETTINGS.ENABLED) {
    return { success: false, message: "Household feature is disabled." };
  }
  if (!householdId) {
    return { success: false, message: "Household ID is required" };
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HOUSEHOLDS);

    if (!sheet) {
      return { success: false, message: "Households sheet not found" };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { success: false, message: "No household data found" };
    }

    // Find all rows for this household (in reverse order for safe deletion)
    const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues(); // A:C
    const rowsToDelete = [];
    let householdName = null;
    const membersToDelete = [];

    for (let i = data.length - 1; i >= 0; i--) { // Iterate backwards
      if (data[i][0] === householdId) {
        rowsToDelete.push(i + 2); // +2 for sheet row index
        if (!householdName && data[i][1]) { // Get name from Col B
          householdName = data[i][1];
        }
        if (data[i][2]) { // Get email from Col C
            membersToDelete.push(data[i][2].toString().trim().toLowerCase());
        }
      }
    }

    if (rowsToDelete.length === 0) {
      return { success: false, message: `Household ${householdId} not found` };
    }

    // Delete rows
    rowsToDelete.forEach(rowNum => {
      sheet.deleteRow(rowNum);
    });
    Logger.log(`Deleted ${rowsToDelete.length} rows for household ${householdId} ("${householdName}")`);


    // Clear caches
    const cache = CacheService.getScriptCache();
    cache.remove(`household_members_${householdId}`);
    // Clear each member's cache
    membersToDelete.forEach(emailLower => {
      cache.remove(`household_${emailLower}`);
    });

    return {
      success: true,
      message: `Deleted household "${householdName || householdId}" with ${rowsToDelete.length} members`
    };
  } catch (error) {
    Logger.log(`Error deleting household: ${error}\nStack: ${error.stack}`);
    return { success: false, message: `Error: ${error.message}` };
  }
}

/**
 * Gets the name of a household based on its ID.
 * @param {string} householdId - The household ID
 * @return {string|null} The household name or null if not found
 */
function getHouseholdName(householdId) {
  if (!householdId || !CONFIG.HOUSEHOLD_SETTINGS.ENABLED) return null;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.HOUSEHOLDS);

  if (!sheet) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;

  // Read ID (A) and Name (B) columns
  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // A:B

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === householdId) {
      return data[i][1] || null; // Return name from Col B
    }
  }

  return null; // Not found
}

/**
 * Determines if the current user is an admin based on CONFIG.
 * @return {boolean} True if the current user is an admin
 */
function isCurrentUserAdmin() {
  try {
     const email = Session.getEffectiveUser().getEmail();
     // Ensure ADMIN_EMAILS is an array before checking
     return Array.isArray(CONFIG.ADMIN_EMAILS) && CONFIG.ADMIN_EMAILS.includes(email);
  } catch (e) {
     // If user isn't logged in or permissions error occurs
     Logger.log("Error getting effective user email in isCurrentUserAdmin: " + e);
     return false;
  }
}