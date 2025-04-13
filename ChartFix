/**
 * ChartFix.gs - Modified chart creation functions for Budget Game v3
 * Fixes the "Cannot read properties of undefined (reading 'MERGE_COLUMNS')" error
 */

/**
 * Creates/updates charts on the Dashboard sheet without using Charts.MergeStrategy.
 * Replacement for the original createDashboardCharts function.
 */
function createDashboardChartsSafe() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboardSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DASHBOARD);
  if (!dashboardSheet) return;

  // Remove existing charts owned by this sheet
  dashboardSheet.getCharts().forEach(chart => dashboardSheet.removeChart(chart));

  const lastRow = dashboardSheet.getLastRow();
  if (lastRow < 2) return; // No data to chart

  try {
    // Chart 1: Points Over Time (Line Chart) - Uses A2:B<lastRow>
    const dateRange = dashboardSheet.getRange(2, 1, lastRow - 1, 1); // A2:A<lastRow>
    const pointsRange = dashboardSheet.getRange(2, 2, lastRow - 1, 1); // B2:B<lastRow>

    const lineChart = dashboardSheet.newChart()
      .setChartType(Charts.ChartType.LINE)
      .addRange(dateRange) // X-axis
      .addRange(pointsRange) // Y-axis
      // Remove the problematic line: .setMergeStrategy(Charts.MergeStrategy.MERGE_COLUMNS)
      .setTransposeRowsAndColumns(false)
      .setNumHeaders(0) // Data ranges don't include headers
      .setOption('title', 'Points Over Time')
      .setOption('legend', { position: 'none' })
      .setOption('colors', [CONFIG.COLORS.CHART_MAIN_LINE])
      .setOption('hAxis', { title: 'Date', format: CONFIG.DATE_FORMAT_SHORT })
      .setOption('vAxis', { title: 'Points' })
      .setOption('width', 450)
      .setOption('height', 300)
      .setPosition(2, 7, 10, 10) // Place near summary: Row 2, Col G(7), offset 10,10
      .build();
    dashboardSheet.insertChart(lineChart);

    // Chart 2: Positive vs Negative Activities (Pie Chart) - Uses K2:K3 (Assuming these are Total Pos/Neg counts)
    const pieLabelsRange = dashboardSheet.getRange("J2:J3"); // Labels: Total Positive, Total Negative
    const pieValuesRange = dashboardSheet.getRange("K2:K3"); // Values

    const pieChart = dashboardSheet.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(pieLabelsRange) // Add labels first
      .addRange(pieValuesRange) // Add values
      // Remove the problematic line: .setMergeStrategy(Charts.MergeStrategy.MERGE_COLUMNS)
      .setTransposeRowsAndColumns(false)
      .setNumHeaders(0)
      .setOption('title', 'Positive vs Negative Activity Count (This Week)')
      .setOption('pieSliceText', 'value') // Show counts on slices
      .setOption('legend', { position: 'right' })
      .setOption('colors', [CONFIG.COLORS.CHART_POSITIVE, CONFIG.COLORS.CHART_NEGATIVE]) // Green, Red
      .setOption('width', 450)
      .setOption('height', 300)
      .setPosition(18, 7, 10, 10) // Below line chart: Row 18, Col G(7)
      .build();
    dashboardSheet.insertChart(pieChart);

    // Chart 3: Specific Category Distribution (Column Chart) - Uses J4:K5 (or more)
     const categoryLabelsRange = dashboardSheet.getRange("J4:J5"); // Labels: Health Specific, Household Specific
     const categoryValuesRange = dashboardSheet.getRange("K4:K5"); // Values

     const categoryChart = dashboardSheet.newChart()
       .setChartType(Charts.ChartType.COLUMN)
       .addRange(categoryLabelsRange) // X-axis labels
       .addRange(categoryValuesRange) // Y-axis values
       // Remove the problematic line: .setMergeStrategy(Charts.MergeStrategy.MERGE_COLUMNS)
       .setTransposeRowsAndColumns(false)
       .setNumHeaders(0)
       .setOption('title', 'Specific Category Counts (This Week)')
       .setOption('legend', { position: 'none' })
       .setOption('colors', [CONFIG.COLORS.CHART_HEALTH, CONFIG.COLORS.CHART_HOUSEHOLD]) // Colors match order J4, J5
       .setOption('hAxis', { title: 'Category', slantedText: true, slantedTextAngle: 30 })
       .setOption('vAxis', { title: 'Count', minValue: 0 })
       .setOption('width', 450)
       .setOption('height', 300)
       .setPosition(34, 7, 10, 10) // Below pie chart: Row 34, Col G(7)
       .build();
     dashboardSheet.insertChart(categoryChart);

    Logger.log("Dashboard charts created successfully with fixed method.");
  } catch (e) {
    Logger.log(`Error in createDashboardChartsSafe: ${e}`);
  }
}

/**
 * Creates/updates charts on a specific weekly sheet without using Charts.MergeStrategy.
 * Replacement for the original createWeeklySheetCharts function.
 * @param {Sheet} weeklySheet The sheet object for the specific week.
 */
function createWeeklySheetChartsSafe(weeklySheet) {
  if (!weeklySheet) return;

  // Remove existing charts owned by this sheet
  weeklySheet.getCharts().forEach(chart => weeklySheet.removeChart(chart));

  const lastRow = weeklySheet.getLastRow();
  // Only chart if summary data likely exists (check summary cell maybe?)
  // Or check if data rows exist: if (lastRow < 10) return;

  try {
    // Chart 1: Points by Day (Column Chart) - Uses G8:H14
    const dayLabelsRange = weeklySheet.getRange("G8:G14"); // Day names
    const dayValuesRange = weeklySheet.getRange("H8:H14"); // Points values

    const dayChart = weeklySheet.newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(dayLabelsRange) // X-axis labels
      .addRange(dayValuesRange) // Y-axis values
      // Remove the problematic line: .setMergeStrategy(Charts.MergeStrategy.MERGE_COLUMNS)
      .setTransposeRowsAndColumns(false)
      .setNumHeaders(0)
      .setOption('title', 'Points by Day of Week')
      .setOption('legend', { position: 'none' })
      .setOption('colors', [CONFIG.COLORS.CHART_MAIN_LINE])
      .setOption('hAxis', { title: 'Day' })
      .setOption('vAxis', { title: 'Points' })
      .setOption('width', 350) // Mobile friendly size
      .setOption('height', 250)
      .setPosition(10, 7, 5, 5) // Place near data: Row 10, Col G(7)
      .build();
    weeklySheet.insertChart(dayChart);

    // Chart 2: Category Distribution (Pie Chart) - Uses G2:H5
     const categoryLabelsRange = weeklySheet.getRange("G2:G5"); // Category names
     const categoryValuesRange = weeklySheet.getRange("H2:H5"); // Category counts

     const categoryChart = weeklySheet.newChart()
       .setChartType(Charts.ChartType.PIE)
       .addRange(categoryLabelsRange) // Add labels first
       .addRange(categoryValuesRange) // Add values
       // Remove the problematic line: .setMergeStrategy(Charts.MergeStrategy.MERGE_COLUMNS)
       .setTransposeRowsAndColumns(false)
       .setNumHeaders(0)
       .setOption('title', 'Activity Category Counts')
       .setOption('pieSliceText', 'value')
       .setOption('legend', { position: 'right' })
        .setOption('colors', [CONFIG.COLORS.CHART_POSITIVE, CONFIG.COLORS.CHART_NEGATIVE, CONFIG.COLORS.CHART_HEALTH, CONFIG.COLORS.CHART_HOUSEHOLD]) // Match order G2:G5
       .setOption('width', 350) // Mobile friendly size
       .setOption('height', 250)
       .setPosition(26, 7, 5, 5) // Below day chart: Row 26, Col G(7)
       .build();
     weeklySheet.insertChart(categoryChart);

    Logger.log(`Charts created successfully for sheet: "${weeklySheet.getName()}" with fixed method.`);
  } catch (e) {
    Logger.log(`Error in createWeeklySheetChartsSafe for sheet "${weeklySheet.getName()}": ${e}`);
  }
}

/**
 * Wrapper function to replace all chart creation calls
 * Intercepts calls to the original functions and redirects them to the safe versions.
 */
function fixChartFunctions() {
  // Store references to the original functions
  if (typeof createDashboardCharts === "function") {
    const originalDashboardCharts = createDashboardCharts;
    
    // Replace with our safe version
    createDashboardCharts = function() {
      try {
        return createDashboardChartsSafe();
      } catch (e) {
        Logger.log(`Error in chart fix wrapper: ${e}`);
        // Try original as fallback
        return originalDashboardCharts();
      }
    };
    
    Logger.log("Successfully patched createDashboardCharts function");
  } else {
    Logger.log("Warning: createDashboardCharts function not found for patching");
  }
  
  if (typeof createWeeklySheetCharts === "function") {
    const originalWeeklySheetCharts = createWeeklySheetCharts;
    
    // Replace with our safe version
    createWeeklySheetCharts = function(weeklySheet) {
      try {
        return createWeeklySheetChartsSafe(weeklySheet);
      } catch (e) {
        Logger.log(`Error in weekly chart fix wrapper: ${e}`);
        // Try original as fallback
        return originalWeeklySheetCharts(weeklySheet);
      }
    };
    
    Logger.log("Successfully patched createWeeklySheetCharts function");
  } else {
    Logger.log("Warning: createWeeklySheetCharts function not found for patching");
  }
}

/**
 * Installation function - should be run once after adding this script.
 * Adds a menu item to run the fix and applies the fix immediately.
 */
function installChartFix() {
  // Apply the fix immediately
  fixChartFunctions();
  
  // Add a menu item for the fix (for future sessions)
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('🛠️ Fixes')
      .addItem('Apply Chart Fix', 'fixChartFunctions')
      .addToUi();
    Logger.log("Chart fix menu added successfully");
  } catch (e) {
    Logger.log(`Error creating menu: ${e}`);
  }
  
  SpreadsheetApp.getActiveSpreadsheet().toast('Chart functions have been patched!', 'Chart Fix Applied', 5);
}
