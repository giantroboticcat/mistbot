#!/usr/bin/env node
import { db } from '../utils/Database.js';

/**
 * Fix status power levels from old format
 * Old format: "Status Name-3" or "Status Name (Power 3)"
 * New format: status="Status Name", power_3=1
 */

console.log('🔧 Fixing status power levels...\n');

try {
  // Get all statuses
  const statuses = db.prepare('SELECT * FROM character_statuses').all();
  
  if (statuses.length === 0) {
    console.log('No statuses found in database.');
    process.exit(0);
  }
  
  console.log(`Found ${statuses.length} status(es) to check...\n`);
  
  let fixed = 0;
  let skipped = 0;
  
  const updateStmt = db.prepare(`
    UPDATE character_statuses 
    SET status = ?, power_1 = ?, power_2 = ?, power_3 = ?, power_4 = ?, power_5 = ?, power_6 = ?
    WHERE id = ?
  `);
  
  for (const status of statuses) {
    const originalStatus = status.status;
    
    // Check if already has power levels set
    const hasPowerLevels = status.power_1 || status.power_2 || status.power_3 || 
                           status.power_4 || status.power_5 || status.power_6;
    
    if (hasPowerLevels) {
      console.log(`✓ Skipping "${originalStatus}" - already has power levels`);
      skipped++;
      continue;
    }
    
    // Try to parse old formats
    let statusName = originalStatus;
    let powerLevel = 0;
    
    // Format 1: "Status Name-3" or "Status Name -3"
    const dashMatch = originalStatus.match(/^(.+?)\s*-\s*(\d+)$/);
    if (dashMatch) {
      statusName = dashMatch[1].trim();
      powerLevel = parseInt(dashMatch[2]);
    } else {
      // Format 2: "Status Name (Power 3)"
      const parenMatch = originalStatus.match(/^(.+?)\s*\(Power\s+(\d+)\)$/i);
      if (parenMatch) {
        statusName = parenMatch[1].trim();
        powerLevel = parseInt(parenMatch[2]);
      }
    }
    
    // Validate power level
    if (powerLevel < 0 || powerLevel > 6) {
      console.log(`⚠️  Skipping "${originalStatus}" - invalid power level: ${powerLevel}`);
      skipped++;
      continue;
    }
    
    // Set power levels (if powerLevel is 0, all will be 0)
    const powers = {
      1: powerLevel >= 1 ? 1 : 0,
      2: powerLevel >= 2 ? 1 : 0,
      3: powerLevel >= 3 ? 1 : 0,
      4: powerLevel >= 4 ? 1 : 0,
      5: powerLevel >= 5 ? 1 : 0,
      6: powerLevel >= 6 ? 1 : 0,
    };
    
    // Update the status
    updateStmt.run(
      statusName,
      powers[1], powers[2], powers[3], powers[4], powers[5], powers[6],
      status.id
    );
    
    console.log(`✅ Fixed: "${originalStatus}" → "${statusName}" (Power ${powerLevel || 'none'})`);
    fixed++;
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log(`✅ Fixed: ${fixed} status(es)`);
  console.log(`⏭️  Skipped: ${skipped} status(es) (already correct)`);
  console.log('═'.repeat(60));
  console.log('\n✨ Done!\n');
  
  process.exit(0);
  
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

