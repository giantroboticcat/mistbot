import { WebhookSubscriptionStorage } from './WebhookSubscriptionStorage.js';
import * as CharacterStorage from './CharacterStorage.js';
import * as FellowshipStorage from './FellowshipStorage.js';
import sheetsService from './GoogleSheetsService.js';

/**
 * Handler for Google Drive API push notifications (webhooks)
 */
export class WebhookHandler {
  /**
   * Handle incoming webhook notification from Google Drive API
   * @param {Object} notification - The notification payload
   * @param {string} guildId - Guild ID (extracted from notification or required)
   * @returns {Promise<Object>} Result with status and message
   */
  static async handleNotification(notification, guildId) {
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
        console.warn(`No subscription found for channel ${channelId}`);
        return { success: false, message: 'Subscription not found' };
      }

      // If it's just a sync notification (initial subscription confirmation), ignore it
      if (resourceState === 'sync') {
        return { success: true, message: 'Initial sync notification received' };
      }

      // Handle actual change notification
      if (resourceState === 'update' || resourceState === 'change') {
        return await this.handleChangeNotification(subscription);
      }

      return { success: true, message: `Unknown resource state: ${resourceState}` };
    } catch (error) {
      console.error('Error handling webhook notification:', error);
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
   * Handle a change notification - sync data from sheet
   * @param {Object} subscription - The subscription record
   * @returns {Promise<Object>} Result with status and message
   */
  static async handleChangeNotification(subscription) {
    const { guild_id, resource_type, resource_id, spreadsheet_id } = subscription;

    try {
      // Build sheet URL from spreadsheet ID
      // We need to reconstruct the sheet URL - we'll need the gid if it was in the original URL
      // For now, we'll use the spreadsheet ID only and let the service handle it
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheet_id}`;

      if (resource_type === 'character') {
        // Find character by ID
        const characters = CharacterStorage.getCharacters(guild_id);
        const character = characters.find(c => c.id === resource_id);

        if (!character) {
          return { success: false, message: 'Character not found' };
        }

        // Sync from sheet
        const result = await CharacterStorage.syncFromSheet(guild_id, character.user_id, resource_id);
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

