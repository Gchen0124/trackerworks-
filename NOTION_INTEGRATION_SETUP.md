# Notion Integration Setup Guide

## Overview
The application now supports user-configurable Notion database connections! Users can enter their Notion credentials directly in the app without needing environment variables.

## What Was Implemented

### 1. Database Changes
Added three new fields to the `user_settings` table:
- `notion_token` - User's Notion API token
- `notion_daily_ritual_db_id` - Database ID for daily ritual tracking
- `notion_task_cal_db_id` - Database ID for task calendar

### 2. Backend Updates

**lib/notion.ts**:
- Added `getNotionCredentials()` function that checks database first, then falls back to env variables
- Modified to create Notion client dynamically with user credentials
- Maintains backward compatibility with env variable setup

**app/api/local/settings/route.ts**:
- GET endpoint now returns Notion credentials
- POST endpoint now saves Notion credentials to database

**app/api/notion/*.ts**:
- All Notion API routes updated to use `getNotionCredentials()` instead of env variables
- Better error messages when credentials are missing

### 3. Frontend UI

**components/notion-settings.tsx** (NEW):
- Full-featured settings dialog for Notion configuration
- Input fields for:
  - Notion Integration Token
  - Daily Ritual Database ID
  - Task Calendar Database ID
- "Test Connection" button to verify credentials work
- "Save" button to persist settings to database
- Clear error/success messaging

**app/page.tsx**:
- Added Database icon button in header to open Notion Settings
- Integrated NotionSettings component into the page

## How to Use (For Users)

### Step 1: Get Your Notion Credentials

1. **Create a Notion Integration**:
   - Go to https://www.notion.so/my-integrations
   - Click "New integration"
   - Give it a name (e.g., "Time Tracker")
   - Copy the "Internal Integration Token"

2. **Get Database IDs**:
   - Open your Daily Ritual database in Notion
   - Copy the database ID from the URL (the part after the workspace name and before the `?`)
   - Example: `https://notion.so/myworkspace/DatabaseName-ABC123...` → `ABC123...` is the ID
   - Repeat for Task Calendar database

3. **Share Databases with Integration**:
   - Open each database in Notion
   - Click "..." menu → "Add connections"
   - Select your integration

### Step 2: Configure in the App

1. Click the **Database icon** button in the top-right header
2. Enter your credentials:
   - Paste your Notion token
   - Paste your Daily Ritual Database ID
   - Paste your Task Calendar Database ID
3. Click **"Test Connection"** to verify everything works
4. Click **"Save Settings"** to persist the configuration

### Step 3: Use Notion Features

Once configured, the "Notion Tasks" button in the bottom toolbar will:
- Pull tasks from your configured Notion databases
- Allow you to import them into your time tracker
- Pull daily goals from your Daily Ritual database

## Deployment Notes

### Database Migration
The database schema is automatically created/updated when the app starts. No manual migration needed!

### Environment Variables (Optional)
The app still supports the old env variable approach as a fallback:
- `NOTION_TOKEN`
- `NOTION_DAILY_RITUAL_DB_ID`
- `NOTION_TASK_CAL_DB_ID`

User-configured database credentials take priority over env variables.

### Security Considerations
- Notion tokens are stored in the local SQLite database
- For production deployment, consider encrypting sensitive database fields
- The database file is stored at `data/app.db` by default

## Troubleshooting

**"Missing Notion token" error**:
- Make sure you saved your settings after entering the token
- Verify the token is valid in Notion integration settings

**"Missing database IDs" error**:
- Check that you copied the full database ID (32 character hex string)
- Ensure you shared the databases with your integration

**"Failed to verify connection" error**:
- Verify your integration has access to both databases
- Check that the database IDs are correct
- Ensure your Notion workspace is accessible

## Technical Architecture

```
User Input → NotionSettings Component
    ↓
API: /api/local/settings (POST)
    ↓
SQLite: user_settings table
    ↓
lib/notion.ts: getNotionCredentials()
    ↓
API: /api/notion/verify, /api/notion/daily-ritual/weekly-goals
    ↓
Notion API (with user credentials)
```

## Files Modified

1. `db/schema.ts` - Added Notion credential fields
2. `lib/db.ts` - Updated CREATE TABLE statement
3. `lib/notion.ts` - Dynamic credential loading
4. `app/api/local/settings/route.ts` - Save/load credentials
5. `app/api/notion/verify/route.ts` - Use dynamic credentials
6. `app/api/notion/daily-ritual/weekly-goals/route.ts` - Use dynamic credentials
7. `components/notion-settings.tsx` - NEW settings UI
8. `app/page.tsx` - Integrated settings dialog

## Next Steps (Optional Enhancements)

1. **Credential Encryption**: Encrypt tokens before storing in database
2. **Multiple Workspaces**: Support multiple Notion workspace connections
3. **OAuth Flow**: Replace manual token entry with OAuth for better UX
4. **Credential Validation**: Add more robust validation before saving
5. **Settings Export/Import**: Allow users to backup their configuration
