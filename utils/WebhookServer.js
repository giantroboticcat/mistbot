import express from 'express';
import https from 'https';
import { WebhookHandler } from './WebhookHandler.js';
import { WebhookSubscriptionStorage } from './WebhookSubscriptionStorage.js';

/**
 * Webhook server for receiving Google Apps Script webhook notifications
 * Runs directly on port 443 with HTTPS/SSL
 */
export class WebhookServer {
  constructor(port = 443, webhookPath = '/webhook/sheets', sslOptions = null) {
    this.app = express();
    this.port = port;
    this.webhookPath = webhookPath;
    this.sslOptions = sslOptions;
    this.server = null;

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    console.log(`Setting up middleware for webhook server`);
    
    // Parse URL-encoded bodies (fallback for malformed requests)
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    
    // Parse JSON bodies (Apps Script should send JSON)
    // Increase limit to handle larger payloads if needed
    this.app.use(express.json({ limit: '1mb' }));
    
    // Log request details AFTER parsing (so body is available)
    this.app.use((req, res, next) => {
      if (req.path.includes('/webhook/sheets')) {
        console.log(`Request method: ${req.method}`);
        console.log(`Content-Type: ${req.get('Content-Type')}`);
        console.log(`Content-Length: ${req.get('Content-Length')}`);
        console.log(`Request body:`, req.body);
      }
      next();
    });
    
    console.log(`Middleware setup complete`);
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
      console.log(`Received webhook request for guild ${req.params.guildId}`);
      console.log(`Content-Type: ${req.get('Content-Type')}`);
      console.log(`Content-Length: ${req.get('Content-Length')}`);
      console.log(`Request body type: ${typeof req.body}`);
      console.log(`Request body:`, req.body);
      console.log(`Raw body:`, req.rawBody || 'not captured');
      
      try {
        const guildId = req.params.guildId;

        if (!guildId) {
          res.status(400).send('Missing guild ID');
          return;
        }

        // Try to parse body - check if it's already parsed or needs parsing
        let webhookData = req.body;
        
        // If body is empty/undefined but we have raw body, try to parse it
        if ((!webhookData || Object.keys(webhookData).length === 0) && req.rawBody) {
          try {
            webhookData = JSON.parse(req.rawBody);
            console.log(`Parsed body from raw:`, webhookData);
          } catch (parseError) {
            console.error('Failed to parse raw body:', parseError);
            console.error('Raw body content:', req.rawBody);
          }
        }

        if (!webhookData || typeof webhookData !== 'object' || Array.isArray(webhookData)) {
          console.warn('Invalid webhook payload - expected JSON object');
          console.warn(`Received body type: ${typeof req.body}, value:`, req.body);
          console.warn(`Raw body:`, req.rawBody || 'not available');
          res.status(400).send('Invalid payload');
          return;
        }

        // Handle the notification (pass body directly since Apps Script sends JSON)
        const result = await WebhookHandler.handleNotification({ body: webhookData }, guildId);

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
  }

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
   * Start the webhook server with HTTPS
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.sslOptions) {
      throw new Error('SSL options required for HTTPS server. Set SSL_CERT_PATH and SSL_KEY_PATH environment variables.');
    }

    return new Promise((resolve, reject) => {
      // Start HTTPS server
      this.server = https.createServer(this.sslOptions, this.app);
      this.server.listen(this.port, () => {
        console.log(`✅ Webhook server listening on port ${this.port} (HTTPS)`);
        console.log(`   Webhook endpoint: https://localhost:${this.port}${this.webhookPath}`);
        resolve();
      });

      this.server.on('error', (error) => {
        if (error.code === 'EACCES') {
          console.error(`❌ Permission denied: Port ${this.port} requires root privileges`);
          console.error('   Run: sudo setcap cap_net_bind_service=+ep $(which node)');
          console.error('   Then restart the bot: pm2 restart mistbot');
        } else if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${this.port} is already in use`);
          console.error(`   Kill the process using: sudo lsof -ti:${this.port} | xargs sudo kill`);
        } else {
          console.error('❌ Webhook server error:', error);
        }
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

