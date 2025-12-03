# Google Sheets Integration - Implementation Summary

## ✅ Completed Features

### 1. Database Migrations
Created 5 new migrations to support Google Sheets sync:

- **Migration 002**: Added `google_sheet_url` column to characters table
- **Migration 003**: Added `is_burned` column to `character_theme_tags` and `character_themes` tables
- **Migration 004**: Added power level columns (`power_1` through `power_6`) to `character_statuses` table
- **Migration 005**: Removed obsolete `character_burned_tags` table

All migrations have been applied successfully ✓

### 2. Data Structure Changes

#### Burned Tags
- **Before**: Stored separately in `character_burned_tags` table
- **After**: Stored as properties on tags (`is_burned` flag)
  - Theme names can be burned (tracked in `character_themes.is_burned`)
  - Individual tags/weaknesses can be burned (tracked in `character_theme_tags.is_burned`)

#### Status Power Levels
- **Before**: Stored as plain status names
- **After**: Stored with 6 boolean power level columns
  - Each status has `power_1` through `power_6` columns
  - Highest TRUE power level is the effective power
  - Matches Google Sheets format exactly

### 3. New Commands

#### `/char-set-sheet-url`
- Sets the Google Sheets URL for your active character
- Shows a modal to input the URL
- Validates URL format
- Stores URL per character in database

#### `/char-sync-to-sheet`
- Pushes character data FROM bot TO Google Sheets
- Overwrites sheet data with bot data
- Requires sheet URL to be configured

#### `/char-sync-from-sheet`
- Pulls character data FROM Google Sheets TO bot
- Overwrites bot data with sheet data
- Requires sheet URL to be configured

### 4. Character View Integration
Added sync buttons to character sheets (when viewing own character):
- **🔗 Set Sheet URL**: Configure which Google Sheet to sync with
- **📤 Sync to Sheet**: Push data to Google Sheets (disabled if no URL set)
- **📥 Sync from Sheet**: Pull data from Google Sheets (disabled if no URL set)

### 5. Google Sheets Service
Created `GoogleSheetsService.js` utility that:
- Authenticates using service account credentials
- Maps specific sheet cells to character data
- Reads and writes all character fields including:
  - Character name (P3)
  - 4 themes with names, tags (6 max), weaknesses (2 max)
  - Burned status for theme names and all tags/weaknesses
  - Backpack items (14 max, AP4:AP17)
  - Story tags (17 max, AP20:AP36)
  - Statuses with all 6 power levels (13 max, C24:C36, H-M columns)
- Validates that all 4 themes have names (as per your requirement)
- Uses TRUE/1/x values to indicate burned status and power levels

### 6. Updated Character Storage
Modified `CharacterStorage.js` to:
- Load tags/weaknesses as objects with `{ tag, isBurned }` structure
- Load themes with `isBurned` property
- Load statuses as objects with `{ status, powerLevels }` structure
- Handle both old string format and new object format (for backwards compatibility)
- Store burned status inline with tags
- Store all 6 power levels for each status

### 7. Documentation
Created comprehensive setup guide:
- **GOOGLE_SHEETS_SETUP.md**: Step-by-step instructions for:
  - Creating Google Cloud Project
  - Enabling Sheets API
  - Creating service account
  - Downloading and installing credentials
  - Sharing sheets with the bot
  - Security best practices
  - Troubleshooting guide

## 📋 Cell Mappings

### Character Name
- **P4:Z4** - Character name

### Themes (All 4 Required)

#### Theme 1
- **BF7:BL7** - Theme name
- **BM7** - Theme name burned status
- **BC8:BL8** to **BC13:BL13** - Tags (6 max)
- **BM8** to **BM13** - Tag burned statuses
- **BC16:BM16**, **BC17:BM17** - Weaknesses (2 max)

#### Theme 2  
- **BS7:BY7** - Theme name
- **BZ7** - Theme name burned status
- Same relative pattern for tags/weaknesses

#### Theme 3
- **CF7:CL7** - Theme name
- **CM7** - Theme name burned status
- Same relative pattern for tags/weaknesses

#### Theme 4
- **CS7:CY7** - Theme name
- **CZ7** - Theme name burned status
- Same relative pattern for tags/weaknesses

### Other Data
- **AP4:AZ4** to **AP17:AZ17** - Backpack items (14 max)
- **AP20:AZ20** to **AP36:AZ36** - Story tags (17 max)
- **C24:G24** to **C36:G36** - Status names (13 max)
- **H24:M24** to **H36:M36** - Power levels 1-6 for each status

## 🔧 Setup Required

### 1. Create Google Service Account
Follow `GOOGLE_SHEETS_SETUP.md` to:
1. Create a Google Cloud project
2. Enable Google Sheets API
3. Create a service account
4. Download credentials JSON file

### 2. Install Credentials
```bash
# Place the credentials file in the bot root directory
mv ~/Downloads/your-project-*.json /home/mcarino/workspace/mistbot/google-credentials.json

# Set proper permissions
chmod 600 /home/mcarino/workspace/mistbot/google-credentials.json
```

### 3. Share Your Google Sheet
1. Open your Google Sheet
2. Click "Share"
3. Add the service account email (found in `google-credentials.json`)
4. Give it "Editor" permissions
5. Uncheck "Notify people"

### 4. Deploy Commands
```bash
cd /home/mcarino/workspace/mistbot
npm run deploy  # For guild deployment
# or
npm run deploy:global  # For global deployment
```

### 5. Restart the Bot
```bash
pm2 restart mistbot
# or
npm start
```

## 📝 Usage Examples

### First-Time Setup
```
1. Create your character in Discord using /char-create
2. In Google Sheets, format your character sheet with the cell layout
3. Share the sheet with the service account email
4. In Discord: /char-set-sheet-url
5. Enter your Google Sheets URL
6. /char-sync-from-sheet (to import from sheet)
   OR
   /char-sync-to-sheet (to export to sheet)
```

### Daily Workflow

**Option A: Sheet as Source of Truth**
```
1. Edit character in Google Sheets
2. /char-sync-from-sheet to import changes
3. Play using Discord bot
```

**Option B: Bot as Source of Truth**
```
1. Edit character using bot commands
2. /char-sync-to-sheet to backup to sheets
3. View/share the Google Sheet
```

## ⚠️ Important Notes

### Sync Behavior
- **No conflict resolution**: Last sync wins
- **Full overwrite**: Syncing replaces ALL data in target location
- **No incremental updates**: Every sync is a complete replace

### Validation
- All 4 themes MUST have names
- Empty/blank themes are treated as invalid
- Character name cannot be empty
- Sheet URL must be valid Google Sheets format

### Burned Tags
- Theme names can be burned (they are tags themselves)
- Individual tags/weaknesses can be burned
- Burned status syncs bidirectionally
- In sheet: TRUE/1/x in the burned column = burned

### Status Power Levels
- All 6 power levels are stored and synced
- Highest TRUE power level is the effective power
- In bot: Shows as "Status Name (Power X)" in displays
- In sheet: TRUE in H-M columns for powers 1-6

## 🔐 Security

The `google-credentials.json` file has been added to `.gitignore` to prevent accidental commits.

**Important**:
- Never commit credentials to git
- Use `chmod 600 google-credentials.json` to restrict access
- Only share sheets that need bot access
- If compromised, delete and recreate the service account

## 🐛 Known Issues

- None currently! All migrations applied successfully.
- Existing linter warning about unused `client` parameters in handlers (pre-existing, not related to this feature)

## 📚 Files Modified/Created

### New Files
- `utils/GoogleSheetsService.js` - Core Google Sheets integration
- `commands/SetSheetUrlCommand.js` - Configure sheet URL
- `commands/SyncToSheetCommand.js` - Sync to sheets
- `commands/SyncFromSheetCommand.js` - Sync from sheets
- `GOOGLE_SHEETS_SETUP.md` - Setup documentation
- `migrations/002_add_google_sheet_url_to_characters.sql`
- `migrations/003_add_burned_status_to_theme_tags_and_themes.sql`
- `migrations/004_add_power_levels_to_statuses.sql`
- `migrations/005_remove_character_burned_tags_table.sql`

### Modified Files
- `utils/CharacterStorage.js` - Updated data structure, added sync methods
- `commands/EditCharacterCommand.js` - Added sync buttons to character view
- `commands/index.js` - Registered new commands
- `handlers/CharacterHandler.js` - Added button handlers
- `index.js` - Added button and modal handlers
- `package.json` - Added googleapis dependency
- `.gitignore` - Added google-credentials.json

## 🎉 Ready to Use!

The integration is complete and ready for testing. Follow the setup steps above to configure your Google service account and start syncing!

