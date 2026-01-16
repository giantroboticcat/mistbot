# Google Sheets Webhook Setup Guide

This guide explains how to set up Google Sheets webhooks so that changes in your Google Sheets automatically sync to the bot.

## Overview

The bot can receive notifications from Google Drive API when a spreadsheet changes. When a change is detected, the bot automatically reads the sheet and updates the character or fellowship data in its database.

## Quick Answer: Do You Need a Domain?

**Yes, you do need a domain** for SSL certificates. Let's Encrypt **cannot issue certificates for AWS EC2 DNS names** (e.g., `ec2-xxx.compute-1.amazonaws.com`) because they're considered dynamic/internal domains.

**Solutions:**
1. **Use a free domain** (e.g., DuckDNS, Freenom, or a cheap domain from Namecheap/GoDaddy)
2. **Use AWS Certificate Manager (ACM)** with an Application Load Balancer (more complex)
3. **Use a tunneling service** like ngrok (for testing/development)

See "Option A" in the Production Deployment section below for domain setup instructions.

## Prerequisites

1. Google Sheets integration already set up (see `GOOGLE_SHEETS_SETUP.md`)
2. Public HTTPS endpoint where the bot is hosted
3. Environment variables configured for webhook support

## Architecture

- **Google Drive API Push Notifications**: Google sends HTTP POST requests to your webhook URL when files change
- **Webhook Server**: Express server listens for these notifications
- **Subscription Management**: Each character/fellowship sheet can have a webhook subscription
- **Auto-renewal**: Subscriptions expire after ~7 days and need to be renewed

## Setup Steps

### 1. Environment Variables

Add these to your `.env` file:

```env
# Webhook configuration
WEBHOOK_PORT=3000
WEBHOOK_URL=https://your-domain.com/webhook/sheets
```

**Important**: 
- `WEBHOOK_URL` must be publicly accessible HTTPS URL
- **You can use your EC2 public DNS name** (e.g., `ec2-xxx.compute-1.amazonaws.com`) with Let's Encrypt - no custom domain needed!
- For local development, use a tunneling service like ngrok

### 2. Run Database Migration

Run the migration to create the webhook subscriptions table:

```bash
npm run migration:run
```

### 3. Install Dependencies

The webhook server uses Express. Install it if not already installed:

```bash
npm install express
```

### 4. Enable Webhooks for a Character/Fellowship

When you set a Google Sheet URL for a character or fellowship, the bot can optionally set up webhook subscriptions. However, this needs to be done programmatically or via a command.

**For Characters:**
```javascript
import { WebhookSubscriptionStorage } from './utils/WebhookSubscriptionStorage.js';

const guildId = 'your-guild-id';
const characterId = 1;
const sheetUrl = 'https://docs.google.com/spreadsheets/d/SPREADSHEET_ID';
const webhookUrl = process.env.WEBHOOK_URL + `/${guildId}`;

// Parse spreadsheet ID from URL
const spreadsheetId = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];

// Create subscription
await WebhookSubscriptionStorage.createOrUpdateSubscription(
  guildId,
  'character',
  characterId,
  spreadsheetId,
  webhookUrl
);
```

**For Fellowships:**
```javascript
await WebhookSubscriptionStorage.createOrUpdateSubscription(
  guildId,
  'fellowship',
  fellowshipId,
  spreadsheetId,
  webhookUrl
);
```

### 5. Webhook URL Format

The webhook URL format is:
```
https://your-domain.com/webhook/sheets/{guildId}
```

Where `{guildId}` is the Discord guild ID. This allows the server to identify which guild's data to update.

### 6. Testing Locally with ngrok

For local development, use ngrok to expose your local server:

```bash
# Install ngrok (if not installed)
# https://ngrok.com/

# Start your bot
npm start

# In another terminal, start ngrok
ngrok http 3000
```

Copy the HTTPS URL from ngrok (e.g., `https://abc123.ngrok.io`) and use it in your `.env`:

```env
WEBHOOK_URL=https://abc123.ngrok.io/webhook/sheets
```

**Note**: The ngrok URL changes each time you restart ngrok (unless you have a paid plan). Update your `.env` and renew subscriptions accordingly.

### 7. Production Deployment on EC2

You have two options for EC2:

#### Option A: Use a Domain (Required for SSL)

**Important**: Let's Encrypt **cannot issue certificates for AWS EC2 DNS names** (e.g., `ec2-xxx.compute-1.amazonaws.com`). You need a real domain name.

**Getting a Free/Cheap Domain:**

1. **Free Dynamic DNS Options:**
   - **DuckDNS** (https://www.duckdns.org/) - Free, easy setup
   - **No-IP** (https://www.noip.com/) - Free tier available
   - **Freedns.afraid.org** - Free DNS hosting

2. **Cheap Domain Options:**
   - **Freenom** - Free `.tk`, `.ml`, `.ga`, `.cf` domains
   - **Namecheap** - ~$1-2/year for some TLDs
   - **GoDaddy** - Various pricing options

**Steps:**

1. **Get a domain and point it to your EC2 instance:**
   - Get a domain from one of the services above (e.g., `mistbot.duckdns.org` or `mistbot.yourdomain.com`)
   - Point the domain to your EC2 public IP:
     - For DuckDNS: Go to duckdns.org, add a domain, update with your EC2 IP
     - For regular domains: Create an A record pointing to your EC2 public IP
   - Wait a few minutes for DNS propagation
   
   **Get your EC2 public IP:**
   - Go to AWS EC2 Console → Instances → Select your instance
   - Copy the "Public IPv4 address" (e.g., `13.223.200.161`)

2. **Install nginx and certbot:**

   **For Ubuntu/Debian:**
   ```bash
   sudo apt update
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```

   **For Amazon Linux 2 (AWS Linux):**
   ```bash
   # Install EPEL repository (needed for certbot)
   sudo yum install -y epel-release
   
   # Install nginx
   sudo amazon-linux-extras install -y nginx1
   
   # Install certbot and python3
   sudo yum install -y certbot python3-certbot-nginx
   
   # Start and enable nginx
   sudo systemctl start nginx
   sudo systemctl enable nginx
   ```

   **For Amazon Linux 2023:**
   ```bash
   # Update system packages
   sudo dnf update -y
   
   # Install nginx
   sudo dnf install -y nginx
   
   # Install Python 3 and pip (usually pre-installed, but ensure they're latest)
   sudo dnf install -y python3 python3-pip
   
   # Install certbot - try dnf first, fallback to pip if needed
   # Method 1: Try dnf (may work if certbot is in repos)
   sudo dnf install -y certbot python3-certbot-nginx 2>/dev/null || \
   
   # Method 2: If dnf fails, use pip3 (more reliable)
   sudo pip3 install --upgrade pip && \
   sudo pip3 install certbot certbot-nginx
   
   # Verify certbot installation
   which certbot || /usr/local/bin/certbot --version
   
   # Start and enable nginx
   sudo systemctl start nginx
   sudo systemctl enable nginx
   
   # Check if firewalld is running and configure if needed
   if systemctl is-active --quiet firewalld; then
       sudo firewall-cmd --permanent --add-service=http
       sudo firewall-cmd --permanent --add-service=https
       sudo firewall-cmd --reload
   fi
   ```
   
   **If certbot installation fails, try these alternatives:**
   
   ```bash
   # Option A: Install via pip with user install then symlink
   pip3 install --user certbot certbot-nginx
   sudo ln -s ~/.local/bin/certbot /usr/local/bin/certbot
   
   # Option B: Use snap (if snapd is installed)
   # sudo dnf install -y snapd
   # sudo systemctl enable --now snapd.socket
   # sudo snap install core; sudo snap refresh core
   # sudo snap install --classic certbot
   # sudo ln -s /snap/bin/certbot /usr/bin/certbot
   ```

3. **Configure nginx:**

   **For Ubuntu/Debian:**
   ```bash
   sudo nano /etc/nginx/sites-available/mistbot-webhook
   ```
   
   Add this configuration (replace with your actual domain):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location /webhook/sheets/ {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
   
   Enable the site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/mistbot-webhook /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

   **For Amazon Linux (2 or 2023):**
   ```bash
   sudo nano /etc/nginx/nginx.conf
   ```
   
   Add this inside the `http { }` block (replace with your actual domain):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location /webhook/sheets/ {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
   
   Test and restart:
   ```bash
   sudo nginx -t
   sudo systemctl restart nginx
   ```

4. **Update firewall (Security Group):**
   - Go to EC2 Console → Security Groups → Select your instance's security group
   - Add inbound rule: HTTPS (port 443) from anywhere (0.0.0.0/0)
   - Add inbound rule: HTTP (port 80) from anywhere (for Let's Encrypt validation)

5. **Get SSL certificate with Let's Encrypt:**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```
   Replace `your-domain.com` with your actual domain (e.g., `mistbot.duckdns.org`).
   
   Follow the prompts. Certbot will automatically update your nginx config to use HTTPS.
   
   **Important**: Make sure your domain is pointing to your EC2 IP before running certbot!

6. **Set environment variable:**
   ```env
   WEBHOOK_URL=https://your-domain.com/webhook/sheets
   ```
   Replace `your-domain.com` with your actual domain.

**Note**: 
- If you're using DuckDNS or similar dynamic DNS, you'll need to update the IP when your EC2 instance restarts (unless you set up automatic updates)
- If you stop/restart your EC2 instance and get a new IP, update your DNS records accordingly
- Regular domain A records need manual updates if the IP changes

#### Option B: Quick Setup with DuckDNS (Free, Recommended for Testing)

**DuckDNS is the easiest free option for dynamic DNS:**

1. **Sign up and create a domain:**
   - Go to https://www.duckdns.org/
   - Sign in with GitHub/Google
   - Add a domain (e.g., `mistbot`)
   - Get your token

2. **Update DuckDNS with your EC2 IP:**
   ```bash
   # Get your EC2 public IP
   EC2_IP=$(curl -s http://checkip.amazonaws.com)
   
   # Update DuckDNS (replace YOUR_TOKEN and YOUR_DOMAIN)
   curl "https://www.duckdns.org/update?domains=YOUR_DOMAIN&token=YOUR_TOKEN&ip=$EC2_IP"
   ```
   
   Or manually: Visit `https://www.duckdns.org/update?domains=YOUR_DOMAIN&token=YOUR_TOKEN&ip=YOUR_IP`

3. **Set up automatic IP updates (optional):**
   Create a cron job to update DuckDNS when your IP changes:
   ```bash
   # Edit crontab
   crontab -e
   
   # Add this line (updates every 5 minutes)
   */5 * * * * curl -s "https://www.duckdns.org/update?domains=YOUR_DOMAIN&token=YOUR_TOKEN&ip=$(curl -s http://checkip.amazonaws.com)" > /dev/null 2>&1
   ```

4. **Follow steps 2-6 from Option A**, using your DuckDNS domain (e.g., `mistbot.duckdns.org`)

#### Option C: Use AWS Certificate Manager with Load Balancer (Advanced)

For production with automatic IP management:
- Use AWS Application Load Balancer (ALB) with ACM certificates
- ALB provides stable endpoint even if EC2 instance changes
- More complex setup but better for production
- See AWS documentation for ALB setup

#### Option C: Use AWS Application Load Balancer (Advanced)

For production with high availability, consider using AWS ALB:
- ALB provides stable HTTPS endpoint
- Handles SSL termination
- More complex setup but better for production

## How It Works

1. **Subscription Creation**: When you enable webhooks, the bot calls Google Drive API to create a "watch channel"
2. **Initial Sync**: Google sends a sync notification to confirm the subscription
3. **Change Detection**: When the sheet changes, Google sends a POST request to your webhook URL
4. **Data Sync**: The bot receives the notification, identifies the character/fellowship, and syncs data from the sheet

## Subscription Expiration

Google Drive API subscriptions expire after 7 days. To keep webhooks active:

1. **Manual Renewal**: Periodically renew subscriptions before they expire
2. **Automatic Renewal**: Implement a cron job or scheduled task to renew subscriptions

**Check expiring subscriptions:**
```javascript
import { WebhookSubscriptionStorage } from './utils/WebhookSubscriptionStorage.js';

const expiring = WebhookSubscriptionStorage.getExpiringSubscriptions(guildId);
// Renew subscriptions that expire within 24 hours
for (const sub of expiring) {
  await WebhookSubscriptionStorage.renewSubscription(
    sub.guild_id,
    sub.resource_type,
    sub.resource_id,
    webhookUrl
  );
}
```

## Checking Webhook Status in Production

### 1. Check Subscription Status

Use the provided script to see all webhook subscriptions:

```bash
# On your EC2 instance
cd ~/mistbot
node scripts/check-webhooks.js YOUR_GUILD_ID
```

This will show:
- All active subscriptions
- Expiration dates
- Which subscriptions are expiring soon
- Summary of active vs expired subscriptions

### 2. Test Webhook Endpoint

Test if your webhook endpoint is accessible:

```bash
# Test the endpoint
./scripts/test-webhook-endpoint.sh YOUR_GUILD_ID https://your-domain.com/webhook/sheets
```

Or manually test with curl:

```bash
# Test health endpoint
curl https://your-domain.com/health

# Test webhook endpoint (should return 200 OK)
curl -X POST https://your-domain.com/webhook/sheets/YOUR_GUILD_ID \
  -H "X-Goog-Resource-State: sync" \
  -H "X-Goog-Channel-Id: test-channel" \
  -H "X-Goog-Resource-Id: test-resource"
```

### 3. Monitor Bot Logs

Watch for webhook activity in real-time:

```bash
# View PM2 logs
pm2 logs mistbot

# Or filter for webhook-related messages
pm2 logs mistbot | grep -i webhook
```

Look for:
- `Webhook server listening on port X` - Server started
- `Error handling webhook notification` - Processing errors
- `No subscription found for channel` - Subscription issues
- `Successfully synced from Google Sheet` - Successful syncs

### 4. Check Database Directly

Query the database to see subscriptions:

```bash
# On EC2, navigate to your bot directory
cd ~/mistbot

# Use sqlite3 to query (replace with your guild ID)
sqlite3 data/mistbot-YOUR_GUILD_ID.db "SELECT * FROM webhook_subscriptions;"
```

### 5. Verify Webhook Server is Running

Check if the webhook server started:

```bash
# Check if port is listening
sudo netstat -tlnp | grep :3000
# or
sudo ss -tlnp | grep :3000

# Check PM2 status
pm2 status

# Check environment variables
cat .env | grep WEBHOOK
```

### 6. Test with Real Sheet Change

The best way to verify webhooks work:

1. **Make a change in your Google Sheet** (e.g., update a character name)
2. **Watch the bot logs** for webhook notifications:
   ```bash
   pm2 logs mistbot --lines 50
   ```
3. **Check if the bot synced** - The character data should update automatically

### 7. Check Subscription Expiration

Subscriptions expire after ~7 days. Check which ones need renewal:

```bash
node scripts/check-webhooks.js YOUR_GUILD_ID
```

Look for warnings about subscriptions expiring within 24 hours.

## Troubleshooting

### DNS Timeout Error with Let's Encrypt

If you see "DNS problem: query timed out looking up CAA for duckdns.org":

1. **Verify DNS is working:**
   ```bash
   # Test DNS resolution from your EC2 instance
   dig mistbot.duckdns.org
   nslookup mistbot.duckdns.org
   
   # Test from external DNS servers
   dig @8.8.8.8 mistbot.duckdns.org
   dig @1.1.1.1 mistbot.duckdns.org
   ```

2. **Verify your domain points to your EC2 IP:**
   ```bash
   # Get your EC2 public IP
   curl http://checkip.amazonaws.com
   
   # Verify the domain resolves to this IP
   dig +short mistbot.duckdns.org
   ```
   The output should match your EC2 public IP.

3. **Update DuckDNS if needed:**
   ```bash
   # Update DuckDNS with current IP
   curl "https://www.duckdns.org/update?domains=mistbot&token=YOUR_TOKEN&ip=$(curl -s http://checkip.amazonaws.com)"
   ```
   Wait a few minutes for DNS propagation.

4. **Try certbot with DNS challenge instead of nginx plugin:**
   ```bash
   # Use standalone mode (make sure nginx isn't using port 80)
   sudo systemctl stop nginx
   sudo certbot certonly --standalone -d mistbot.duckdns.org
   sudo systemctl start nginx
   ```
   Then manually configure nginx to use the certificate.

5. **Check Security Group allows HTTPS validation:**
   - Port 80 must be open for Let's Encrypt HTTP-01 validation
   - Port 443 for HTTPS (after certificate is issued)

6. **Wait for DNS propagation:**
   - If you just created/updated the DuckDNS record, wait 5-15 minutes
   - DNS changes can take time to propagate globally

7. **Use a different DNS service:**
   - If DuckDNS continues to have issues, try No-IP or a regular domain registrar
   - Some free DNS services have rate limiting or reliability issues

### Certificate obtained but nginx not using it

After getting the certificate with standalone mode, manually configure nginx:

```bash
sudo nano /etc/nginx/nginx.conf
```

Update the server block:
```nginx
server {
    listen 80;
    server_name mistbot.duckdns.org;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name mistbot.duckdns.org;

    ssl_certificate /etc/letsencrypt/live/mistbot.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mistbot.duckdns.org/privkey.pem;

    location /webhook/sheets/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then test and restart:
```bash
sudo nginx -t
sudo systemctl restart nginx
```

### Webhooks not received

1. **Check webhook URL is accessible**: Test with `curl`:
   ```bash
   curl -X POST https://your-domain.com/webhook/sheets/YOUR_GUILD_ID \
     -H "X-Goog-Resource-State: sync" \
     -H "X-Goog-Channel-Id: test-channel"
   ```

2. **Check bot logs**: Look for webhook-related errors

3. **Verify subscription exists**: Check database:
   ```sql
   SELECT * FROM webhook_subscriptions WHERE guild_id = 'YOUR_GUILD_ID';
   ```

4. **Check Google Drive API permissions**: Ensure service account has access to the spreadsheet

### Subscription expired

- Subscriptions expire after 7 days
- Renew subscriptions periodically (see "Subscription Expiration" above)
- When expired, you'll need to recreate the subscription

### 502 Bad Gateway Error

This means nginx can't connect to the webhook server on port 3000.

**Quick diagnostic:**
```bash
# Run the troubleshooting script
./scripts/troubleshoot-502.sh
```

**Manual checks:**

1. **Check if webhook server is running:**
   ```bash
   # Check if port 3000 is listening
   sudo netstat -tlnp | grep :3000
   # or
   sudo ss -tlnp | grep :3000
   ```

2. **Check environment variables:**
   ```bash
   # Make sure these are set in .env
   grep WEBHOOK .env
   ```
   Should show:
   ```
   WEBHOOK_PORT=3000
   WEBHOOK_URL=https://your-domain.com/webhook/sheets
   ```

3. **Check bot logs for webhook server startup:**
   ```bash
   pm2 logs mistbot | grep -i "webhook"
   ```
   Look for: `✅ Webhook server listening on port 3000`

4. **Test direct connection (bypass nginx):**
   ```bash
   curl http://localhost:3000/health
   ```
   Should return: `{"status":"ok","service":"webhook-server"}`

5. **If webhook server isn't running:**
   - Check if environment variables are set correctly
   - Restart the bot: `pm2 restart mistbot`
   - Check logs: `pm2 logs mistbot --err`

6. **Check nginx error logs:**
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```
   Look for connection refused errors

7. **Verify nginx proxy configuration:**
   ```bash
   sudo grep -A 5 "location /webhook" /etc/nginx/nginx.conf
   ```
   Should show `proxy_pass http://localhost:3000;`

**Common fixes:**
- If port 3000 isn't listening: Restart bot with `pm2 restart mistbot`
- If env vars missing: Add `WEBHOOK_PORT` and `WEBHOOK_URL` to `.env` and restart
- If nginx config wrong: Fix proxy_pass to point to `http://localhost:3000`

### Webhook server not starting

- Check `WEBHOOK_PORT` and `WEBHOOK_URL` are set in `.env`
- Verify port is not in use: `lsof -i :3000` (or your port)
- Check firewall allows incoming connections
- Check bot logs: `pm2 logs mistbot` for webhook server errors

## Security Considerations

1. **HTTPS Required**: Google requires HTTPS for webhook URLs
2. **Validate Requests**: The webhook handler validates Google's headers but doesn't verify signatures
3. **Guild ID in URL**: The guild ID is in the URL path - ensure proper access control
4. **Rate Limiting**: Consider rate limiting to prevent abuse

## API Reference

### WebhookSubscriptionStorage Methods

- `createOrUpdateSubscription(guildId, resourceType, resourceId, spreadsheetId, webhookUrl)` - Create/update subscription
- `getSubscription(guildId, resourceType, resourceId)` - Get subscription for a resource
- `deleteSubscription(guildId, resourceType, resourceId)` - Delete subscription
- `getExpiringSubscriptions(guildId)` - Get subscriptions expiring soon
- `renewSubscription(guildId, resourceType, resourceId, webhookUrl)` - Renew a subscription

### WebhookHandler Methods

- `handleNotification(notification, guildId)` - Handle incoming webhook notification

## Next Steps

Consider adding:
- Discord slash commands to enable/disable webhooks
- Automatic subscription renewal on bot startup
- Dashboard to view subscription status
- Notifications when subscriptions expire

