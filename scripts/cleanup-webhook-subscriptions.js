#!/usr/bin/env node
/**
 * Script to clean up abandoned or expired webhook subscriptions
 * Usage: node scripts/cleanup-webhook-subscriptions.js [guildId] [--dry-run]
 */

import { WebhookSubscriptionStorage } from '../utils/WebhookSubscriptionStorage.js';
import { CharacterStorage } from '../utils/CharacterStorage.js';
import { FellowshipStorage } from '../utils/FellowshipStorage.js';
import sheetsService from '../utils/GoogleSheetsService.js';
import { getDbForGuild } from '../utils/Database.js';
import { initializeEnvs } from '../utils/ServerConfig.js';

// Load environment variables
initializeEnvs();

const guildId = process.argv[2] || process.env.GUILD_ID;
const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-n');

if (!guildId) {
  console.error('❌ Guild ID required. Usage: node scripts/cleanup-webhook-subscriptions.js <guildId> [--dry-run]');
  console.error('   Or set GUILD_ID in environment variables');
  process.exit(1);
}

console.log(`\n🧹 Cleaning up webhook subscriptions for guild: ${guildId}`);
if (dryRun) {
  console.log('   ⚠️  DRY RUN MODE - No changes will be made\n');
} else {
  console.log('   ⚠️  LIVE MODE - Subscriptions will be deleted\n');
}

try {
  // Get all subscriptions
  const subscriptions = WebhookSubscriptionStorage.getAllSubscriptions(guildId);

  if (subscriptions.length === 0) {
    console.log('✅ No webhook subscriptions found.\n');
    process.exit(0);
  }

  console.log(`📋 Found ${subscriptions.length} subscription(s) to check:\n`);

  const now = Math.floor(Date.now() / 1000);
  let expiredCount = 0;
  let orphanedCount = 0;
  let validCount = 0;
  const toDelete = [];

  // Check each subscription
  for (const sub of subscriptions) {
    const expiresIn = sub.expiration - now;
    const isExpired = expiresIn < 0;
    
    // Check if resource still exists
    let resourceExists = false;
    if (sub.resource_type === 'character') {
      const character = CharacterStorage.getCharacterById(guildId, sub.resource_id);
      resourceExists = !!character;
    } else if (sub.resource_type === 'fellowship') {
      const fellowship = FellowshipStorage.getFellowship(guildId, sub.resource_id);
      resourceExists = !!fellowship;
    }

    const isOrphaned = !resourceExists;
    const shouldDelete = isExpired || isOrphaned;

    if (shouldDelete) {
      toDelete.push({ sub, reason: isExpired ? 'expired' : 'orphaned' });
      if (isExpired) expiredCount++;
      if (isOrphaned) orphanedCount++;
    } else {
      validCount++;
    }

    // Display status
    const status = shouldDelete 
      ? (isExpired ? '⏰ EXPIRED' : '👻 ORPHANED')
      : '✅ VALID';
    
    console.log(`${status} ${sub.resource_type.toUpperCase()} #${sub.resource_id}`);
    console.log(`   Spreadsheet: ${sub.spreadsheet_id}`);
    console.log(`   Channel ID: ${sub.channel_id}`);
    if (isExpired) {
      const daysAgo = Math.floor(Math.abs(expiresIn) / 86400);
      console.log(`   Expired: ${daysAgo} days ago`);
    } else if (!isOrphaned) {
      const daysLeft = Math.floor(expiresIn / 86400);
      console.log(`   Expires: ${daysLeft} days`);
    }
    if (isOrphaned) {
      console.log(`   Resource no longer exists`);
    }
    console.log('');
  }

  // Summary
  console.log('📊 Summary:');
  console.log(`   Total: ${subscriptions.length}`);
  console.log(`   ✅ Valid: ${validCount}`);
  console.log(`   ⏰ Expired: ${expiredCount}`);
  console.log(`   👻 Orphaned: ${orphanedCount}`);
  console.log(`   🗑️  To delete: ${toDelete.length}`);
  console.log('');

  if (toDelete.length === 0) {
    console.log('✅ No subscriptions need cleanup!\n');
    process.exit(0);
  }

  // Delete subscriptions
  if (dryRun) {
    console.log('🔍 DRY RUN - Would delete the following subscriptions:\n');
    toDelete.forEach(({ sub, reason }) => {
      console.log(`   - ${sub.resource_type} #${sub.resource_id} (${reason})`);
    });
    console.log('\n   Run without --dry-run to actually delete them.\n');
  } else {
    console.log(`🗑️  Deleting ${toDelete.length} subscription(s)...\n`);
    
    let successCount = 0;
    let failCount = 0;

    for (const { sub, reason } of toDelete) {
      try {
        console.log(`   Deleting ${sub.resource_type} #${sub.resource_id} (${reason})...`);
        
        // Try to stop the subscription via Drive API
        try {
          await sheetsService.unsubscribeFromFileChanges(sub.channel_id, sub.resource_id_drive);
          console.log(`      ✓ Stopped Drive API subscription`);
        } catch (error) {
          // Subscription might already be expired/stopped, that's okay
          console.log(`      ⚠️  Could not stop Drive API subscription (may already be expired): ${error.message}`);
        }

        // Delete from database
        const db = getDbForGuild(guildId);
        db.prepare(`
          DELETE FROM webhook_subscriptions
          WHERE guild_id = ? AND resource_type = ? AND resource_id = ?
        `).run(guildId, sub.resource_type, sub.resource_id);
        
        console.log(`      ✓ Deleted from database\n`);
        successCount++;
      } catch (error) {
        console.error(`      ❌ Failed: ${error.message}\n`);
        failCount++;
      }
    }

    console.log('📊 Cleanup Summary:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log('');

    if (failCount > 0) {
      console.log('⚠️  Some subscriptions failed to delete. Check the errors above.');
      process.exit(1);
    } else {
      console.log('✅ All subscriptions cleaned up successfully!\n');
    }
  }

} catch (error) {
  console.error('❌ Error cleaning up webhooks:', error.message);
  process.exit(1);
}

