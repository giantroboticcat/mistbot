#!/usr/bin/env node
/**
 * Script to check webhook subscription status
 * Usage: node scripts/check-webhooks.js [guildId]
 */

import { getDbForGuild } from '../utils/Database.js';
import { WebhookSubscriptionStorage } from '../utils/WebhookSubscriptionStorage.js';
import { initializeEnvs } from '../utils/ServerConfig.js';

// Load environment variables
initializeEnvs();

const guildId = process.argv[2] || process.env.GUILD_ID;

if (!guildId) {
  console.error('❌ Guild ID required. Usage: node scripts/check-webhooks.js <guildId>');
  console.error('   Or set GUILD_ID in environment variables');
  process.exit(1);
}

console.log(`\n🔍 Checking webhook subscriptions for guild: ${guildId}\n`);

try {
  // Get all subscriptions
  const subscriptions = WebhookSubscriptionStorage.getAllSubscriptions(guildId);

  if (subscriptions.length === 0) {
    console.log('⚠️  No webhook subscriptions found for this guild.\n');
    process.exit(0);
  }

  console.log(`📋 Found ${subscriptions.length} subscription(s):\n`);

  const now = Math.floor(Date.now() / 1000);

  subscriptions.forEach((sub, index) => {
    const expiresIn = sub.expiration - now;
    const expiresInHours = Math.floor(expiresIn / 3600);
    const expiresInDays = Math.floor(expiresInHours / 24);
    const isExpired = expiresIn < 0;
    const expiresSoon = expiresIn < 24 * 3600; // Less than 24 hours

    console.log(`${index + 1}. ${sub.resource_type.toUpperCase()} #${sub.resource_id}`);
    console.log(`   Spreadsheet ID: ${sub.spreadsheet_id}`);
    console.log(`   Channel ID: ${sub.channel_id}`);
    console.log(`   Webhook URL: ${sub.webhook_url}`);
    
    if (isExpired) {
      console.log(`   ⚠️  Status: EXPIRED ${Math.abs(expiresInDays)} days ago`);
    } else if (expiresSoon) {
      console.log(`   ⚠️  Status: Expires in ${expiresInHours} hours (${expiresInDays} days)`);
    } else {
      console.log(`   ✅ Status: Active (expires in ${expiresInDays} days)`);
    }
    
    console.log(`   Created: ${new Date(sub.created_at * 1000).toLocaleString()}`);
    console.log(`   Expires: ${new Date(sub.expiration * 1000).toLocaleString()}`);
    console.log('');
  });

  // Check for expiring subscriptions
  const expiring = WebhookSubscriptionStorage.getExpiringSubscriptions(guildId);
  if (expiring.length > 0) {
    console.log(`\n⚠️  Warning: ${expiring.length} subscription(s) expiring within 24 hours:`);
    expiring.forEach(sub => {
      const expiresIn = sub.expiration - now;
      const expiresInHours = Math.floor(expiresIn / 3600);
      console.log(`   - ${sub.resource_type} #${sub.resource_id}: expires in ${expiresInHours} hours`);
    });
    console.log('\n   Run renewal script or manually renew these subscriptions.\n');
  }

  // Summary
  const active = subscriptions.filter(s => s.expiration > now).length;
  const expired = subscriptions.filter(s => s.expiration <= now).length;
  
  console.log('📊 Summary:');
  console.log(`   Total: ${subscriptions.length}`);
  console.log(`   Active: ${active}`);
  console.log(`   Expired: ${expired}`);
  console.log('');

} catch (error) {
  console.error('❌ Error checking webhooks:', error.message);
  process.exit(1);
}

