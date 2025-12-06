import dotenv from 'dotenv';
import { FellowshipStorage } from '../utils/FellowshipStorage.js';

// Load environment variables
dotenv.config();

/**
 * Script to sync fellowship data from Google Sheets
 * Reads FELLOWSHIP_SHEET_URL from .env file
 */
async function syncFellowship() {
  const sheetUrl = process.env.FELLOWSHIP_SHEET_URL;
  
  if (!sheetUrl) {
    console.error('❌ FELLOWSHIP_SHEET_URL is not set in your .env file.');
    console.error('   Please add: FELLOWSHIP_SHEET_URL=https://docs.google.com/spreadsheets/d/...');
    process.exit(1);
  }

  console.log('🔄 Syncing fellowship from Google Sheets...');
  console.log(`   URL: ${sheetUrl}\n`);

  try {
    const result = await FellowshipStorage.syncFromSheet(sheetUrl);

    if (result.success) {
      console.log(`✅ ${result.message}`);
      console.log(`   Fellowship: ${result.fellowship.name}`);
      console.log(`   Tags: ${result.fellowship.tags.length}`);
      console.log(`   Weaknesses: ${result.fellowship.weaknesses.length}`);
    } else {
      console.error(`❌ ${result.message}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error syncing fellowship:', error.message);
    process.exit(1);
  }
}

// Run the script
syncFellowship();

