# Google Sheets Integration Setup

This guide explains how to set up Google Sheets integration for character syncing.

## Overview

The bot uses a Google Service Account to read and write character data to Google Sheets. This allows the bot to access sheets that have been shared with it, without requiring users to authenticate.

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" at the top
3. Click "NEW PROJECT"
4. Enter a project name (e.g., "Mistbot Sheets Integration")
5. Click "CREATE"
6. Wait for the project to be created, then select it

## Step 2: Enable Google Sheets API

1. In your project, go to "APIs & Services" > "Library"
2. Search for "Google Sheets API"
3. Click on it and click "ENABLE"
4. Wait for the API to be enabled

## Step 3: Create a Service Account

1. Go to "APIs & Services" > "Credentials"
2. Click "CREATE CREDENTIALS" at the top
3. Select "Service account"
4. Fill in the details:
   - **Service account name**: mistbot-sheets (or any name you prefer)
   - **Service account ID**: Will auto-fill based on name
   - **Description**: Bot service account for Google Sheets integration
5. Click "CREATE AND CONTINUE"
6. Skip the optional steps (Grant access & Grant users access)
7. Click "DONE"

## Step 4: Create and Download Service Account Key

1. Find your newly created service account in the list
2. Click on the service account email address
3. Go to the "KEYS" tab
4. Click "ADD KEY" > "Create new key"
5. Select "JSON" format
6. Click "CREATE"
7. A JSON file will be downloaded automatically - **keep this file secure!**

## Step 5: Install the Credentials

1. Rename the downloaded JSON file to `google-credentials.json`
2. Move it to your bot's root directory (same level as `package.json`)
3. Make sure it's in your `.gitignore` so it's not committed to version control

```bash
# Move the downloaded file to your bot directory
mv ~/Downloads/mistbot-sheets-*.json /path/to/mistbot/google-credentials.json

# Verify it's there
ls -la google-credentials.json
```

## Step 6: Share Your Google Sheet with the Service Account

For each Google Sheet you want to sync:

1. Open the `google-credentials.json` file
2. Find the `client_email` field (looks like: `mistbot-sheets@project-id.iam.gserviceaccount.com`)
3. Copy this email address
4. Open your Google Sheet
5. Click "Share" button in the top right
6. Paste the service account email
7. Make sure it has "Editor" permissions
8. Uncheck "Notify people" (the service account won't receive emails)
9. Click "Share"

## Step 7: Configure Character Sheet URLs

In Discord, use the bot commands to configure which sheet each character should sync with:

```
/char-set-sheet-url
```

This will prompt you to:
1. Select a character
2. Enter the Google Sheets URL

## Step 8: Test the Integration

Try syncing your character:

```
/char-sync-to-sheet    # Push bot data to sheet
/char-sync-from-sheet  # Pull sheet data to bot
```

## Security Notes

### Protecting Your Credentials

⚠️ **IMPORTANT**: The `google-credentials.json` file contains sensitive credentials that allow full access to any sheet shared with the service account.

**Do:**
- ✅ Keep `google-credentials.json` in your `.gitignore`
- ✅ Store it securely on your server
- ✅ Use restrictive file permissions: `chmod 600 google-credentials.json`
- ✅ Only share sheets that need to be accessed by the bot
- ✅ Backup the credentials file securely

**Don't:**
- ❌ Commit credentials to git/GitHub
- ❌ Share credentials in Discord or public channels
- ❌ Give the service account more permissions than needed
- ❌ Share your entire Google Drive with the service account

### Revoking Access

If your credentials are compromised:

1. Go to Google Cloud Console > IAM & Admin > Service Accounts
2. Find the compromised service account
3. Delete it
4. Create a new service account following the steps above
5. Update your bot's `google-credentials.json`
6. Re-share your sheets with the new service account email

## Troubleshooting

### "Google Sheets credentials not found" warning

**Problem**: Bot can't find `google-credentials.json`

**Solution**:
```bash
# Check if file exists
ls -la google-credentials.json

# Make sure it's in the right location (bot root directory)
pwd  # Should show your bot directory
```

### "Failed to read cell" or "Permission denied" errors

**Problem**: Service account doesn't have access to the sheet

**Solution**:
1. Open your Google Sheet
2. Check if the service account email is in the "Share" list
3. Make sure it has "Editor" permissions
4. Try sharing the sheet again

### "Invalid Google Sheets URL" error

**Problem**: The URL format is not recognized

**Solution**: Make sure you're using the full Google Sheets URL:
- ✅ Good: `https://docs.google.com/spreadsheets/d/1ABC123xyz/edit`
- ❌ Bad: `docs.google.com/spreadsheets/d/1ABC123xyz`
- ❌ Bad: Just the spreadsheet ID

### "Quota exceeded" errors

**Problem**: You've hit Google's API rate limits

**Solution**:
- Google Sheets API has a limit of 100 requests per 100 seconds per user
- Wait a few minutes and try again
- If this happens frequently, consider batching your operations

## Credentials File Format

Your `google-credentials.json` should look like this:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "mistbot-sheets@your-project-id.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

The most important field is `client_email` - this is what you share your sheets with.

## Usage Examples

### Setting Up a Character Sheet

```
1. /char-set-sheet-url
   → Select your character
   → Enter: https://docs.google.com/spreadsheets/d/1ABC123xyz/edit

2. /char-sync-from-sheet
   → Pulls data from the sheet to the bot

3. /char-lookup
   → Verify your character data was imported correctly
```

### Updating Your Sheet from the Bot

```
1. Make changes to your character in Discord using bot commands

2. /char-sync-to-sheet
   → Pushes your bot data to the Google Sheet

3. Open your Google Sheet
   → Verify the changes appear in the sheet
```

### Sync Strategy

**Option A: Sheet is the source of truth**
- Edit your character in the Google Sheet
- Use `/char-sync-from-sheet` to import to bot
- Use the bot for rolls and gameplay
- Periodically sync from sheet to keep bot updated

**Option B: Bot is the source of truth**
- Edit your character using bot commands
- Use `/char-sync-to-sheet` to backup to sheet
- Use the sheet for viewing/sharing
- Periodically sync to sheet to keep backup updated

**Option C: Bidirectional** (be careful!)
- Edit in either location
- Sync manually when you've made changes
- ⚠️ Note: Last sync wins - no conflict resolution!

## Advanced: Multiple Bots or Environments

If you're running the bot in multiple environments (dev, prod), you can:

**Option 1**: Use the same service account for all environments
- Share all sheets with one service account email
- Use the same credentials file in all environments

**Option 2**: Use different service accounts per environment
- Create separate service accounts (e.g., `mistbot-sheets-dev`, `mistbot-sheets-prod`)
- Share dev sheets with dev account, prod sheets with prod account
- Use different credentials files per environment

## Support

If you encounter issues:
1. Check the bot logs for detailed error messages
2. Verify your credentials file is valid JSON
3. Confirm the service account has access to your sheet
4. Make sure Google Sheets API is enabled in your project
5. Check that you're using the correct sheet URL format

