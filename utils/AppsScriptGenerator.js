/**
 * Utility to generate Google Apps Script code for webhook triggers
 */
export class AppsScriptGenerator {
  /**
   * Generate Apps Script code for a character's Google Sheet
   * @param {Object} options - Configuration options
   * @param {string} options.webhookUrl - The webhook URL (e.g., https://mistbot.duckdns.org/webhook/sheets)
   * @param {string} options.guildId - Discord guild ID
   * @param {string} options.sheetName - Optional: specific sheet name to monitor (null = all sheets)
   * @returns {string} Complete Apps Script code
   */
  static generateCode({ webhookUrl, guildId, sheetName = null }) {
    const targetSheetNames = sheetName ? `['${sheetName}']` : '[]';
    
    return `/**
 * Google Apps Script for sending webhooks when specific tabs are edited
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Paste this code
 * 4. Save the script (Ctrl+S or Cmd+S)
 * 5. Run the setup() function once to install the trigger
 *    - Click "Run" button or press Ctrl+Enter
 *    - Authorize the script if prompted
 * 
 * The script will automatically send webhooks when any tab is edited.
 * The bot will identify which character to sync based on the tab ID (gid).
 */

// CONFIGURATION
const WEBHOOK_URL = '${webhookUrl}';
const GUILD_ID = '${guildId}';
const TARGET_SHEET_NAMES = ${targetSheetNames};

// Note: Debouncing is handled server-side, so we send webhooks immediately

/**
 * Setup function - run this once to install the trigger
 */
function setup() {
  // Delete any existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onEdit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Get the active spreadsheet
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // Create new trigger - must use .forSpreadsheet() before .onEdit()
  ScriptApp.newTrigger('onEdit')
    .forSpreadsheet(spreadsheet)
    .onEdit()
    .create();
  
  Logger.log('✅ Webhook trigger installed successfully!');
  Logger.log('The script will now send webhooks when sheets are edited.');
}

/**
 * Triggered when any cell in the spreadsheet is edited
 */
function onEdit(e) {
  try {
    const sheet = e.source.getActiveSheet();
    const sheetName = sheet.getName();
    const sheetId = sheet.getSheetId();
    
    // Check if we should process this sheet
    if (TARGET_SHEET_NAMES.length > 0 && !TARGET_SHEET_NAMES.includes(sheetName)) {
      return; // Ignore edits to non-target sheets
    }
    
    // Get spreadsheet info
    const spreadsheet = e.source;
    const spreadsheetId = spreadsheet.getId();
    
    // Send webhook immediately - debouncing is handled server-side
    sendWebhook(spreadsheetId, sheetId, sheetName);
    
  } catch (error) {
    Logger.log('❌ Error in onEdit: ' + error.toString());
  }
}

/**
 * Send webhook notification to the bot
 */
function sendWebhook(spreadsheetId, sheetId, sheetName) {
  try {
    const webhookData = {
      type: 'sheet_edit',
      guild_id: GUILD_ID,
      resource_type: 'character',
      spreadsheet_id: spreadsheetId,
      sheet_id: sheetId.toString(), // Tab ID (gid) - send as string to match URL format
      sheet_name: sheetName,
      timestamp: new Date().toISOString()
    };
    
    const payload = JSON.stringify(webhookData);
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: payload,
      muteHttpExceptions: true
    };
    
    const fullUrl = WEBHOOK_URL + '/' + GUILD_ID;
    const response = UrlFetchApp.fetch(fullUrl, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200) {
      Logger.log('✅ Webhook sent successfully for ' + sheetName + ' (Tab ID: ' + sheetId + ')');
    } else {
      Logger.log('⚠️  Webhook failed with status ' + responseCode + ': ' + responseText);
    }
    
  } catch (error) {
    Logger.log('❌ Error sending webhook: ' + error.toString());
  }
}

/**
 * Test function - manually trigger a webhook
 */
function testWebhook() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getActiveSheet();
  const spreadsheetId = spreadsheet.getId();
  const sheetId = sheet.getSheetId();
  const sheetName = sheet.getName();
  
  sendWebhook(spreadsheetId, sheetId, sheetName);
}`;
  }
  
  /**
   * Generate a formatted message with setup instructions
   * @param {Object} options - Same as generateCode
   * @returns {string} Formatted message with code block
   */
  static generateSetupInstructions(options) {
    const code = this.generateCode(options);
    return `**Google Apps Script Setup**

To enable automatic syncing when you edit your Google Sheet, follow these steps:

1. **Open your Google Sheet**
2. **Go to Extensions > Apps Script**
3. **Delete any existing code** and paste this code:

\`\`\`javascript
${code}
\`\`\`

4. **Save the script** (Ctrl+S or Cmd+S)
5. **Run the setup() function**:
   - Click the "Run" button (▶️) or press Ctrl+Enter
   - If prompted, authorize the script (click "Review Permissions" and allow)
6. **Test it**: Make an edit to your sheet and check the bot logs

The script will automatically send webhooks to the bot when you edit the character's tab, and your character data will sync automatically!`;
  }
}

