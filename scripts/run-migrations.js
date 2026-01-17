#!/usr/bin/env node
import { getDbForGuild } from '../utils/Database.js';
import { MigrationManager } from '../utils/MigrationManager.js';
import { initializeEnvs, getKnownGuildIds, getGuildIdsWithDatabases } from '../utils/ServerConfig.js';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

// Load environment variables (base .env and all guild-specific .env.{guildId} files)
initializeEnvs();

/**
 * CLI script to run pending database migrations for all guilds
 */

console.log('🔄 Database Migration Runner (Multi-Guild)\n');

/**
 * Get the database file path for a guild
 * @param {string} guildId - Guild ID
 * @returns {string} Database file path
 */
function getDbPath(guildId) {
  if (process.env.DB_PATH) {
    const dbPath = resolve(process.cwd(), process.env.DB_PATH);
    if (dbPath.includes('{guildId}')) {
      return dbPath.replace('{guildId}', guildId);
    }
    if (dbPath.endsWith('.db')) {
      const dir = dbPath.substring(0, dbPath.lastIndexOf('/'));
      const baseName = dbPath.substring(dbPath.lastIndexOf('/') + 1, dbPath.lastIndexOf('.db'));
      return join(dir, `${baseName}-${guildId}.db`);
    }
    return dbPath;
  }
  return join(process.cwd(), 'data', `mistbot-${guildId}.db`);
}

/**
 * Backup database file before migration
 * @param {string} guildId - Guild ID
 * @returns {string|null} Path to backup file, or null if backup failed
 */
function backupDatabase(guildId) {
  try {
    const dbPath = getDbPath(guildId);
    
    // Check if database file exists
    if (!existsSync(dbPath)) {
      console.log(`   ⚠️  Database file not found: ${dbPath}`);
      return null;
    }
    
    // Create backups directory if it doesn't exist
    const backupsDir = join(process.cwd(), 'data', 'backups');
    if (!existsSync(backupsDir)) {
      mkdirSync(backupsDir, { recursive: true });
    }
    
    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const dbFileName = dbPath.split('/').pop();
    const backupPath = join(backupsDir, `${dbFileName}.backup-${timestamp}`);
    
    // Copy database file
    copyFileSync(dbPath, backupPath);
    
    // Also backup WAL mode files if they exist
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    
    if (existsSync(walPath)) {
      copyFileSync(walPath, `${backupPath}-wal`);
    }
    if (existsSync(shmPath)) {
      copyFileSync(shmPath, `${backupPath}-shm`);
    }
    
    return backupPath;
  } catch (error) {
    console.error(`   ❌ Failed to backup database: ${error.message}`);
    return null;
  }
}

async function runMigrationsForGuild(guildId) {
  try {
    // Backup database before migration
    const backupPath = backupDatabase(guildId);
    if (backupPath) {
      console.log(`   💾 Backup created: ${backupPath.split('/').pop()}`);
    }
    
    const db = getDbForGuild(guildId);
    const manager = new MigrationManager(db);
    
    // Get current status
    const statusBefore = manager.getStatus();
    
    if (statusBefore.pending.count === 0) {
      return { guildId, status: 'up-to-date', applied: 0, migrations: [], backupPath };
    }
    
    // Run pending migrations
    const result = manager.runPendingMigrations();
    
    return { guildId, status: 'updated', applied: result.count, migrations: result.migrations, backupPath };
  } catch (error) {
    return { guildId, status: 'error', error: error.message, applied: 0, migrations: [], backupPath: null };
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
        console.log(`   ✅ Guild ${guildId}: Already up to date`);
        if (result.backupPath) {
          console.log(`   💾 Backup available: ${result.backupPath.split('/').pop()}`);
        }
        console.log('');
      } else if (result.status === 'updated') {
        console.log(`   ✅ Guild ${guildId}: Applied ${result.applied} migration(s)`);
        result.migrations.forEach((name, index) => {
          console.log(`      ${index + 1}. ${name} ✓`);
        });
        if (result.backupPath) {
          console.log(`   💾 Backup available: ${result.backupPath.split('/').pop()}`);
        }
        console.log('');
      } else if (result.status === 'error') {
        console.log(`   ❌ Guild ${guildId}: Error - ${result.error}`);
        if (result.backupPath) {
          console.log(`   💾 Backup available: ${result.backupPath.split('/').pop()}`);
          console.log(`   💡 To restore: cp ${result.backupPath} ${getDbPath(guildId)}`);
        }
        console.log('');
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
      console.log('💡 Backups are available in the data/backups/ directory');
      console.log('   You can restore a database by copying the backup file over the original.\n');
      process.exit(1);
    } else {
      console.log('\n✨ All guild databases are now up to date!');
      console.log('💾 Backups are available in the data/backups/ directory\n');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\n💡 Tips:');
    console.error('   - Check the SQL syntax in the migration file');
    console.error('   - Ensure the database is not locked by another process');
    console.error('   - Review the error message above for details');
    console.error('   - Backups are available in the data/backups/ directory');
    console.error('   - You can restore a database by copying the backup file over the original\n');
    process.exit(1);
  }
}

main();

