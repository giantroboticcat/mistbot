# Google Sheets Integration - Implementation Summary
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
- In bot: Shows as "status-name-X" in displays
- In sheet: TRUE in H-M columns for powers 1-6

## 🔐 Security

The `google-credentials.json` file has been added to `.gitignore` to prevent accidental commits.

**Important**:
- Never commit credentials to git
- Use `chmod 600 google-credentials.json` to restrict access
- Only share sheets that need bot access
- If compromised, delete and recreate the service account