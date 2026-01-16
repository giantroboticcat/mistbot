import express from 'express';
import { WebhookHandler } from './WebhookHandler.js';
import { WebhookSubscriptionStorage } from './WebhookSubscriptionStorage.js';

/**
 * Webhook server for receiving Google Drive API push notifications
 */
export class WebhookServer {
  constructor(port = 3000, webhookPath = '/webhook/sheets') {
    this.app = express();
    this.port = port;
    this.webhookPath = webhookPath;
    this.server = null;

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Parse JSON bodies
    this.app.use(express.json());

    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));

    // Raw body parser for Google Drive notifications (they send raw POST)
    this.app.use(this.webhookPath, express.raw({ type: 'application/json' }));
  }

  /**
   * Setup routes
   */
  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'webhook-server' });
    });

    // Webhook endpoint with guild ID in path: /webhook/sheets/:guildId
    this.app.post(`${this.webhookPath}/:guildId`, async (req, res) => {
      try {
        const guildId = req.params.guildId;

        if (!guildId) {
          res.status(400).send('Missing guild ID');
          return;
        }

        // Google Drive API sends notifications with specific headers
        const notification = {
          headers: {
            'x-goog-resource-state': req.get('X-Goog-Resource-State'),
            'x-goog-channel-id': req.get('X-Goog-Channel-Id'),
            'x-goog-resource-id': req.get('X-Goog-Resource-Id'),
            'x-goog-resource-uri': req.get('X-Goog-Resource-Uri'),
            'x-goog-channel-token': req.get('X-Goog-Channel-Token'),
            'x-goog-message-number': req.get('X-Goog-Message-Number'),
          },
          body: req.body ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : null,
        };

        // Handle the notification
        const result = await WebhookHandler.handleNotification(notification, guildId);

        if (result.success) {
          res.status(200).send('OK');
        } else {
          console.error('Webhook handling failed:', result.message);
          // Still respond 200 to prevent Google from retrying
          res.status(200).send('OK');
        }
      } catch (error) {
        console.error('Error processing webhook:', error);
        // Always respond 200 to prevent Google from retrying
        res.status(200).send('OK');
      }
    });

  /**
   * Find guild ID by channel ID (searches subscriptions)
   * Note: This is a simplified fallback. For proper operation, use the guild ID in the URL path.
   * @param {string} channelId - Channel ID from notification
   * @param {string} resourceId - Resource ID from notification
   * @returns {Promise<string|null>} Guild ID or null
   */
  async findGuildIdByChannelId(channelId, resourceId) {
    // Try common guild ID from environment (if set)
    const envGuildId = process.env.GUILD_ID;
    if (envGuildId) {
      try {
        const subscriptions = WebhookSubscriptionStorage.getAllSubscriptions(envGuildId);
        const subscription = subscriptions.find(s => 
          s.channel_id === channelId || 
          s.resource_id_drive === resourceId ||
          s.spreadsheet_id === resourceId
        );
        if (subscription) {
          return envGuildId;
        }
      } catch (error) {
        // Guild database might not exist, continue
      }
    }

    // TODO: For multi-guild support, maintain a registry of active guild IDs
    // Or always require guild ID in the URL path (recommended approach)

    return null;
  }

  /**
   * Start the webhook server
   * @returns {Promise<void>}
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`✅ Webhook server listening on port ${this.port}`);
        console.log(`   Webhook endpoint: http://localhost:${this.port}${this.webhookPath}`);
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('❌ Webhook server error:', error);
        reject(error);
      });
    });
  }

  /**
   * Stop the webhook server
   * @returns {Promise<void>}
   */
  async stop() {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((error) => {
          if (error) {
            reject(error);
          } else {
            console.log('Webhook server stopped');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

