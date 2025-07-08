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
    const sheet = setupGoalsSheet();
    const goalId = generateGoalId();
    const now = new Date();
    
    // Validate goal data
    if (!goalData.goalName || !goalData.goalType || !goalData.targetAmount || !goalData.householdId) {
      throw new Error("Missing required goal data");
    }
    
    if (!CONFIG.GOAL_TYPES.includes(goalData.goalType)) {
      throw new Error(`Invalid goal type: ${goalData.goalType}`);
    }
    
    // Check goal limit per household
    const existingGoals = getGoalsByHousehold(goalData.householdId);
    if (existingGoals.length >= CONFIG.GOAL_SETTINGS.MAX_GOALS_PER_HOUSEHOLD) {
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
    
    sheet.appendRow(newRow);
    clearGoalCache();
    
    Logger.log(`Created new goal: ${goalId} - ${goalData.goalName}`);
    return goalId;
    
  } catch (error) {
    Logger.log(`Error creating goal: ${error.message}`);
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
    const cached = getGoalCache(householdId);
    if (cached) {
      return cached;
    }
    
    const sheet = setupGoalsSheet();
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      return [];
    }
    
    const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    const goals = data
      .filter(row => row[8] === householdId) // Filter by household
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
        lastUpdated: row[9]
      }));
    
    setGoalCache(householdId, goals);
    return goals;
    
  } catch (error) {
    Logger.log(`Error getting goals for household ${householdId}: ${error.message}`);
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