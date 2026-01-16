import { getDbForGuild } from './Database.js';
import sheetsService from './GoogleSheetsService.js';

/**
 * Storage utility for managing Google Drive API webhook subscriptions
 */
export class WebhookSubscriptionStorage {
  /**
   * Create or update a webhook subscription for a character or fellowship
   * @param {string} guildId - Guild ID
   * @param {string} resourceType - 'character' or 'fellowship'
   * @param {number} resourceId - Character ID or Fellowship ID
   * @param {string} spreadsheetId - Google Sheets spreadsheet ID
   * @param {string} webhookUrl - Public URL to receive webhooks
   * @returns {Promise<Object>} Subscription details
   */
  static async createOrUpdateSubscription(guildId, resourceType, resourceId, spreadsheetId, webhookUrl) {
    const db = getDbForGuild(guildId);
    
    // Check if subscription already exists
    const existing = db.prepare(`
      SELECT id, channel_id, resource_id_drive
      FROM webhook_subscriptions
      WHERE guild_id = ? AND resource_type = ? AND resource_id = ? AND spreadsheet_id = ?
    `).get(guildId, resourceType, resourceId, spreadsheetId);

    if (existing) {
      // Unsubscribe from old channel before creating new one
      try {
        await sheetsService.unsubscribeFromFileChanges(existing.channel_id, existing.resource_id_drive);
      } catch (error) {
        console.warn('Failed to unsubscribe from old channel:', error.message);
      }
    }

    // Create new subscription via Drive API
    const subscription = await sheetsService.subscribeToFileChanges(spreadsheetId, webhookUrl);

    // Upsert in database using INSERT OR REPLACE
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO webhook_subscriptions 
        (guild_id, resource_type, resource_id, spreadsheet_id, channel_id, resource_id_drive, expiration, webhook_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      guildId,
      resourceType,
      resourceId,
      spreadsheetId,
      subscription.channelId,
      subscription.resourceId,
      subscription.expiration,
      webhookUrl
    );

    return subscription;
  }

  /**
   * Get subscription for a resource
   * @param {string} guildId - Guild ID
   * @param {string} resourceType - 'character' or 'fellowship'
   * @param {number} resourceId - Character ID or Fellowship ID
   * @returns {Object|null} Subscription or null
   */
  static getSubscription(guildId, resourceType, resourceId) {
    const db = getDbForGuild(guildId);
    
    return db.prepare(`
      SELECT * FROM webhook_subscriptions
      WHERE guild_id = ? AND resource_type = ? AND resource_id = ?
    `).get(guildId, resourceType, resourceId);
  }

  /**
   * Get subscription by spreadsheet ID
   * @param {string} guildId - Guild ID
   * @param {string} spreadsheetId - Spreadsheet ID
   * @returns {Object|null} Subscription or null
   */
  static getSubscriptionBySpreadsheetId(guildId, spreadsheetId) {
    const db = getDbForGuild(guildId);
    
    return db.prepare(`
      SELECT * FROM webhook_subscriptions
      WHERE guild_id = ? AND spreadsheet_id = ?
    `).get(guildId, spreadsheetId);
  }

  /**
   * Delete a subscription
   * @param {string} guildId - Guild ID
   * @param {string} resourceType - 'character' or 'fellowship'
   * @param {number} resourceId - Character ID or Fellowship ID
   */
  static async deleteSubscription(guildId, resourceType, resourceId) {
    const db = getDbForGuild(guildId);
    
    const subscription = this.getSubscription(guildId, resourceType, resourceId);
    
    if (subscription) {
      // Unsubscribe from Drive API
      try {
        await sheetsService.unsubscribeFromFileChanges(subscription.channel_id, subscription.resource_id_drive);
      } catch (error) {
        console.warn('Failed to unsubscribe from Drive API:', error.message);
      }

      // Delete from database
      db.prepare(`
        DELETE FROM webhook_subscriptions
        WHERE guild_id = ? AND resource_type = ? AND resource_id = ?
      `).run(guildId, resourceType, resourceId);
    }
  }

  /**
   * Get all subscriptions expiring soon (within 24 hours)
   * @param {string} guildId - Guild ID
   * @returns {Array} Array of subscriptions
   */
  static getExpiringSubscriptions(guildId) {
    const db = getDbForGuild(guildId);
    const now = Math.floor(Date.now() / 1000);
    const tomorrow = now + (24 * 60 * 60);

    return db.prepare(`
      SELECT * FROM webhook_subscriptions
      WHERE guild_id = ? AND expiration < ?
      ORDER BY expiration ASC
    `).all(guildId, tomorrow);
  }

  /**
   * Get all subscriptions for a guild
   * @param {string} guildId - Guild ID
   * @returns {Array} Array of subscriptions
   */
  static getAllSubscriptions(guildId) {
    const db = getDbForGuild(guildId);
    
    return db.prepare(`
      SELECT * FROM webhook_subscriptions
      WHERE guild_id = ?
    `).all(guildId);
  }

  /**
   * Renew a subscription (re-subscribe with Drive API)
   * @param {string} guildId - Guild ID
   * @param {string} resourceType - 'character' or 'fellowship'
   * @param {number} resourceId - Character ID or Fellowship ID
   * @param {string} webhookUrl - Public URL to receive webhooks
   * @returns {Promise<Object>} New subscription details
   */
  static async renewSubscription(guildId, resourceType, resourceId, webhookUrl) {
    const subscription = this.getSubscription(guildId, resourceType, resourceId);
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    return this.createOrUpdateSubscription(
      guildId,
      resourceType,
      resourceId,
      subscription.spreadsheet_id,
      webhookUrl
    );
  }
}

