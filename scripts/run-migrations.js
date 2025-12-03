#!/usr/bin/env node
import { db } from '../utils/Database.js';
import { MigrationManager } from '../utils/MigrationManager.js';

/**
 * CLI script to run pending database migrations
 */

console.log('🔄 Database Migration Runner\n');

try {
  const manager = new MigrationManager(db);
  
  // Get current status
  const statusBefore = manager.getStatus();
  
  console.log('📊 Current Status:');
  console.log(`   ✅ Applied: ${statusBefore.applied.count} migration(s)`);
  console.log(`   ⏳ Pending: ${statusBefore.pending.count} migration(s)`);
  
  if (statusBefore.pending.count === 0) {
    console.log('\n✨ Database is up to date! No migrations to run.');
    process.exit(0);
  }
  
  console.log('\n📋 Pending Migrations:');
  statusBefore.pending.migrations.forEach((name, index) => {
    console.log(`   ${index + 1}. ${name}`);
  });
  
  console.log('\n🚀 Running migrations...\n');
  
  // Run pending migrations
  const result = manager.runPendingMigrations();
  
  console.log('✅ Migration Results:');
  result.migrations.forEach((name, index) => {
    console.log(`   ${index + 1}. ${name} ✓`);
  });
  
  console.log(`\n✨ Successfully applied ${result.count} migration(s)!`);
  console.log('   Database is now up to date.\n');
  
  process.exit(0);
  
} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  console.error('\n💡 Tips:');
  console.error('   - Check the SQL syntax in the migration file');
  console.error('   - Ensure the database is not locked by another process');
  console.error('   - Review the error message above for details');
  console.error('   - The database has been rolled back to its previous state\n');
  process.exit(1);
}

