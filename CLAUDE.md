# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Google Apps Script-based "Budget Game" web application that gamifies budgeting and activity tracking. Users earn points for completing activities across different categories (Financial Planning, Meal Planning, Health, etc.) with streak bonuses. The system supports households, goal tracking, and provides activity dashboards.

## Architecture

### Core Files Structure
- **Code.js**: Main entry point with event handlers and menu setup
- **Config.js**: Central configuration file with all constants, settings, and default values
- **WebApp.js**: Web application controller serving HTML pages and handling API calls
- **DataProcessing.js**: Core data processing logic, caching, and sheet operations
- **HouseholdManagement.js**: Multi-user household functionality
- **GoalManagement.js**: Financial goal tracking system
- **EmailService.js**: Digest email functionality
- **Utilities.js**: Helper functions and common utilities

### HTML Pages
- **ActivityTracker.html**: Main user interface for logging activities
- **Dashboard.html**: Analytics and goal visualization dashboard  
- **Admin.html**: Administrative interface for managing activities/settings
- **Stylesheet.html**: Shared CSS styles included by other HTML files

### Google Sheets Integration
The app relies on several Google Sheets:
- **Dashboard**: Activity log with dates, points, activities, emails
- **Points Reference**: Master list of activities with point values and categories
- **Households**: Multi-user household configuration
- **Goals**: Financial goal tracking data

### Key Architecture Patterns
- **Caching**: Activity data is cached using Google Apps Script CacheService and in-memory variables
- **Configuration-Driven**: All settings centralized in CONFIG object
- **Web App + Sheets**: HTML frontend calls server-side functions that manipulate Google Sheets
- **Event-Driven**: Sheet edit triggers and time-based triggers for automation

## Development Commands

This is a Google Apps Script project - no traditional build/test commands. Development workflow:

### Setup Commands (via custom menu)
Access through "Budget Game" menu in Google Sheets:
- **Setup Dashboard Sheet**: Creates/configures main activity log sheet
- **Setup Points Reference Sheet**: Creates activities and point values sheet  
- **Setup Households Sheet**: Creates multi-user household configuration
- **Setup Goals Sheet**: Creates financial goal tracking sheet
- **Setup/Update All Triggers**: Configures automated triggers for digests and sheet edits

### Development Workflow
1. Open Google Sheets with the Budget Game
2. Use Script Editor (Extensions > Apps Script) for code changes
3. Deploy as Web App for frontend testing
4. Use built-in logging via `Logger.log()` and View > Logs

### Testing
- No formal test framework
- Manual testing through web app interface
- Use "Debug: Calculate Streaks" menu item for streak calculation testing
- Check Apps Script execution logs for errors

## Key Configuration

### Admin Access
Configure admin emails in `Config.js`:
```javascript
ADMIN_EMAILS: [
  "your-email@gmail.com"
]
```

### Categories and Activities
Activities are managed through the Points Reference sheet or Admin interface. Default categories:
- Financial Planning, Meal Planning, Self-Discipline, Health, Household, Negative, Achievement

### Streak System
Configurable streak bonuses (defaults in Config.js, customizable via PropertiesService):
- 3+ days: +1 bonus point
- 7+ days: +2 bonus points  
- 14+ days: Double points multiplier

### Household Features
Enable/disable in Config.js:
```javascript
HOUSEHOLD_SETTINGS: {
  ENABLED: true
}
```

## Important Notes

- **Google Apps Script Environment**: This runs entirely within Google's Apps Script platform
- **No External Dependencies**: Uses only Google Apps Script built-in services
- **Sheet-Based Storage**: All data stored in Google Sheets, not external databases
- **PropertiesService**: Used for persistent configuration (streak settings, category order)
- **CacheService**: Used for performance optimization of frequently accessed data
- **Email Integration**: Built-in Gmail integration for digest emails

## Common Tasks

### Adding New Activities
1. Use Admin interface at `?view=admin` or
2. Edit Points Reference sheet directly (triggers cache refresh)

### Modifying Categories
Use Admin interface to add/edit/delete categories - automatically updates validation and activity assignments

### Troubleshooting
- Check Apps Script logs (View > Logs) for errors
- Use "Rebuild Dashboard From Form Responses" if data gets corrupted
- Clear cache by editing Points Reference sheet or calling `resetActivityDataCache()`