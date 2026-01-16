import { readdirSync } from 'fs';
import { join } from 'path';
import { getDbForGuild } from '../utils/Database.js';
import sheetsService from '../utils/GoogleSheetsService.js';
import { initializeEnvs } from '../utils/ServerConfig.js';

// Initialize environment variables (base .env and all guild-specific .env.{guildId} files)
initializeEnvs();

// Suppress migration warnings during script execution
// We're only reading data, not running migrations
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
console.log = function(...args) {
  // Filter out migration warnings
  const message = args.join(' ');
  if (message.includes('Database migrations are pending')) {
    return; // Suppress migration warnings
  }
  originalConsoleLog.apply(console, args);
};
console.warn = function(...args) {
  // Filter out migration warnings
  const message = args.join(' ');
  if (message.includes('Database migrations are pending')) {
    return; // Suppress migration warnings
  }
  originalConsoleWarn.apply(console, args);
};

/**
 * Get all guild IDs from database files in the data directory
 * Only includes guild IDs that match Discord guild ID format (17-19 digits)
 * @returns {string[]} Array of guild IDs
 */
function getAllGuildIds() {
  const dataDir = join(process.cwd(), 'data');
  try {
    const files = readdirSync(dataDir);
    const guildIds = files
      .filter(file => file.endsWith('.db') && file.startsWith('mistbot-'))
      .map(file => {
        // Extract guild ID from filename: mistbot-{guildId}.db
        // Only match Discord guild IDs (17-19 digits) to avoid matching "1", "default", etc.
        const match = file.match(/^mistbot-(\d{17,19})\.db$/);
        return match ? match[1] : null;
      })
      .filter(guildId => {
        // Filter out nulls and ensure it's a valid Discord guild ID (17-19 digits)
        if (!guildId) return false;
        // Discord guild IDs are 17-19 digits, so "1" won't match the regex above
        // But add explicit check just in case
        return guildId.length >= 17 && guildId.length <= 19;
      });
    
    return guildIds;
  } catch (error) {
    console.error('❌ Error reading data directory:', error.message);
    return [];
  }
}

/**
 * Get all characters for a guild
 * @param {string} guildId - Guild ID
 * @returns {Array} Array of character objects with id, user_id, name, google_sheet_url
 */
function getAllCharacters(guildId) {
  const db = getDbForGuild(guildId);
  const stmt = db.prepare(`
    SELECT id, user_id, name, google_sheet_url
    FROM characters
    WHERE google_sheet_url IS NOT NULL AND google_sheet_url != ''
  `);
  return stmt.all();
}

/**
 * Read improvements from a character's Google Sheet
 * @param {string} sheetUrl - Google Sheet URL
 * @returns {Promise<Array>} Array of improvement counts per theme [count1, count2, count3, count4]
 */
async function readImprovementsFromSheet(sheetUrl) {
  if (!sheetsService.isReady()) {
    throw new Error('Google Sheets service not initialized');
  }

  const parsed = sheetsService.parseSpreadsheetUrl(sheetUrl);
  if (!parsed) {
    throw new Error('Invalid Google Sheets URL');
  }
  
  const { spreadsheetId, gid } = parsed;
  const sheetName = gid ? await sheetsService.getSheetNameFromGid(spreadsheetId, gid) : null;

  // Theme configurations
  const themeConfigs = [
    { nameCell: 'BF7' },
    { nameCell: 'BS7' },
    { nameCell: 'CF7' },
    { nameCell: 'CS7' },
  ];

  // Build list of improvement cells to read
  const cellsToRead = [];
  for (const config of themeConfigs) {
    // Improvements are at row 28, one column after nameCell
    const nameCol = config.nameCell.match(/^[A-Z]+/)[0];
    const improvementStartCol = sheetsService.incrementColumn(nameCol, 1);
    for (let i = 0; i < 3; i++) {
      const improvementCol = sheetsService.incrementColumn(improvementStartCol, i);
      cellsToRead.push(`${improvementCol}28`);
    }
  }

  // Read all improvement cells in one batch request
  const cellValues = await sheetsService.batchReadCells(spreadsheetId, cellsToRead, sheetName);

  // Parse improvements for each theme
  const improvements = [];
  for (let themeIndex = 0; themeIndex < 4; themeIndex++) {
    const config = themeConfigs[themeIndex];
    const nameCol = config.nameCell.match(/^[A-Z]+/)[0];
    const improvementStartCol = sheetsService.incrementColumn(nameCol, 1);
    
    let improvementCount = 0;
    for (let i = 0; i < 3; i++) {
      const improvementCol = sheetsService.incrementColumn(improvementStartCol, i);
      if (sheetsService.isTruthy(cellValues[`${improvementCol}28`])) {
        improvementCount++;
      }
    }
    improvements.push(improvementCount);
  }

  return improvements;
}

/**
 * Update improvements for a character's themes
 * @param {string} guildId - Guild ID
 * @param {number} characterId - Character ID
 * @param {Array<number>} improvements - Array of improvement counts [count1, count2, count3, count4]
 */
function updateThemeImprovements(guildId, characterId, improvements) {
  const db = getDbForGuild(guildId);
  
  // Get theme IDs in order
  const themesStmt = db.prepare(`
    SELECT id, theme_order
    FROM character_themes
    WHERE character_id = ?
    ORDER BY theme_order
  `);
  const themes = themesStmt.all(characterId);

  if (themes.length !== 4) {
    throw new Error(`Expected 4 themes, found ${themes.length}`);
  }

  // Update improvements for each theme
  const updateStmt = db.prepare(`
    UPDATE character_themes
    SET improvements = ?
    WHERE id = ?
  `);

  for (let i = 0; i < 4; i++) {
    const theme = themes[i];
    const improvementCount = improvements[i] || 0;
    updateStmt.run(improvementCount, theme.id);
  }
}

/**
 * Main migration function
 */
async function migrateImprovements() {
  // Check if Google Sheets service is ready
  if (!sheetsService.isReady()) {
    console.error('❌ Google Sheets service not initialized.');
    console.error('   Make sure google-credentials.json exists in the project root.');
    process.exit(1);
  }

  // Get all guild IDs from database files
  const guildIds = getAllGuildIds();
  
  if (guildIds.length === 0) {
    console.error('❌ No guild databases found in data directory.');
    console.error('   Make sure you have at least one server database file (mistbot-{guildId}.db)');
    process.exit(1);
  }

  console.log('🔄 Migrating improvements from Google Sheets...');
  console.log(`   Servers found: ${guildIds.length}\n`);

  let totalCharacters = 0;
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  for (const guildId of guildIds) {
    console.log(`📡 Processing guild ${guildId}...`);
    
    const characters = getAllCharacters(guildId);
    totalCharacters += characters.length;

    if (characters.length === 0) {
      console.log(`   ⏭️  No characters with Google Sheet URLs found`);
      console.log('');
      continue;
    }

    console.log(`   Found ${characters.length} character(s) with Google Sheet URLs\n`);

    for (const character of characters) {
      try {
        console.log(`   📄 Character: ${character.name} (ID: ${character.id})`);
        console.log(`      Sheet: ${character.google_sheet_url}`);

        // Read improvements from sheet
        const improvements = await readImprovementsFromSheet(character.google_sheet_url);
        console.log(`      Improvements from sheet: [${improvements.join(', ')}]`);

        // Update database
        updateThemeImprovements(guildId, character.id, improvements);
        console.log(`      ✅ Updated database with improvements`);
        
        successCount++;
      } catch (error) {
        console.error(`      ❌ Error: ${error.message}`);
        failureCount++;
      }
      console.log('');
    }
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Total characters processed: ${totalCharacters}`);
  console.log(`✅ Successfully migrated: ${successCount}`);
  if (skippedCount > 0) {
    console.log(`⏭️  Skipped: ${skippedCount}`);
  }
  if (failureCount > 0) {
    console.log(`❌ Failed: ${failureCount}`);
  }

  if (failureCount > 0) {
    process.exit(1);
  }
  
  if (successCount === 0) {
    console.log('\n⚠️  No characters were migrated. Make sure characters have google_sheet_url set.');
  } else {
    console.log('\n✨ Migration completed successfully!');
  }
}

// Run the script
migrateImprovements().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

