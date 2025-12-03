#!/usr/bin/env node
import { db } from '../utils/Database.js';
import { MigrationManager } from '../utils/MigrationManager.js';

/**
 * CLI script to check migration status
 */

console.log('📊 Database Migration Status\n');

try {
  const manager = new MigrationManager(db);
  const status = manager.getStatus();
  
  console.log('✅ Applied Migrations:');
  if (status.applied.count === 0) {
    console.log('   (none)');
  } else {
    status.applied.migrations.forEach((name, index) => {
      console.log(`   ${index + 1}. ${name}`);
    });
  }
  
  console.log('\n⏳ Pending Migrations:');
  if (status.pending.count === 0) {
    console.log('   (none)');
  } else {
    status.pending.migrations.forEach((name, index) => {
      console.log(`   ${index + 1}. ${name}`);
    });
  }
  
  console.log('\n' + '═'.repeat(50));
  console.log(`Total: ${status.applied.count} applied, ${status.pending.count} pending`);
  
  if (manager.isUpToDate()) {
    console.log('Status: ✨ Up to date\n');
  } else {
    console.log('Status: ⚠️  Migrations pending\n');
    console.log('💡 Run `npm run migration:run` to apply pending migrations.\n');
  }
  
  process.exit(0);
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

