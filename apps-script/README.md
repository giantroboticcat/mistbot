# Google Apps Script Webhook Setup

This directory contains the Google Apps Script code for enabling automatic webhook notifications when Google Sheets are edited.

## Why Apps Script Instead of Drive API?

Apps Script webhooks offer several advantages over Google Drive API webhooks:

1. **Tab-level detection**: Apps Script can detect which specific tab/sheet was edited
2. **Less noise**: Only fires on actual content edits, not metadata changes
3. **No subscription management**: No need to manage expiring subscriptions or channel IDs
4. **User-controlled**: Users install and manage the script in their own sheets
5. **More reliable**: No IP address changes or subscription expiration issues

## Setup Instructions

When you enable auto-sync for a character, the bot will provide you with Apps Script code that's pre-configured with:
- Your webhook URL
- Your Discord guild ID
- The specific sheet name to monitor (if applicable)

The bot automatically identifies which character to sync based on the tab ID (gid) that was edited.

### Quick Setup

1. Open your Google Sheet
2. Go to **Extensions > Apps Script**
3. Paste the provided code
4. **Save the script** (Ctrl+S or Cmd+S) - This saves it to your spreadsheet
5. **Run the `setup()` function once**:
   - Select `setup` from the function dropdown (or just click in the function)
   - Click the "Run" button (▶️) or press Ctrl+Enter
   - **Authorize the script** if prompted (click "Review Permissions" and allow)
6. **Test it**: Make an edit to your sheet and check the bot logs

**Note**: You don't need to "deploy" the script as a web app or add-on. Once you save it and run `setup()`, it will work automatically. The script runs in the context of your spreadsheet.

## How It Works

1. The Apps Script installs an `onEdit` trigger that fires when any cell is edited
2. When triggered, it immediately sends a webhook POST request to your bot's webhook endpoint
3. The bot receives the webhook and debounces it server-side (waits 5 seconds after the last edit) to batch rapid changes
4. After debouncing, the bot syncs the character data from the sheet

## Files

- `WebhookTrigger.gs`: The Apps Script template (also generated dynamically by the bot)
- `README.md`: This file

## Troubleshooting

### Webhook not firing
- Check that the `setup()` function was run successfully
- Verify the webhook URL in the script matches your bot's `WEBHOOK_URL` environment variable
- Check the Apps Script execution log (View > Execution log)

### Webhook failing
- Verify your bot's webhook server is running and accessible
- Check that the guild ID in the script matches your Discord server
- Ensure the character's Google Sheet URL includes the correct tab (gid parameter)
- **Port Configuration**: 
  - The Apps Script uses `WEBHOOK_URL` from your bot's environment (e.g., `https://mistbot.duckdns.org/webhook/sheets`)
  - The bot server listens on `WEBHOOK_PORT` (default: 3000)
  - If behind a reverse proxy, `WEBHOOK_URL` should be the public domain (no port)
  - If direct access, `WEBHOOK_URL` should include the port (e.g., `http://your-ip:3000/webhook/sheets`)

### Too many webhooks
- The bot handles debouncing server-side (5-second delay) to batch rapid edits
- This prevents excessive syncing when making multiple quick edits

