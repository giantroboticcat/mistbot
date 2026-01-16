import { google } from 'googleapis';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Google Sheets integration service
 * Handles reading and writing character data to/from Google Sheets
 */
export class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.auth = null;
    this.initialize();
  }

  /**
   * Initialize Google Sheets API client
   */
  initialize() {
    const credentialsPath = join(process.cwd(), 'google-credentials.json');
    
    if (!existsSync(credentialsPath)) {
      console.warn('⚠️  Google Sheets credentials not found. Place google-credentials.json in the project root.');
      console.warn('   See GOOGLE_SHEETS_SETUP.md for instructions.');
      return;
    }

    try {
      const credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
      
      this.auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file',
        ],
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      this.drive = google.drive({ version: 'v3', auth: this.auth });
    } catch (error) {
      console.error('❌ Error initializing Google Sheets:', error.message);
    }
  }

  /**
   * Check if service is ready
   */
  isReady() {
    return this.sheets !== null;
  }

  /**
   * Parse spreadsheet URL to extract spreadsheet ID and sheet name/gid
   */
  parseSpreadsheetUrl(url) {
    const spreadsheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!spreadsheetMatch) return null;
    
    const spreadsheetId = spreadsheetMatch[1];
    
    // Try to extract gid (sheet ID) from URL
    // Format: #gid=123456, &gid=123456, or ?gid=123456
    // Prefer #gid over ?gid (fragment over query parameter)
    const gidMatch = url.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : null;
    
    return { spreadsheetId, gid };
  }
  
  /**
   * Get sheet name from gid
   */
  async getSheetNameFromGid(spreadsheetId, gid) {
    if (!gid) return null;
    
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
      });
      
      const sheet = response.data.sheets.find(s => s.properties.sheetId === parseInt(gid));
      if (!sheet) {
        console.warn(`Sheet with gid ${gid} not found in spreadsheet ${spreadsheetId}`);
        return null;
      }
      return sheet.properties.title;
    } catch (error) {
      // Extract detailed error information
      let errorMessage = error.message;
      if (error.response?.data?.error) {
        const apiError = error.response.data.error;
        errorMessage = apiError.message || errorMessage;
      }
      console.error(`Error getting sheet name for gid ${gid}:`, errorMessage);
      // Don't throw - return null so we can fall back to reading from first sheet
      return null;
    }
  }

  /**
   * Get all tabs/sheets from a spreadsheet
   * @param {string} spreadsheetId - The spreadsheet ID
   * @returns {Promise<Array>} Array of tab objects with { title, sheetId, gid }
   */
  async getAllTabs(spreadsheetId) {
    if (!this.isReady()) {
      throw new Error('Google Sheets service not initialized');
    }

    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
      });

      const tabs = response.data.sheets.map(sheet => ({
        title: sheet.properties.title,
        sheetId: sheet.properties.sheetId,
        gid: sheet.properties.sheetId.toString(),
      }));

      return tabs;
    } catch (error) {
      throw new Error(`Failed to get tabs from spreadsheet: ${error.message}`);
    }
  }

  /**
   * Read a single cell value
   */
  async readCell(spreadsheetId, cell, sheetName = null) {
    try {
      const range = sheetName ? `'${sheetName}'!${cell}` : cell;
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
      
      const value = response.data.values?.[0]?.[0];
      return value ? String(value).trim() : '';
    } catch (error) {
      throw new Error(`Failed to read cell ${cell}: ${error.message}`);
    }
  }

  /**
   * Read a range of cells
   */
  async readRange(spreadsheetId, range) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
      
      return response.data.values || [];
    } catch (error) {
      throw new Error(`Failed to read range ${range}: ${error.message}`);
    }
  }

  /**
   * Batch read multiple cells at once (more efficient, avoids quota limits)
   * Splits large requests into smaller batches to avoid API limits
   */
  async batchReadCells(spreadsheetId, cells, sheetName = null) {
    if (!cells || cells.length === 0) {
      throw new Error('No cells specified for batch read');
    }

    // Split into batches of 50 to avoid potential API issues with large requests
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < cells.length; i += BATCH_SIZE) {
      batches.push(cells.slice(i, i + BATCH_SIZE));
    }

    const allResults = {};
    
    try {
      for (const batch of batches) {
        // Escape sheet name if it contains special characters
        // Sheet names with special characters need to be wrapped in single quotes
        // If the sheet name contains single quotes, they need to be doubled
        const escapedSheetName = sheetName ? sheetName.replace(/'/g, "''") : null;
        const ranges = batch.map(cell => {
          if (escapedSheetName) {
            return `'${escapedSheetName}'!${cell}`;
          }
          return cell;
        });

        try {
          const response = await this.sheets.spreadsheets.values.batchGet({
            spreadsheetId,
            ranges,
          });

          // Map results back to cell references
          response.data.valueRanges.forEach((range, index) => {
            const cell = batch[index];
            const value = range.values?.[0]?.[0];
            allResults[cell] = value ? String(value).trim() : '';
          });
        } catch (batchError) {
          // If batch request fails (e.g., due to special characters in sheet name),
          // fall back to reading cells individually
          console.warn('Batch request failed, falling back to individual cell reads:', batchError.message);
          
          for (const cell of batch) {
            try {
              const range = escapedSheetName ? `'${escapedSheetName}'!${cell}` : cell;
              const cellResponse = await this.sheets.spreadsheets.values.get({
                spreadsheetId,
                range,
              });
              const value = cellResponse.data.values?.[0]?.[0];
              allResults[cell] = value ? String(value).trim() : '';
            } catch (cellError) {
              // If individual cell read also fails, set to empty string
              console.error(`Failed to read cell ${cell}:`, cellError.message);
              allResults[cell] = '';
            }
          }
        }
      }

      return allResults;
    } catch (error) {
      // Extract more detailed error information
      let errorMessage = error.message;
      if (error.response?.data?.error) {
        const apiError = error.response.data.error;
        errorMessage = apiError.message || errorMessage;
        if (apiError.status) {
          errorMessage = `[${apiError.status}] ${errorMessage}`;
        }
      } else if (error.response?.data) {
        // If response.data is a string (like HTML), try to extract useful info
        const dataStr = String(error.response.data);
        if (dataStr.includes('<!DOCTYPE') || dataStr.includes('<html')) {
          errorMessage = `Bad request from Google Sheets API (received HTML response). This usually means the request format is invalid or the spreadsheet ID is incorrect.`;
        } else {
          errorMessage = dataStr.substring(0, 200); // Limit length
        }
      }
      
      // Include additional context in error message
      const contextInfo = sheetName ? ` (sheet: "${sheetName}")` : ' (default sheet)';
      throw new Error(`Failed to batch read cells${contextInfo}: ${errorMessage}`);
    }
  }

  /**
   * Write to a single cell
   */
  async writeCell(spreadsheetId, cell, value, sheetName = null) {
    try {
      const range = sheetName ? `'${sheetName}'!${cell}` : cell;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED', // This interprets TRUE as boolean for checkboxes
        resource: {
          values: [[value]],
        },
      });
    } catch (error) {
      throw new Error(`Failed to write to cell ${cell}: ${error.message}`);
    }
  }

  /**
   * Batch write multiple cells at once (more efficient, avoids quota limits)
   */
  async batchWriteCells(spreadsheetId, updates, sheetName = null) {
    try {
      const data = updates.map(({ cell, value }) => ({
        range: sheetName ? `'${sheetName}'!${cell}` : cell,
        values: [[value]],
      }));

      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
          valueInputOption: 'USER_ENTERED', // This interprets TRUE as boolean for checkboxes
          data,
        },
      });
    } catch (error) {
      throw new Error(`Failed to batch write cells: ${error.message}`);
    }
  }

  /**
   * Write to a range of cells
   */
  async writeRange(spreadsheetId, range, values) {
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        resource: {
          values: values,
        },
      });
    } catch (error) {
      throw new Error(`Failed to write to range ${range}: ${error.message}`);
    }
  }

  /**
   * Clear a range of cells
   */
  async clearRange(spreadsheetId, range) {
    try {
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range,
      });
    } catch (error) {
      throw new Error(`Failed to clear range ${range}: ${error.message}`);
    }
  }

  /**
   * Read character data from Google Sheet
   */
  async readCharacterFromSheet(sheetUrl) {
    if (!this.isReady()) {
      throw new Error('Google Sheets service not initialized');
    }

    const parsed = this.parseSpreadsheetUrl(sheetUrl);
    if (!parsed) {
      throw new Error('Invalid Google Sheets URL');
    }
    
    const { spreadsheetId, gid } = parsed;
    const sheetName = gid ? await this.getSheetNameFromGid(spreadsheetId, gid) : null;

    // Build list of all cells to read
    const cellsToRead = [];
    
    // Character name
    cellsToRead.push('P4');
    
    // Fellowship name (AC4)
    cellsToRead.push('AC4');
    
    // Theme configurations
    const themeConfigs = [
      { nameCell: 'BF7', nameBurnedCell: 'BM7', tagStartCol: 'BC', tagStartRow: 8, burnedCol: 'BM', weaknessCells: ['BC16', 'BC17'] },
      { nameCell: 'BS7', nameBurnedCell: 'BZ7', tagStartCol: 'BP', tagStartRow: 8, burnedCol: 'BZ', weaknessCells: ['BP16', 'BP17'] },
      { nameCell: 'CF7', nameBurnedCell: 'CM7', tagStartCol: 'CC', tagStartRow: 8, burnedCol: 'CM', weaknessCells: ['CC16', 'CC17'] },
      { nameCell: 'CS7', nameBurnedCell: 'CZ7', tagStartCol: 'CP', tagStartRow: 8, burnedCol: 'CZ', weaknessCells: ['CP16', 'CP17'] },
    ];

    // Add theme cells
    for (const config of themeConfigs) {
      cellsToRead.push(config.nameCell, config.nameBurnedCell);
      
      // Tags (6 max per theme)
      for (let i = 0; i < 6; i++) {
        const row = config.tagStartRow + i;
        cellsToRead.push(`${config.tagStartCol}${row}`, `${config.burnedCol}${row}`);
      }
      
      // Weaknesses (2 max)
      for (const weaknessCell of config.weaknessCells) {
        const row = weaknessCell.match(/\d+$/)[0];
        cellsToRead.push(weaknessCell, `${config.burnedCol}${row}`);
      }
    }

    // Backpack items (14 max)
    for (let i = 4; i <= 17; i++) {
      cellsToRead.push(`AP${i}`);
    }

    // Story tags (17 max)
    for (let i = 20; i <= 36; i++) {
      cellsToRead.push(`AP${i}`);
    }

    // Statuses (13 max) with power levels
    const colMap = { 1: 'H', 2: 'I', 3: 'J', 4: 'K', 5: 'L', 6: 'M' };
    for (let i = 24; i <= 36; i++) {
      cellsToRead.push(`C${i}`);
      for (let p = 1; p <= 6; p++) {
        cellsToRead.push(`${colMap[p]}${i}`);
      }
    }

    // Read all cells in one batch request
    const cellValues = await this.batchReadCells(spreadsheetId, cellsToRead, sheetName);

    // Parse character data from batch results
    const character = {};
    
    // Character name
    character.name = cellValues['P4'];
    if (!character.name) {
      throw new Error('Character name is empty - invalid sheet');
    }
    
    // Fellowship name (AC4) - may be empty
    character.fellowshipName = cellValues['AC4'] || null;

    // Parse themes
    character.themes = [];
    for (const config of themeConfigs) {
      const themeName = cellValues[config.nameCell];
      
      if (!themeName) {
        throw new Error(`Theme name is empty at ${config.nameCell} - all 4 themes must have names`);
      }
      
      const theme = {
        name: themeName,
        isBurned: this.isTruthy(cellValues[config.nameBurnedCell]),
        tags: [],
        weaknesses: [],
      };

      // Parse tags (6 max per theme)
      for (let i = 0; i < 6; i++) {
        const row = config.tagStartRow + i;
        const tagCell = `${config.tagStartCol}${row}`;
        const burnedCell = `${config.burnedCol}${row}`;
        
        const tagValue = cellValues[tagCell];
        if (tagValue) {
          theme.tags.push({ 
            tag: tagValue, 
            isBurned: this.isTruthy(cellValues[burnedCell]) 
          });
        }
      }

      // Parse weaknesses (2 max per theme)
      for (const weaknessCell of config.weaknessCells) {
        const row = weaknessCell.match(/\d+$/)[0];
        const burnedCell = `${config.burnedCol}${row}`;
        
        const weakness = cellValues[weaknessCell];
        if (weakness) {
          theme.weaknesses.push({ 
            tag: weakness, 
            isBurned: this.isTruthy(cellValues[burnedCell]) 
          });
        }
      }

      character.themes.push(theme);
    }

    // Parse backpack items (14 max)
    character.backpack = [];
    for (let i = 4; i <= 17; i++) {
      const item = cellValues[`AP${i}`];
      if (item) {
        character.backpack.push(item);
      }
    }

    // Parse story tags (17 max)
    character.storyTags = [];
    for (let i = 20; i <= 36; i++) {
      const tag = cellValues[`AP${i}`];
      if (tag) {
        character.storyTags.push(tag);
      }
    }

    // Parse statuses (13 max) with power levels
    character.tempStatuses = [];
    for (let i = 24; i <= 36; i++) {
      const statusName = cellValues[`C${i}`];
      if (!statusName) continue;

      const powerLevels = {};
      for (let p = 1; p <= 6; p++) {
        const powerCell = `${colMap[p]}${i}`;
        powerLevels[p] = this.isTruthy(cellValues[powerCell]);
      }

      character.tempStatuses.push({
        status: statusName,
        powerLevels
      });
    }

    return character;
  }

  /**
   * Write character data to Google Sheet
   */
  async writeCharacterToSheet(sheetUrl, character) {
    if (!this.isReady()) {
      throw new Error('Google Sheets service not initialized');
    }

    const parsed = this.parseSpreadsheetUrl(sheetUrl);
    if (!parsed) {
      throw new Error('Invalid Google Sheets URL');
    }
    
    const { spreadsheetId, gid } = parsed;
    const sheetName = gid ? await this.getSheetNameFromGid(spreadsheetId, gid) : null;

    // Collect all updates in a batch array
    const batchUpdates = [];

    // Character name
    batchUpdates.push({ cell: 'P4', value: character.name || '' });

    // Theme configurations
    const themeConfigs = [
      { nameCell: 'BF7', nameBurnedCell: 'BM7', tagStartCol: 'BC', tagStartRow: 8, burnedCol: 'BM', weaknessCells: ['BC16', 'BC17'] },
      { nameCell: 'BS7', nameBurnedCell: 'BZ7', tagStartCol: 'BP', tagStartRow: 8, burnedCol: 'BZ', weaknessCells: ['BP16', 'BP17'] },
      { nameCell: 'CF7', nameBurnedCell: 'CM7', tagStartCol: 'CC', tagStartRow: 8, burnedCol: 'CM', weaknessCells: ['CC16', 'CC17'] },
      { nameCell: 'CS7', nameBurnedCell: 'CZ7', tagStartCol: 'CP', tagStartRow: 8, burnedCol: 'CZ', weaknessCells: ['CP16', 'CP17'] },
    ];

    // Prepare theme updates
    for (let i = 0; i < 4; i++) {
      const config = themeConfigs[i];
      const theme = character.themes?.[i];

      if (!theme || !theme.name) {
        throw new Error(`Theme ${i + 1} is missing or has no name - all 4 themes are required`);
      }

      // Theme name and burned status
      batchUpdates.push({ cell: config.nameCell, value: theme.name });
      batchUpdates.push({ cell: config.nameBurnedCell, value: theme.isBurned ? 'TRUE' : '' });

      // Tags (up to 6)
      for (let j = 0; j < 6; j++) {
        const row = config.tagStartRow + j;
        const tagCell = `${config.tagStartCol}${row}`;
        const burnedCell = `${config.burnedCol}${row}`;
        
        const tagObj = theme.tags?.[j];
        if (tagObj) {
          const tagText = typeof tagObj === 'string' ? tagObj : tagObj.tag;
          const isBurned = typeof tagObj === 'object' ? tagObj.isBurned : false;
          
          batchUpdates.push({ cell: tagCell, value: tagText });
          batchUpdates.push({ cell: burnedCell, value: isBurned ? 'TRUE' : '' });
        } else {
          batchUpdates.push({ cell: tagCell, value: '' });
          batchUpdates.push({ cell: burnedCell, value: '' });
        }
      }

      // Weaknesses (up to 2)
      for (let j = 0; j < 2; j++) {
        const weaknessCell = config.weaknessCells[j];
        const row = weaknessCell.match(/\d+$/)[0];
        const burnedCell = `${config.burnedCol}${row}`;
        
        const weaknessObj = theme.weaknesses?.[j];
        if (weaknessObj) {
          const weaknessText = typeof weaknessObj === 'string' ? weaknessObj : weaknessObj.tag;
          const isBurned = typeof weaknessObj === 'object' ? weaknessObj.isBurned : false;
          
          batchUpdates.push({ cell: weaknessCell, value: weaknessText });
          batchUpdates.push({ cell: burnedCell, value: isBurned ? 'TRUE' : '' });
        } else {
          batchUpdates.push({ cell: weaknessCell, value: '' });
          batchUpdates.push({ cell: burnedCell, value: '' });
        }
      }
    }

    // Backpack items
    for (let i = 0; i < 14; i++) {
      const itemObj = character.backpack?.[i];
      const item = typeof itemObj === 'string' ? itemObj : (itemObj?.item || '');
      batchUpdates.push({ cell: `AP${4 + i}`, value: item });
    }

    // Story tags
    for (let i = 0; i < 17; i++) {
      const tagObj = character.storyTags?.[i];
      const tag = typeof tagObj === 'string' ? tagObj : (tagObj?.tag || tagObj || '');
      batchUpdates.push({ cell: `AP${20 + i}`, value: tag });
    }

    // Statuses with power levels
    for (let i = 0; i < 13; i++) {
      const row = 24 + i;
      const statusObj = character.tempStatuses?.[i];
      
      if (statusObj) {
        const statusName = typeof statusObj === 'string' ? statusObj : statusObj.status;
        const powers = typeof statusObj === 'object' && statusObj.powerLevels ? statusObj.powerLevels : {};

        batchUpdates.push({ cell: `C${row}`, value: statusName });

        // Power levels
        const colMap = { 1: 'H', 2: 'I', 3: 'J', 4: 'K', 5: 'L', 6: 'M' };
        for (let p = 1; p <= 6; p++) {
          batchUpdates.push({ cell: `${colMap[p]}${row}`, value: powers[p] ? 'TRUE' : '' });
        }
      } else {
        // Clear status row
        batchUpdates.push({ cell: `C${row}`, value: '' });
        const colMap = { 1: 'H', 2: 'I', 3: 'J', 4: 'K', 5: 'L', 6: 'M' };
        for (let p = 1; p <= 6; p++) {
          batchUpdates.push({ cell: `${colMap[p]}${row}`, value: '' });
        }
      }
    }

    // Execute all updates in a single batch request
    await this.batchWriteCells(spreadsheetId, batchUpdates, sheetName);

    return true;
  }

  /**
   * Check if a value is truthy (TRUE, 1, x, X, etc.)
   */
  isTruthy(value) {
    if (!value) return false;
    const str = String(value).toLowerCase().trim();
    return str === 'true' || str === '1' || str === 'x';
  }

  /**
   * Read fellowship data from Google Sheet
   * Cell AC4:AM4 has the fellowship name (merged cells, read only AC4)
   * Cells AC7:AL7 through AC13:AL13 have power tags for the fellowship (merged cells, read only first cell of each row)
   * AC16:AM16 and AC17:AM17 have the weaknesses for the fellowship (merged cells, read only first cell of each row)
   */
  async readFellowshipFromSheet(sheetUrl) {
    if (!this.isReady()) {
      throw new Error('Google Sheets service not initialized');
    }

    const parsed = this.parseSpreadsheetUrl(sheetUrl);
    if (!parsed) {
      throw new Error('Invalid Google Sheets URL');
    }
    
    const { spreadsheetId, gid } = parsed;
    const sheetName = gid ? await this.getSheetNameFromGid(spreadsheetId, gid) : null;

    // Build list of cells to read (only first cell of each merged range)
    const cellsToRead = [];
    
    // Fellowship name: AC4:AM4 (merged cells, read only AC4)
    cellsToRead.push('AC4');
    
    // Power tags: AC7:AL7 through AC13:AL13 (7 rows, merged cells per row, read only AC column)
    for (let row = 7; row <= 13; row++) {
      cellsToRead.push(`AC${row}`);
    }
    
    // Weaknesses: AC16:AM16 and AC17:AM17 (2 rows, merged cells per row, read only AC column)
    for (let row = 16; row <= 17; row++) {
      cellsToRead.push(`AC${row}`);
    }

    // Read all cells in one batch request
    const cellValues = await this.batchReadCells(spreadsheetId, cellsToRead, sheetName);

    // Parse fellowship data from batch results
    const fellowship = {};
    
    // Fellowship name (from AC4, merged across AC4:AM4)
    fellowship.name = cellValues['AC4'] || '';
    if (!fellowship.name) {
      throw new Error('Fellowship name is empty - invalid sheet');
    }

    // Parse power tags (AC7:AL7 through AC13:AL13, merged cells per row)
    fellowship.tags = [];
    for (let row = 7; row <= 13; row++) {
      const cell = `AC${row}`;
      const tag = cellValues[cell];
      if (tag && tag.trim()) {
        fellowship.tags.push(tag.trim());
      }
    }

    // Parse weaknesses (AC16:AM16 and AC17:AM17, merged cells per row)
    fellowship.weaknesses = [];
    for (let row = 16; row <= 17; row++) {
      const cell = `AC${row}`;
      const weakness = cellValues[cell];
      if (weakness && weakness.trim()) {
        fellowship.weaknesses.push(weakness.trim());
      }
    }

    return fellowship;
  }

  /**
   * Subscribe to changes for a Google Drive file (spreadsheet)
   * Uses Google Drive API push notifications
   * @param {string} spreadsheetId - The spreadsheet ID
   * @param {string} webhookUrl - The URL to receive notifications
   * @returns {Promise<Object>} { channelId, resourceId, expiration }
   */
  async subscribeToFileChanges(spreadsheetId, webhookUrl) {
    if (!this.isReady() || !this.drive) {
      throw new Error('Google Drive service not initialized');
    }

    // Generate a unique channel ID (UUID format)
    const channelId = this.generateChannelId();
    
    // Get file metadata to get the resource ID
    const file = await this.drive.files.get({
      fileId: spreadsheetId,
      fields: 'id',
    });

    const resourceId = file.data.id;

    // Create a watch channel (subscription expires in 7 days max, we'll use 6 days to be safe)
    const expirationMs = Date.now() + (6 * 24 * 60 * 60 * 1000);
    const expiration = Math.floor(expirationMs / 1000);

    try {
      const response = this.drive.files.watch({
        fileId: spreadsheetId,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
          expiration: expirationMs,
        },
      });

      return {
        channelId: response.data.id || channelId,
        resourceId: response.data.resourceId || resourceId,
        expiration: Math.floor(response.data.expiration / 1000) || expiration,
      };
    } catch (error) {
      throw new Error(`Failed to create Drive API subscription: ${error.message}`);
    }
  }

  /**
   * Stop a Drive API subscription
   * @param {string} channelId - The channel ID
   * @param {string} resourceId - The resource ID
   */
  async unsubscribeFromFileChanges(channelId, resourceId) {
    if (!this.isReady() || !this.drive) {
      throw new Error('Google Drive service not initialized');
    }

    try {
      await this.drive.channels.stop({
        requestBody: {
          id: channelId,
          resourceId: resourceId,
        },
      });
    } catch (error) {
      // Don't throw if subscription already expired or doesn't exist
      if (!error.message.includes('not found') && !error.message.includes('404')) {
        console.warn(`Failed to stop Drive API subscription ${channelId}:`, error.message);
      }
    }
  }

  /**
   * Generate a unique channel ID for Drive API subscriptions
   * Format: UUID-like string
   */
  generateChannelId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Export singleton instance
const sheetsService = new GoogleSheetsService();
export default sheetsService;
