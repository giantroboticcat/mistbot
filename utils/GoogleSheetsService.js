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
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
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
    // Format: #gid=123456 or &gid=123456
    const gidMatch = url.match(/[#&]gid=(\d+)/);
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
      return sheet ? sheet.properties.title : null;
    } catch (error) {
      console.error('Error getting sheet name:', error.message);
      return null;
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
   */
  async batchReadCells(spreadsheetId, cells, sheetName = null) {
    try {
      const ranges = cells.map(cell => 
        sheetName ? `'${sheetName}'!${cell}` : cell
      );

      const response = await this.sheets.spreadsheets.values.batchGet({
        spreadsheetId,
        ranges,
      });

      // Map results back to cell references
      const result = {};
      response.data.valueRanges.forEach((range, index) => {
        const cell = cells[index];
        const value = range.values?.[0]?.[0];
        result[cell] = value ? String(value).trim() : '';
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to batch read cells: ${error.message}`);
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
      const item = character.backpack?.[i] || '';
      batchUpdates.push({ cell: `AP${4 + i}`, value: item });
    }

    // Story tags
    for (let i = 0; i < 17; i++) {
      const tag = character.storyTags?.[i] || '';
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
}

// Export singleton instance
const sheetsService = new GoogleSheetsService();
export default sheetsService;
