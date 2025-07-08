// GoalCalculations.js
/**
 * Advanced goal calculation logic for debt, savings, and vacation fund tracking
 * Handles complex scenarios like vacation fund activation after savings goals
 */

/**
 * Calculates comprehensive goal data for a household including vacation fund logic
 * @param {string} householdId - The household ID
 * @return {Object} Goal calculation results
 */
function calculateHouseholdGoals(householdId) {
  try {
    const goals = getGoalsByHousehold(householdId);
    const results = {
      activeGoals: [],
      completedGoals: [],
      vacationFundStatus: null,
      totalProgress: 0,
      criticalGoals: []
    };
    
    // Separate goals by type and status
    const savingsGoals = goals.filter(g => g.goalType === 'savings' && g.status === 'active');
    const debtGoals = goals.filter(g => g.goalType === 'debt' && g.status === 'active');
    const vacationGoals = goals.filter(g => g.goalType === 'vacation_fund');
    
    // Process debt goals
    for (const goal of debtGoals) {
      const progress = calculateGoalProgress(goal);
      const goalData = {
        ...goal,
        progress: progress,
        progressType: 'debt',
        displayText: `Pay off ${goal.goalName}`,
        amountRemaining: goal.currentAmount,
        monthsRemaining: calculateMonthsRemaining(goal)
      };
      
      results.activeGoals.push(goalData);
      
      // Mark as critical if overdue
      if (goal.targetDate < new Date()) {
        results.criticalGoals.push(goalData);
      }
    }
    
    // Process savings goals and check for vacation fund activation
    for (const goal of savingsGoals) {
      const progress = calculateGoalProgress(goal);
      const goalData = {
        ...goal,
        progress: progress,
        progressType: 'savings',
        displayText: `Save for ${goal.goalName}`,
        amountRemaining: goal.targetAmount - goal.currentAmount,
        monthsRemaining: calculateMonthsRemaining(goal)
      };
      
      if (progress >= 100) {
        results.completedGoals.push(goalData);
        
        // Check if this completed savings goal should activate vacation fund
        const linkedVacationGoal = findLinkedVacationGoal(goal, vacationGoals);
        if (linkedVacationGoal) {
          results.vacationFundStatus = calculateVacationFundStatus(goal, linkedVacationGoal);
        }
      } else {
        results.activeGoals.push(goalData);
      }
    }
    
    // Process vacation fund goals
    for (const goal of vacationGoals) {
      const linkedSavingsGoal = findLinkedSavingsGoal(goal, savingsGoals);
      
      if (linkedSavingsGoal && calculateGoalProgress(linkedSavingsGoal) >= 100) {
        // Vacation fund is active
        const vacationProgress = calculateVacationFundProgress(linkedSavingsGoal, goal);
        const goalData = {
          ...goal,
          progress: vacationProgress,
          progressType: 'vacation_fund',
          displayText: `${goal.goalName} Fund`,
          amountRemaining: goal.targetAmount - vacationProgress.currentAmount,
          monthsRemaining: calculateMonthsRemaining(goal),
          linkedSavingsGoal: linkedSavingsGoal.goalId
        };
        
        results.activeGoals.push(goalData);
      } else {
        // Vacation fund is waiting for savings goal completion
        const goalData = {
          ...goal,
          progress: 0,
          progressType: 'vacation_fund_waiting',
          displayText: `${goal.goalName} Fund (Waiting)`,
          amountRemaining: goal.targetAmount,
          monthsRemaining: null,
          linkedSavingsGoal: linkedSavingsGoal ? linkedSavingsGoal.goalId : null
        };
        
        results.activeGoals.push(goalData);
      }
    }
    
    // Calculate total progress
    if (results.activeGoals.length > 0) {
      results.totalProgress = results.activeGoals.reduce((sum, goal) => sum + (goal.progress || 0), 0) / results.activeGoals.length;
    }
    
    // Sort goals by priority (critical first, then by progress)
    results.activeGoals.sort((a, b) => {
      if (results.criticalGoals.includes(a) && !results.criticalGoals.includes(b)) return -1;
      if (!results.criticalGoals.includes(a) && results.criticalGoals.includes(b)) return 1;
      return (b.progress || 0) - (a.progress || 0);
    });
    
    return results;
    
  } catch (error) {
    Logger.log(`Error calculating household goals: ${error.message}`);
    return {
      activeGoals: [],
      completedGoals: [],
      vacationFundStatus: null,
      totalProgress: 0,
      criticalGoals: []
    };
  }
}

/**
 * Calculates vacation fund progress based on linked savings goal
 * @param {Object} savingsGoal - The completed savings goal
 * @param {Object} vacationGoal - The vacation fund goal
 * @return {Object} Vacation fund progress data
 */
function calculateVacationFundProgress(savingsGoal, vacationGoal) {
  try {
    // Amount above the savings target goes to vacation fund
    const excessAmount = Math.max(0, savingsGoal.currentAmount - savingsGoal.targetAmount);
    const progress = vacationGoal.targetAmount > 0 ? (excessAmount / vacationGoal.targetAmount) * 100 : 0;
    
    return {
      currentAmount: excessAmount,
      targetAmount: vacationGoal.targetAmount,
      progress: Math.min(100, progress),
      baseAmount: savingsGoal.targetAmount,
      totalSavings: savingsGoal.currentAmount
    };
    
  } catch (error) {
    Logger.log(`Error calculating vacation fund progress: ${error.message}`);
    return {
      currentAmount: 0,
      targetAmount: vacationGoal.targetAmount,
      progress: 0,
      baseAmount: savingsGoal.targetAmount,
      totalSavings: savingsGoal.currentAmount
    };
  }
}

/**
 * Calculates months remaining for a goal based on current progress
 * @param {Object} goal - The goal object
 * @return {number|null} Months remaining or null if cannot calculate
 */
function calculateMonthsRemaining(goal) {
  try {
    if (!goal.targetDate) return null;
    
    const now = new Date();
    const target = new Date(goal.targetDate);
    const monthsDiff = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
    
    return Math.max(0, monthsDiff);
    
  } catch (error) {
    Logger.log(`Error calculating months remaining: ${error.message}`);
    return null;
  }
}

/**
 * Finds a vacation goal linked to a savings goal
 * @param {Object} savingsGoal - The savings goal
 * @param {Array} vacationGoals - Array of vacation fund goals
 * @return {Object|null} Linked vacation goal or null
 */
function findLinkedVacationGoal(savingsGoal, vacationGoals) {
  // Link by naming convention or explicit linking
  // For now, assume vacation goals are linked by having similar names
  return vacationGoals.find(vg => 
    vg.goalName.toLowerCase().includes('vacation') || 
    vg.goalName.toLowerCase().includes('travel') ||
    savingsGoal.goalName.toLowerCase().includes('vacation') ||
    savingsGoal.goalName.toLowerCase().includes('travel')
  );
}

/**
 * Finds a savings goal linked to a vacation goal
 * @param {Object} vacationGoal - The vacation goal
 * @param {Array} savingsGoals - Array of savings goals
 * @return {Object|null} Linked savings goal or null
 */
function findLinkedSavingsGoal(vacationGoal, savingsGoals) {
  // Link by naming convention
  return savingsGoals.find(sg => 
    sg.goalName.toLowerCase().includes('vacation') ||
    sg.goalName.toLowerCase().includes('travel') ||
    vacationGoal.goalName.toLowerCase().includes(sg.goalName.toLowerCase())
  );
}

/**
 * Calculates vacation fund status for display
 * @param {Object} savingsGoal - The completed savings goal
 * @param {Object} vacationGoal - The vacation fund goal
 * @return {Object} Vacation fund status
 */
function calculateVacationFundStatus(savingsGoal, vacationGoal) {
  const progress = calculateVacationFundProgress(savingsGoal, vacationGoal);
  
  return {
    isActive: true,
    savingsGoalName: savingsGoal.goalName,
    vacationGoalName: vacationGoal.goalName,
    baseAmount: progress.baseAmount,
    currentVacationAmount: progress.currentAmount,
    targetVacationAmount: progress.targetAmount,
    progress: progress.progress,
    totalSavings: progress.totalSavings
  };
}

/**
 * Updates goal amounts and handles vacation fund cascading
 * @param {string} householdId - The household ID
 * @param {Array} updates - Array of {goalId, newAmount} objects
 * @return {Object} Update results
 */
function updateGoalAmounts(householdId, updates) {
  try {
    const results = {
      success: true,
      updatedGoals: [],
      completedGoals: [],
      activatedVacationFunds: [],
      errors: []
    };
    
    for (const update of updates) {
      try {
        const goal = getGoalById(update.goalId);
        if (!goal) {
          results.errors.push(`Goal not found: ${update.goalId}`);
          continue;
        }
        
        // Store old values for comparison
        const oldAmount = goal.currentAmount;
        const oldStatus = goal.status;
        
        // Update the goal
        updateGoalAmount(update.goalId, update.newAmount);
        
        // Get updated goal
        const updatedGoal = getGoalById(update.goalId);
        results.updatedGoals.push(updatedGoal);
        
        // Check if goal was completed
        if (oldStatus !== 'completed' && updatedGoal.status === 'completed') {
          results.completedGoals.push(updatedGoal);
          
          // Check for vacation fund activation
          if (updatedGoal.goalType === 'savings') {
            const householdGoals = getGoalsByHousehold(householdId);
            const vacationGoals = householdGoals.filter(g => g.goalType === 'vacation_fund');
            const linkedVacationGoal = findLinkedVacationGoal(updatedGoal, vacationGoals);
            
            if (linkedVacationGoal) {
              results.activatedVacationFunds.push({
                savingsGoal: updatedGoal,
                vacationGoal: linkedVacationGoal
              });
            }
          }
        }
        
      } catch (error) {
        results.errors.push(`Error updating goal ${update.goalId}: ${error.message}`);
      }
    }
    
    if (results.errors.length > 0) {
      results.success = false;
    }
    
    return results;
    
  } catch (error) {
    Logger.log(`Error updating goal amounts: ${error.message}`);
    return {
      success: false,
      updatedGoals: [],
      completedGoals: [],
      activatedVacationFunds: [],
      errors: [error.message]
    };
  }
}

/**
 * Gets goal summary for dashboard display
 * @param {string} householdId - The household ID
 * @return {Object} Goal summary for dashboard
 */
function getGoalSummaryForDashboard(householdId) {
  try {
    const calculations = calculateHouseholdGoals(householdId);
    
    return {
      totalActiveGoals: calculations.activeGoals.length,
      totalCompletedGoals: calculations.completedGoals.length,
      totalProgress: Math.round(calculations.totalProgress),
      criticalGoalsCount: calculations.criticalGoals.length,
      vacationFundActive: calculations.vacationFundStatus ? calculations.vacationFundStatus.isActive : false,
      topGoals: calculations.activeGoals.slice(0, 3), // Top 3 goals for display
      recentCompletions: calculations.completedGoals.slice(-2) // Last 2 completed
    };
    
  } catch (error) {
    Logger.log(`Error getting goal summary: ${error.message}`);
    return {
      totalActiveGoals: 0,
      totalCompletedGoals: 0,
      totalProgress: 0,
      criticalGoalsCount: 0,
      vacationFundActive: false,
      topGoals: [],
      recentCompletions: []
    };
  }
}