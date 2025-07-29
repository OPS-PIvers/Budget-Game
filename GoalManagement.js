// GoalManagement.js
/**
 * Functions for managing visual goal tracking in the Budget Game
 * Handles CRUD operations for debt, savings, and vacation fund goals
 */

/**
 * Creates a new goal in the Goals sheet
 * @param {Object} goalData - The goal data object
 * @param {string} goalData.goalName - Name of the goal
 * @param {string} goalData.goalType - Type of goal (debt, savings, vacation_fund)
 * @param {number} goalData.targetAmount - Target amount for the goal
 * @param {number} goalData.currentAmount - Current amount/balance
 * @param {Date} goalData.targetDate - Target completion date
 * @param {string} goalData.householdId - Household ID for the goal
 * @return {string} The generated goal ID
 */
function createGoal(goalData) {
  try {
    Logger.log(`[GOALS DEBUG] createGoal called with data: ${JSON.stringify(goalData)}`);
    
    const sheet = setupGoalsSheet();
    const goalId = generateGoalId();
    const now = new Date();
    
    Logger.log(`[GOALS DEBUG] Generated goal ID: ${goalId}`);
    
    // Validate goal data
    if (!goalData.goalName || !goalData.goalType || !goalData.targetAmount || !goalData.householdId) {
      const missingFields = [];
      if (!goalData.goalName) missingFields.push('goalName');
      if (!goalData.goalType) missingFields.push('goalType');
      if (!goalData.targetAmount) missingFields.push('targetAmount');
      if (!goalData.householdId) missingFields.push('householdId');
      Logger.log(`[GOALS DEBUG] Missing required goal data: ${missingFields.join(', ')}`);
      throw new Error(`Missing required goal data: ${missingFields.join(', ')}`);
    }
    
    if (!CONFIG.GOAL_TYPES.includes(goalData.goalType)) {
      Logger.log(`[GOALS DEBUG] Invalid goal type: ${goalData.goalType}. Valid types: ${CONFIG.GOAL_TYPES.join(', ')}`);
      throw new Error(`Invalid goal type: ${goalData.goalType}`);
    }
    
    // Check goal limit per household
    const existingGoals = getGoalsByHousehold(goalData.householdId);
    Logger.log(`[GOALS DEBUG] Found ${existingGoals.length} existing goals for household ${goalData.householdId}`);
    
    if (existingGoals.length >= CONFIG.GOAL_SETTINGS.MAX_GOALS_PER_HOUSEHOLD) {
      Logger.log(`[GOALS DEBUG] Goal limit exceeded: ${existingGoals.length} >= ${CONFIG.GOAL_SETTINGS.MAX_GOALS_PER_HOUSEHOLD}`);
      throw new Error(`Maximum ${CONFIG.GOAL_SETTINGS.MAX_GOALS_PER_HOUSEHOLD} goals per household`);
    }
    
    const newRow = [
      goalId,
      goalData.goalName,
      goalData.goalType,
      goalData.targetAmount,
      goalData.currentAmount || 0,
      goalData.startDate || now,
      goalData.targetDate || new Date(now.getTime() + (CONFIG.GOAL_SETTINGS.DEFAULT_GOAL_DURATION_MONTHS * 30 * 24 * 60 * 60 * 1000)),
      "active",
      goalData.householdId,
      now
    ];
    
    Logger.log(`[GOALS DEBUG] About to append row to Goals sheet: [${newRow.join(', ')}]`);
    sheet.appendRow(newRow);
    clearGoalCache();
    
    Logger.log(`[GOALS DEBUG] Successfully created new goal: ${goalId} - ${goalData.goalName} for household ${goalData.householdId}`);
    return goalId;
    
  } catch (error) {
    Logger.log(`[GOALS DEBUG] Error creating goal: ${error.message}\nStack: ${error.stack}`);
    throw error;
  }
}

/**
 * Updates an existing goal
 * @param {string} goalId - The goal ID to update
 * @param {Object} updateData - The data to update
 * @return {boolean} Success status
 */
function updateGoal(goalId, updateData) {
  try {
    const sheet = setupGoalsSheet();
    const goalRow = findGoalRow(goalId);
    
    if (!goalRow) {
      throw new Error(`Goal not found: ${goalId}`);
    }
    
    // Update allowed fields
    const allowedFields = ['goalName', 'targetAmount', 'currentAmount', 'targetDate', 'status'];
    const updates = {};
    
    for (const field of allowedFields) {
      if (updateData.hasOwnProperty(field)) {
        updates[field] = updateData[field];
      }
    }
    
    // Map fields to column numbers
    const columnMap = {
      goalName: 2,
      targetAmount: 4,
      currentAmount: 5,
      targetDate: 7,
      status: 8
    };
    
    // Apply updates
    for (const [field, value] of Object.entries(updates)) {
      if (columnMap[field]) {
        sheet.getRange(goalRow, columnMap[field]).setValue(value);
      }
    }
    
    // Update LastUpdated
    sheet.getRange(goalRow, 10).setValue(new Date());
    
    clearGoalCache();
    Logger.log(`Updated goal: ${goalId}`);
    return true;
    
  } catch (error) {
    Logger.log(`Error updating goal: ${error.message}`);
    throw error;
  }
}

/**
 * Deletes a goal
 * @param {string} goalId - The goal ID to delete
 * @return {boolean} Success status
 */
function deleteGoal(goalId) {
  try {
    const sheet = setupGoalsSheet();
    const goalRow = findGoalRow(goalId);
    
    if (!goalRow) {
      throw new Error(`Goal not found: ${goalId}`);
    }
    
    sheet.deleteRow(goalRow);
    clearGoalCache();
    
    Logger.log(`Deleted goal: ${goalId}`);
    return true;
    
  } catch (error) {
    Logger.log(`Error deleting goal: ${error.message}`);
    throw error;
  }
}

/**
 * Gets all goals for a specific household
 * @param {string} householdId - The household ID
 * @return {Array} Array of goal objects
 */
function getGoalsByHousehold(householdId) {
  try {
    Logger.log(`[GOALS DEBUG] getGoalsByHousehold called with householdId: ${householdId}`);
    
    const cached = getGoalCache(householdId);
    if (cached) {
      Logger.log(`[GOALS DEBUG] Found cached goals for household ${householdId}: ${cached.length} goals`);
      return cached;
    }
    
    const sheet = setupGoalsSheet();
    const lastRow = sheet.getLastRow();
    Logger.log(`[GOALS DEBUG] Goals sheet has ${lastRow} rows (including header)`);
    
    if (lastRow <= 1) {
      Logger.log(`[GOALS DEBUG] Goals sheet has no data rows, returning empty array`);
      return [];
    }
    
    const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    Logger.log(`[GOALS DEBUG] Retrieved ${data.length} rows from Goals sheet`);
    
    // Log all household IDs found in the sheet for debugging
    const allHouseholdIds = data.map(row => row[8]).filter(id => id);
    Logger.log(`[GOALS DEBUG] All household IDs in Goals sheet: ${JSON.stringify([...new Set(allHouseholdIds)])}`);
    
    // Detailed debugging of target household ID
    Logger.log(`[GOALS DEBUG] Target household ID: "${householdId}"`);
    Logger.log(`[GOALS DEBUG] Target household ID type: ${typeof householdId}`);
    Logger.log(`[GOALS DEBUG] Target household ID length: ${String(householdId).length}`);
    Logger.log(`[GOALS DEBUG] Target household ID char codes: ${Array.from(String(householdId)).map(c => c.charCodeAt(0)).join(',')}`);
    
    const normalizedTargetId = normalizeHouseholdId(householdId);
    Logger.log(`[GOALS DEBUG] Normalized target household ID: "${normalizedTargetId}"`);
    
    const goals = data
      .filter(row => {
        const sheetHouseholdId = row[8];
        const normalizedSheetId = normalizeHouseholdId(sheetHouseholdId);
        
        // Try multiple comparison methods for comprehensive debugging
        const strictMatch = sheetHouseholdId === householdId;
        const normalizedMatch = normalizedSheetId === normalizedTargetId;
        
        // Log key comparison information for each goal
        Logger.log(`[GOALS DEBUG] Goal ${row[0]} (${row[1]}): Sheet="${sheetHouseholdId}" vs Target="${householdId}" | Strict=${strictMatch} | Normalized=${normalizedMatch}`);
        
        // Log detailed debugging only for first goal or mismatches to reduce log volume
        const isFirstGoal = row === data[0];
        if (isFirstGoal || (!normalizedMatch && row[0])) {
          Logger.log(`[GOALS DEBUG] - Sheet household ID: "${sheetHouseholdId}" (type: ${typeof sheetHouseholdId}, length: ${String(sheetHouseholdId).length})`);
          Logger.log(`[GOALS DEBUG] - Normalized sheet ID: "${normalizedSheetId}"`);
          Logger.log(`[GOALS DEBUG] - Target household ID: "${householdId}" (type: ${typeof householdId}, length: ${String(householdId).length})`);
          Logger.log(`[GOALS DEBUG] - Normalized target ID: "${normalizedTargetId}"`);
          Logger.log(`[GOALS DEBUG] - String comparison: ${String(sheetHouseholdId) === String(householdId)}`);
          Logger.log(`[GOALS DEBUG] - Trimmed comparison: ${String(sheetHouseholdId).trim() === String(householdId).trim()}`);
        }
        
        if (!normalizedMatch && row[0]) {
          Logger.log(`[GOALS DEBUG] MISMATCH: Goal ${row[0]} (${row[1]}) has normalized ID "${normalizedSheetId}", looking for "${normalizedTargetId}"`);
        } else if (normalizedMatch) {
          Logger.log(`[GOALS DEBUG] ✓ MATCH FOUND: Goal ${row[0]} (${row[1]}) matches household "${normalizedTargetId}"`);
        }
        
        // Use the normalized comparison instead of strict equality
        return normalizedMatch;
      })
      .map(row => ({
        goalId: row[0],
        goalName: row[1],
        goalType: row[2],
        targetAmount: row[3],
        currentAmount: row[4],
        startDate: row[5] ? (row[5] instanceof Date ? row[5].toISOString() : row[5]) : null,
        targetDate: row[6] ? (row[6] instanceof Date ? row[6].toISOString() : row[6]) : null,
        status: row[7],
        householdId: row[8],
        lastUpdated: row[9] ? (row[9] instanceof Date ? row[9].toISOString() : row[9]) : null
      }));
    
    Logger.log(`[GOALS DEBUG] Filtered to ${goals.length} goals for household ${householdId}`);
    if (goals.length > 0) {
      Logger.log(`[GOALS DEBUG] Found goals: ${goals.map(g => `${g.goalId} (${g.goalName})`).join(', ')}`);
    }
    
    setGoalCache(householdId, goals);
    return goals;
    
  } catch (error) {
    Logger.log(`[GOALS DEBUG] Error getting goals for household ${householdId}: ${error.message}\nStack: ${error.stack}`);
    return [];
  }
}

/**
 * Gets a specific goal by ID
 * @param {string} goalId - The goal ID
 * @return {Object|null} Goal object or null if not found
 */
function getGoalById(goalId) {
  try {
    const sheet = setupGoalsSheet();
    const goalRow = findGoalRow(goalId);
    
    if (!goalRow) {
      return null;
    }
    
    const data = sheet.getRange(goalRow, 1, 1, 10).getValues()[0];
    return {
      goalId: data[0],
      goalName: data[1],
      goalType: data[2],
      targetAmount: data[3],
      currentAmount: data[4],
      startDate: data[5],
      targetDate: data[6],
      status: data[7],
      householdId: data[8],
      lastUpdated: data[9]
    };
    
  } catch (error) {
    Logger.log(`Error getting goal ${goalId}: ${error.message}`);
    return null;
  }
}

/**
 * Updates the current amount for a goal (used for periodic balance updates)
 * @param {string} goalId - The goal ID
 * @param {number} newAmount - The new current amount
 * @return {boolean} Success status
 */
function updateGoalAmount(goalId, newAmount) {
  try {
    const goal = getGoalById(goalId);
    if (!goal) {
      throw new Error(`Goal not found: ${goalId}`);
    }
    
    // Check if goal should be marked as completed
    let status = goal.status;
    if (goal.goalType === 'debt' && newAmount <= 0) {
      status = 'completed';
    } else if (goal.goalType === 'savings' && newAmount >= goal.targetAmount) {
      status = 'completed';
    }
    
    return updateGoal(goalId, { 
      currentAmount: newAmount,
      status: status
    });
    
  } catch (error) {
    Logger.log(`Error updating goal amount: ${error.message}`);
    throw error;
  }
}

/**
 * Calculates progress percentage for a goal
 * @param {Object} goal - The goal object
 * @return {number} Progress percentage (0-100)
 */
function calculateGoalProgress(goal) {
  try {
    if (!goal || goal.status === 'completed') {
      return 100;
    }
    
    switch (goal.goalType) {
      case 'debt':
        // For debt, progress is reduction from target to current
        if (goal.targetAmount <= 0) return 100;
        const debtProgress = ((goal.targetAmount - goal.currentAmount) / goal.targetAmount) * 100;
        return Math.max(0, Math.min(100, debtProgress));
        
      case 'savings':
      case 'vacation_fund':
        // For savings, progress is current amount toward target
        if (goal.targetAmount <= 0) return 100;
        const savingsProgress = (goal.currentAmount / goal.targetAmount) * 100;
        return Math.max(0, Math.min(100, savingsProgress));
        
      default:
        return 0;
    }
    
  } catch (error) {
    Logger.log(`Error calculating progress for goal ${goal.goalId}: ${error.message}`);
    return 0;
  }
}

// --- Helper Functions ---

/**
 * Normalizes an ID for safe comparison
 * Handles null/undefined values, trims whitespace, and ensures string comparison
 * @param {*} id - The ID to normalize
 * @return {string} Normalized ID as string
 */
function normalizeHouseholdId(id) {
  if (id === null || id === undefined) {
    return '';
  }
  return String(id).trim();
}

/**
 * Generates a unique goal ID
 * @return {string} Unique goal ID
 */
function generateGoalId() {
  return `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Finds the row number for a specific goal ID
 * @param {string} goalId - The goal ID to find
 * @return {number|null} Row number or null if not found
 */
function findGoalRow(goalId) {
  try {
    const sheet = setupGoalsSheet();
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      return null;
    }
    
    const goalIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    
    for (let i = 0; i < goalIds.length; i++) {
      if (goalIds[i][0] === goalId) {
        return i + 2; // +2 because array is 0-indexed but sheet is 1-indexed, and we start from row 2
      }
    }
    
    return null;
    
  } catch (error) {
    Logger.log(`Error finding goal row: ${error.message}`);
    return null;
  }
}

/**
 * Gets orphaned goals (goals without valid household associations)
 * @return {Array} Array of orphaned goal objects
 */
function getOrphanedGoals() {
  try {
    Logger.log(`[GOALS DEBUG] getOrphanedGoals called`);
    
    const sheet = setupGoalsSheet();
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      Logger.log(`[GOALS DEBUG] No goals found in sheet`);
      return [];
    }
    
    const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    const orphanedGoals = data
      .filter(row => !row[8] || row[8] === '') // No household ID or empty household ID
      .map(row => ({
        goalId: row[0],
        goalName: row[1],
        goalType: row[2],
        targetAmount: row[3],
        currentAmount: row[4],
        startDate: row[5],
        targetDate: row[6],
        status: row[7],
        householdId: row[8],
        lastUpdated: row[9],
        isOrphaned: true
      }));
    
    Logger.log(`[GOALS DEBUG] Found ${orphanedGoals.length} orphaned goals`);
    return orphanedGoals;
    
  } catch (error) {
    Logger.log(`[GOALS DEBUG] Error getting orphaned goals: ${error.message}\nStack: ${error.stack}`);
    return [];
  }
}

/**
 * Assigns orphaned goals to a household
 * @param {Array} goalIds - Array of goal IDs to assign
 * @param {string} householdId - The household ID to assign them to
 * @return {Object} Result object { success, message, assignedCount }
 */
function assignOrphanedGoalsToHousehold(goalIds, householdId) {
  try {
    Logger.log(`[GOALS DEBUG] Assigning ${goalIds.length} goals to household ${householdId}`);
    
    const sheet = setupGoalsSheet();
    let assignedCount = 0;
    
    for (const goalId of goalIds) {
      const goalRow = findGoalRow(goalId);
      if (goalRow) {
        sheet.getRange(goalRow, 9).setValue(householdId); // Column 9 is household ID
        assignedCount++;
        Logger.log(`[GOALS DEBUG] Assigned goal ${goalId} to household ${householdId}`);
      } else {
        Logger.log(`[GOALS DEBUG] Goal not found: ${goalId}`);
      }
    }
    
    clearGoalCache();
    
    return {
      success: true,
      message: `Successfully assigned ${assignedCount} goals to household`,
      assignedCount: assignedCount
    };
    
  } catch (error) {
    Logger.log(`[GOALS DEBUG] Error assigning orphaned goals: ${error.message}\nStack: ${error.stack}`);
    return {
      success: false,
      message: `Error assigning goals: ${error.message}`,
      assignedCount: 0
    };
  }
}

/**
 * Gets goals for a user by email (fallback for when household lookup fails)
 * @param {string} email - The user's email address
 * @return {Array} Array of goal objects that might belong to this user
 */
function getGoalsByUserEmail(email) {
  try {
    Logger.log(`[GOALS DEBUG] getGoalsByUserEmail called for: ${email}`);
    
    const sheet = setupGoalsSheet();
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      return [];
    }
    
    const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    
    // Look for goals that might belong to this user
    // This is a heuristic approach - we'll look for goals with no household ID
    // that were created around the same time as user activity
    const potentialUserGoals = data
      .filter(row => !row[8] || row[8] === '') // No household ID
      .map(row => ({
        goalId: row[0],
        goalName: row[1],
        goalType: row[2],
        targetAmount: row[3],
        currentAmount: row[4],
        startDate: row[5],
        targetDate: row[6],
        status: row[7],
        householdId: row[8],
        lastUpdated: row[9],
        isPotentialMatch: true
      }));
    
    Logger.log(`[GOALS DEBUG] Found ${potentialUserGoals.length} potential goals for user ${email}`);
    return potentialUserGoals;
    
  } catch (error) {
    Logger.log(`[GOALS DEBUG] Error getting goals by user email: ${error.message}\nStack: ${error.stack}`);
    return [];
  }
}

// --- Caching Functions ---

let goalCache = {};

/**
 * Gets cached goal data
 * @param {string} householdId - The household ID
 * @return {Array|null} Cached goals or null
 */
function getGoalCache(householdId) {
  const cacheKey = `goals_${householdId}`;
  const cached = goalCache[cacheKey];
  
  if (cached && (Date.now() - cached.timestamp) < (CONFIG.GOAL_SETTINGS.CACHE_TIME * 1000)) {
    return cached.data;
  }
  
  return null;
}

/**
 * Sets goal cache
 * @param {string} householdId - The household ID
 * @param {Array} goals - The goals to cache
 */
function setGoalCache(householdId, goals) {
  const cacheKey = `goals_${householdId}`;
  goalCache[cacheKey] = {
    data: goals,
    timestamp: Date.now()
  };
}

/**
 * Clears goal cache
 */
function clearGoalCache() {
  goalCache = {};
}