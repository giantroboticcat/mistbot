import { readdirSync } from 'fs';
import { join } from 'path';
import { FellowshipStorage } from '../utils/FellowshipStorage.js';
import { initializeEnvs, getServerEnv } from '../utils/ServerConfig.js';

// Initialize environment variables (base .env and all guild-specific .env.{guildId} files)
initializeEnvs();

/**
 * Get all guild IDs from database files in the data directory
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
        const match = file.match(/^mistbot-(.+)\.db$/);
        return match ? match[1] : null;
      })
      .filter(guildId => guildId !== null && guildId !== 'default');
    
    return guildIds;
  } catch (error) {
    console.error('❌ Error reading data directory:', error.message);
    return [];
  }
}

/**
 * Script to sync fellowship data from Google Sheets for all servers
 * Reads FELLOWSHIP_SHEET_URL from each guild's .env.{guildId} file
 */
async function syncFellowship() {
  // Get all guild IDs from database files
  const guildIds = getAllGuildIds();
  
  if (guildIds.length === 0) {
    console.error('❌ No guild databases found in data directory.');
    console.error('   Make sure you have at least one server database file (mistbot-{guildId}.db)');
    process.exit(1);
  }

  console.log('🔄 Syncing fellowship from Google Sheets...');
  console.log(`   Servers found: ${guildIds.length}\n`);

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  for (const guildId of guildIds) {
    // Get fellowship sheet URL for this guild
    const sheetUrl = getServerEnv('FELLOWSHIP_SHEET_URL', guildId);
    
    if (!sheetUrl) {
      console.log(`⏭️  Skipping guild ${guildId} - FELLOWSHIP_SHEET_URL not set in .env.${guildId}`);
      skippedCount++;
      continue;
    }

    try {
      console.log(`📡 Syncing guild ${guildId}...`);
      console.log(`   URL: ${sheetUrl}`);
      const result = await FellowshipStorage.syncFromSheet(guildId, sheetUrl);

      if (result.success) {
        console.log(`   ✅ ${result.message}`);
        console.log(`      Fellowship: ${result.fellowship.name}`);
        console.log(`      Tags: ${result.fellowship.tags.length}`);
        console.log(`      Weaknesses: ${result.fellowship.weaknesses.length}`);
        successCount++;
      } else {
        console.error(`   ❌ ${result.message}`);
        failureCount++;
      }
    } catch (error) {
      console.error(`   ❌ Error syncing guild ${guildId}: ${error.message}`);
      failureCount++;
    }
    console.log('');
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Successfully synced: ${successCount}`);
  if (skippedCount > 0) {
    console.log(`⏭️  Skipped (no URL configured): ${skippedCount}`);
  }
  if (failureCount > 0) {
    console.log(`❌ Failed: ${failureCount}`);
  }
  console.log(`📊 Total servers: ${guildIds.length}`);

  if (failureCount > 0) {
    process.exit(1);
  }
  
  if (successCount === 0 && skippedCount === guildIds.length) {
    console.log('\n⚠️  No guilds were synced. Make sure FELLOWSHIP_SHEET_URL is set in at least one .env.{guildId} file.');
  }
}

// Run the script
syncFellowship();

