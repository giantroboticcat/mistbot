#!/usr/bin/env node
import { getDbForGuild } from '../utils/Database.js';
import { MigrationManager } from '../utils/MigrationManager.js';
import { initializeEnvs, getKnownGuildIds, getGuildIdsWithDatabases } from '../utils/ServerConfig.js';

// Load environment variables (base .env and all guild-specific .env.{guildId} files)
initializeEnvs();

/**
 * CLI script to run pending database migrations for all guilds
 */

console.log('🔄 Database Migration Runner (Multi-Guild)\n');

async function runMigrationsForGuild(guildId) {
  try {
    const db = getDbForGuild(guildId);
    const manager = new MigrationManager(db);
    
    // Get current status
    const statusBefore = manager.getStatus();
    
    if (statusBefore.pending.count === 0) {
      return { guildId, status: 'up-to-date', applied: 0, migrations: [] };
    }
    
    // Run pending migrations
    const result = manager.runPendingMigrations();
    
    return { guildId, status: 'updated', applied: result.count, migrations: result.migrations };
  } catch (error) {
    return { guildId, status: 'error', error: error.message, applied: 0, migrations: [] };
  }
}

async function main() {
  try {
    // Get all guild IDs (from env vars and existing databases)
    const knownGuildIds = getKnownGuildIds();
    
    // Combine and deduplicate
    const allGuildIds = new Set([...knownGuildIds]);
    
    if (allGuildIds.size === 0) {
      console.log('⚠️  No guild IDs found in environment or database files.');
      console.log('   Using default guild ID...\n');
      allGuildIds.add(process.env.DEFAULT_GUILD_ID || 'default');
    }
    
    console.log(`📋 Found ${allGuildIds.size} guild(s) to migrate:\n`);
    Array.from(allGuildIds).forEach((guildId, index) => {
      console.log(`   ${index + 1}. Guild: ${guildId}`);
    });
    
    console.log('\n🚀 Running migrations for all guilds...\n');
    
    // Run migrations for each guild
    const results = [];
    for (const guildId of allGuildIds) {
      console.log(`📦 Processing guild ${guildId}...`);
      const result = await runMigrationsForGuild(guildId);
      results.push(result);
      
      if (result.status === 'up-to-date') {
        console.log(`   ✅ Guild ${guildId}: Already up to date\n`);
      } else if (result.status === 'updated') {
        console.log(`   ✅ Guild ${guildId}: Applied ${result.applied} migration(s)`);
        result.migrations.forEach((name, index) => {
          console.log(`      ${index + 1}. ${name} ✓`);
        });
        console.log('');
      } else if (result.status === 'error') {
        console.log(`   ❌ Guild ${guildId}: Error - ${result.error}\n`);
      }
    }
    
    // Summary
    const successful = results.filter(r => r.status === 'updated').length;
    const upToDate = results.filter(r => r.status === 'up-to-date').length;
    const errors = results.filter(r => r.status === 'error').length;
    const totalApplied = results.reduce((sum, r) => sum + r.applied, 0);
    
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Updated: ${successful} guild(s)`);
    console.log(`   ✓ Up to date: ${upToDate} guild(s)`);
    if (errors > 0) {
      console.log(`   ❌ Errors: ${errors} guild(s)`);
    }
    console.log(`   📦 Total migrations applied: ${totalApplied}`);
    
    if (errors > 0) {
      console.log('\n⚠️  Some migrations failed. Review the errors above.');
      process.exit(1);
    } else {
      console.log('\n✨ All guild databases are now up to date!\n');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\n💡 Tips:');
    console.error('   - Check the SQL syntax in the migration file');
    console.error('   - Ensure the database is not locked by another process');
    console.error('   - Review the error message above for details');
    console.error('   - The database has been rolled back to its previous state\n');
    process.exit(1);
  }
}

main();

