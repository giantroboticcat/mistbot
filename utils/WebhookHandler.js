import { WebhookSubscriptionStorage } from './WebhookSubscriptionStorage.js';
import { CharacterStorage } from './CharacterStorage.js';
import * as FellowshipStorage from './FellowshipStorage.js';
import sheetsService from './GoogleSheetsService.js';

/**
 * Handler for webhook notifications from Google Drive API and Google Apps Script
 */
export class WebhookHandler {
  // Map to track pending sync timers: key = subscription key, value = timeout ID
  static pendingSyncs = new Map();
  
  // Debounce delay in milliseconds (5 seconds)
  static DEBOUNCE_DELAY_MS = 5000;
  
  /**
   * Generate a unique key for a subscription to track debouncing
   * @param {Object} subscription - The subscription object
   * @returns {string} Unique key
   */
  static getSubscriptionKey(subscription) {
    return `${subscription.guild_id}:${subscription.resource_type}:${subscription.resource_id}`;
  }
  
  /**
   * Handle incoming webhook notification (from Google Drive API or Apps Script)
   * @param {Object} notification - The notification payload (headers + body)
   * @param {string} guildId - Guild ID (extracted from notification or required)
   * @returns {Promise<Object>} Result with status and message
   */
  static async handleNotification(notification, guildId) {
    try {
      // Check if this is an Apps Script webhook (has type in body)
      // if (notification.body && notification.body.type === 'sheet_edit') {
        return await this.handleAppsScriptWebhook(notification.body, guildId);
      // }
      
      // Otherwise, treat as Google Drive API webhook
      // return await this.handleDriveApiWebhook(notification, guildId);
    } catch (error) {
      console.error('Error handling webhook notification:', error);
      return { success: false, message: error.message };
    }
  }
  
  /**
   * Handle incoming webhook from Google Apps Script
   * @param {Object} webhookData - The webhook payload from Apps Script
   * @param {string} guildId - Guild ID
   * @returns {Promise<Object>} Result with status and message
   */
  static async handleAppsScriptWebhook(webhookData, guildId) {
    try {
      const { resource_type, spreadsheet_id, sheet_id, sheet_name } = webhookData;
      
      console.log(`Received Apps Script webhook data: ${JSON.stringify(webhookData)}`);
      if (!resource_type || !spreadsheet_id || !sheet_id) {
        return { success: false, message: 'Missing required webhook data (resource_type,spreadsheet_id, sheet_id)' };
      }
      console.log(`Received Apps Script webhook for ${sheet_name || 'sheet'} (sheet_id: ${sheet_id})`);

      // Look up character by matching spreadsheet_id and sheet_id (gid) to character's google_sheet_url
      let character = null;
      if (resource_type === 'character') {
        // Optimized: Query database directly by spreadsheet_id and gid instead of loading all characters
        character = CharacterStorage.getCharacterBySpreadsheetAndGid(guildId, spreadsheet_id, sheet_id.toString());
        
        if (!character) {
          console.log(`No character found matching spreadsheet ${spreadsheet_id} tab ${sheet_id} (${sheet_name || 'unknown'})`);
          return { success: true, message: `No character found for tab ${sheet_id} in spreadsheet ${spreadsheet_id}` };
        }

        if (character.auto_sync === 0) {
          console.log(`Character ${character.name || character.id} (ID: ${character.id}) has auto-sync disabled - skipping sync`);
          return { success: true, message: `Character ${character.name || character.id} has auto-sync disabled - skipping sync` };
        }
        
        console.log(`Found character ${character.name || character.id} (ID: ${character.id}) for tab ${sheet_id} in spreadsheet ${spreadsheet_id}`);
      } else {
        return { success: false, message: `Unsupported resource type: ${resource_type}` };
      }
      
      // Create a minimal subscription record for tracking/debouncing
      const syntheticChannelId = `appsscript_${spreadsheet_id}_${sheet_id}`;
      const subscription = {
        guild_id: guildId,
        resource_type: 'character',
        resource_id: character.id,
        spreadsheet_id,
        channel_id: syntheticChannelId,
        resource_id_drive: spreadsheet_id,
        expiration: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days (Apps Script doesn't expire)
        webhook_url: 'appsscript'
      };
      
      console.log(`Received Apps Script webhook for ${sheet_name || 'sheet'} (character: ${character.name || character.id})`);
      
      // Schedule sync with debouncing
      return await this.scheduleChangeNotification(subscription);
    } catch (error) {
      console.error('Error handling Apps Script webhook:', error);
      return { success: false, message: error.message };
    }
  }
  
  /**
   * Handle incoming webhook notification from Google Drive API
   * @param {Object} notification - The notification payload
   * @param {string} guildId - Guild ID (extracted from notification or required)
   * @returns {Promise<Object>} Result with status and message
   */
  static async handleDriveApiWebhook(notification, guildId) {
    try {
      // Google Drive API sends different notification types
      // For initial sync, it sends a notification with header 'X-Goog-Resource-State': 'sync'
      // For actual changes, it sends 'X-Goog-Resource-State': 'update'

      const resourceState = notification.headers?.['x-goog-resource-state']?.toLowerCase();
      const channelId = notification.headers?.['x-goog-channel-id'];
      const resourceId = notification.headers?.['x-goog-resource-id'];

      if (!channelId || !resourceId) {
        return { success: false, message: 'Missing required notification headers' };
      }

      // Find subscription by channel ID
      const subscription = this.findSubscriptionByChannelId(guildId, channelId, resourceId);
      
      if (!subscription) {
        console.warn(`No subscription found for channel ${channelId} - attempting to stop orphaned subscription`);
        // Try to stop this orphaned subscription via Drive API
        try {
          await sheetsService.unsubscribeFromFileChanges(channelId, resourceId);
          console.log(`✓ Stopped orphaned subscription for channel ${channelId}`);
        } catch (error) {
          // Subscription might already be expired/stopped, that's okay
          console.log(`⚠️  Could not stop orphaned subscription (may already be expired): ${error.message}`);
        }
        return { success: true, message: 'Orphaned subscription stopped' };
      }

      // If it's just a sync notification (initial subscription confirmation), ignore it
      if (resourceState === 'sync') {
        return { success: true, message: 'Initial sync notification received' };
      }

      // Only process 'update' events (ignore 'add', 'remove', 'trash', 'untrash', etc.)
      if (resourceState === 'update') {
        // Check if content actually changed (not just metadata/permissions)
        const changed = notification.headers?.['x-goog-changed'];
        if (changed) {
          const changedList = changed.toLowerCase().split(',').map(c => c.trim());
          // Only sync if content changed, not just metadata/permissions
          if (changedList.includes('content')) {
            return await this.scheduleChangeNotification(subscription);
          } else {
            console.log(`Ignoring update event - no content change (changed: ${changed})`);
            return { success: true, message: `Update event ignored - no content change (${changed})` };
          }
        } else {
          // If X-Goog-Changed header is not present, assume content changed (backward compatibility)
          return await this.scheduleChangeNotification(subscription);
        }
      }

      // Ignore other event types (add, remove, trash, untrash, etc.)
      console.log(`Ignoring ${resourceState} event - not a content edit`);
      return { success: true, message: `Event type '${resourceState}' ignored - only processing content edits` };
    } catch (error) {
      console.error('Error handling Drive API webhook:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Find subscription by channel ID and resource ID
   * @param {string} guildId - Guild ID
   * @param {string} channelId - Channel ID
   * @param {string} resourceId - Resource ID from Drive API
   * @returns {Object|null} Subscription or null
   */
  static findSubscriptionByChannelId(guildId, channelId, resourceId) {
    try {
      // Try to find by channel ID first (more specific)
      const subscriptions = WebhookSubscriptionStorage.getAllSubscriptions(guildId);
      
      let subscription = subscriptions.find(s => s.channel_id === channelId);
      
      if (!subscription && resourceId) {
        // Fallback: try to find by resource ID (Drive file ID)
        // We need to match against spreadsheet_id since that's what we store
        // But resourceId from Drive API is the same as the file ID
        subscription = subscriptions.find(s => {
          // Check if resource_id_drive matches, or if spreadsheet_id matches
          return s.resource_id_drive === resourceId || s.spreadsheet_id === resourceId;
        });
      }

      return subscription || null;
    } catch (error) {
      console.error('Error finding subscription:', error);
      return null;
    }
  }

  /**
   * Schedule a change notification with debouncing
   * This prevents rapid-fire syncs when multiple edits happen quickly
   * @param {Object} subscription - The subscription record
   * @returns {Promise<Object>} Result with status and message (returns immediately)
   */
  static async scheduleChangeNotification(subscription) {
    const key = this.getSubscriptionKey(subscription);
    
    // Clear any existing timer for this subscription
    if (this.pendingSyncs.has(key)) {
      clearTimeout(this.pendingSyncs.get(key));
      console.log(`Debouncing webhook for ${subscription.resource_type} ${subscription.resource_id} - resetting timer`);
    }
    
    // Schedule a new sync after the debounce delay
    const timeoutId = setTimeout(async () => {
      this.pendingSyncs.delete(key);
      console.log(`Processing debounced webhook for ${subscription.resource_type} ${subscription.resource_id}`);
      try {
        await this.handleChangeNotification(subscription);
      } catch (error) {
        console.error(`Error in debounced sync for ${subscription.resource_type} ${subscription.resource_id}:`, error);
      }
    }, this.DEBOUNCE_DELAY_MS);
    
    this.pendingSyncs.set(key, timeoutId);
    console.log(`Scheduled webhook sync for ${subscription.resource_type} ${subscription.resource_id} in ${this.DEBOUNCE_DELAY_MS}ms`);
    
    // Return immediately to acknowledge the webhook (don't wait for sync)
    return { success: true, message: 'Webhook received, sync scheduled' };
  }

  /**
   * Handle a change notification - sync data from sheet
   * @param {Object} subscription - The subscription record
   * @returns {Promise<Object>} Result with status and message
   */
  static async handleChangeNotification(subscription) {
    const { guild_id, resource_type, resource_id, spreadsheet_id } = subscription;

    try {
      if (resource_type === 'character') {
        // Find character by ID
        const character = CharacterStorage.getCharacterById(guild_id, resource_id);

        if (!character) {
          return { success: false, message: 'Character not found' };
        }

        // Check if character has a sheet URL set
        if (!character.google_sheet_url) {
          console.warn(`Character ${character.name} (ID: ${resource_id}) has no sheet URL set - skipping sync`);
          return { success: false, message: 'Character has no sheet URL configured' };
        }

        // Verify the subscription matches the character's sheet
        const parsed = sheetsService.parseSpreadsheetUrl(character.google_sheet_url);
        if (!parsed || parsed.spreadsheetId !== spreadsheet_id) {
          console.warn(`Subscription spreadsheet ${spreadsheet_id} doesn't match character's sheet ${parsed?.spreadsheetId || 'unknown'}`);
          return { success: false, message: 'Subscription spreadsheet mismatch' };
        }

        // Use the character's stored sheet URL (which includes gid if present)
        // This ensures we sync from the correct tab
        console.log(`Syncing character ${character.name} from sheet ${character.google_sheet_url}`);
        const result = await CharacterStorage.syncFromSheet(guild_id, character.user_id, resource_id);
        console.log(`Sync result: ${result}`);
        return result;
      } else if (resource_type === 'fellowship') {
        // Sync fellowship from sheet
        const result = await FellowshipStorage.syncFromSheet(guild_id, sheetUrl);
        return result;
      }

      return { success: false, message: `Unknown resource type: ${resource_type}` };
    } catch (error) {
      console.error(`Error syncing ${resource_type} ${resource_id} from sheet:`, error);
      return { success: false, message: error.message };
    }
  }
}

