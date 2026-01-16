// CONFIGURATION 
const WEBHOOK_URL = 'https://mistbot.duckdns.org/webhook/sheets';
const GUILD_ID = '950980284319428608';

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
    
    // Get spreadsheet info
    const spreadsheet = e.source;
    const spreadsheetId = spreadsheet.getId();
    
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
  const sheetId = 2055343958; //Ember
  const sheetName = "Ember | GiantRoboticCat";
  
  sendWebhook(spreadsheetId, sheetId, sheetName);
}

