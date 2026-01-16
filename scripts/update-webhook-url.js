#!/usr/bin/env node
/**
 * Script to update all webhook subscriptions with a new webhook URL
 * Useful when IP address or domain changes
 * Usage: node scripts/update-webhook-url.js [guildId]
 */

import { WebhookSubscriptionStorage } from '../utils/WebhookSubscriptionStorage.js';
import { initializeEnvs } from '../utils/ServerConfig.js';

// Load environment variables
initializeEnvs();

const guildId = process.argv[2] || process.env.GUILD_ID;
const webhookUrl = process.env.WEBHOOK_URL;

if (!guildId) {
  console.error('❌ Guild ID required. Usage: node scripts/update-webhook-url.js <guildId>');
  console.error('   Or set GUILD_ID in environment variables');
  process.exit(1);
}

if (!webhookUrl) {
  console.error('❌ WEBHOOK_URL not set in environment variables!');
  console.error('   Make sure WEBHOOK_URL is set in your .env file');
  process.exit(1);
}

// Build the full webhook URL with guild ID
const fullWebhookUrl = `${webhookUrl}/${guildId}`;

console.log(`\n🔄 Updating webhook subscriptions for guild: ${guildId}`);
console.log(`   New webhook URL: ${fullWebhookUrl}\n`);

try {
  // Get all subscriptions
  const subscriptions = WebhookSubscriptionStorage.getAllSubscriptions(guildId);

  if (subscriptions.length === 0) {
    console.log('⚠️  No webhook subscriptions found for this guild.\n');
    process.exit(0);
  }

  console.log(`📋 Found ${subscriptions.length} subscription(s) to update:\n`);

  let successCount = 0;
  let failCount = 0;

  for (const sub of subscriptions) {
    try {
      console.log(`   Updating ${sub.resource_type} #${sub.resource_id}...`);
      console.log(`      Old URL: ${sub.webhook_url}`);
      
      // Use createOrUpdateSubscription which will unsubscribe from old channel and create new one
      await WebhookSubscriptionStorage.createOrUpdateSubscription(
        guildId,
        sub.resource_type,
        sub.resource_id,
        sub.spreadsheet_id,
        fullWebhookUrl
      );
      
      console.log(`      ✅ Updated successfully\n`);
      successCount++;
    } catch (error) {
      console.error(`      ❌ Failed: ${error.message}\n`);
      failCount++;
    }
  }

  console.log('📊 Summary:');
  console.log(`   Total: ${subscriptions.length}`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log('');

  if (failCount > 0) {
    console.log('⚠️  Some subscriptions failed to update. Check the errors above.');
    process.exit(1);
  } else {
    console.log('✅ All webhook subscriptions updated successfully!\n');
  }

} catch (error) {
  console.error('❌ Error updating webhooks:', error.message);
  process.exit(1);
}

