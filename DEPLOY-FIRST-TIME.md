# First-Time EC2 Deployment Guide

Follow these steps to deploy MistBot to your EC2 instance for the first time.

## Step 1: Transfer Files to EC2

From your local machine (in the mistbot directory), transfer files using one of these methods:

### Option A: Using rsync (Recommended - excludes unnecessary files)

```bash
rsync -avz -e "ssh -i ~/MistBot.pem" \
  --exclude 'node_modules' \
  --exclude 'data' \
  --exclude '.git' \
  --exclude '*.log' \
  --exclude 'logs' \
  . ec2-user@ec2-13-223-200-161.compute-1.amazonaws.com:~/mistbot
```

### Option B: Using SCP (Simple but includes everything)

```bash
scp -i ~/MistBot.pem -r . ec2-user@ec2-13-223-200-161.compute-1.amazonaws.com:~/mistbot
```

### Option C: Using Git (If your repo is on GitHub/GitLab)

```bash
# SSH into EC2 first
mistbot-ssh

# Then on EC2:
cd ~
git clone <your-repo-url> mistbot
cd mistbot
```

## Step 2: SSH into EC2

```bash
mistbot-ssh
```

Or manually:
```bash
ssh -i ~/MistBot.pem ec2-user@ec2-13-223-200-161.compute-1.amazonaws.com
```

## Step 3: Navigate to Project Directory

```bash
cd ~/mistbot
```

## Step 4: Run Deployment Script

```bash
chmod +x deploy-ec2.sh
./deploy-ec2.sh
```

This script will:
- Install Node.js 18.x if needed
- Install npm dependencies
- Install and configure PM2
- Set up auto-startup

## Step 5: Create .env File

```bash
nano .env
```

Add your Discord credentials:

```
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here
GUILD_ID=your_test_server_id_here
```

Save and exit: `Ctrl+X`, then `Y`, then `Enter`

## Step 6: Deploy Discord Commands

```bash
npm run deploy:global
```

## Step 7: Start the Bot

```bash
# Start with PM2
pm2 start ecosystem.config.cjs

# Save PM2 configuration (so it restarts on reboot)
pm2 save

# Check status
pm2 status

# View logs
pm2 logs mistbot
```

## Step 8: Verify Bot is Running

```bash
# Check PM2 status
pm2 status

# View real-time logs
pm2 logs mistbot --lines 50

# Check if bot is online in Discord
# The bot should appear online in your Discord server
```

## Troubleshooting

### Bot not starting?

```bash
# Check logs for errors
pm2 logs mistbot --err

# Check if .env file exists and has correct values
cat .env

# Restart the bot
pm2 restart mistbot
```

### Commands not appearing in Discord?

```bash
# Redeploy commands
npm run deploy:global

# Wait a few minutes (global commands can take up to an hour)
```

### Need to update the bot?

```bash
# Pull latest changes (if using git)
git pull

# Or transfer updated files using rsync/scp from your local machine
# Then restart
pm2 restart mistbot
```

## Useful PM2 Commands

```bash
pm2 status              # Check bot status
pm2 logs mistbot        # View logs
pm2 restart mistbot     # Restart bot
pm2 stop mistbot       # Stop bot
pm2 delete mistbot     # Remove from PM2
pm2 monit              # Monitor resources
```

## Next Steps

- The bot will automatically restart if it crashes
- The bot will start on server reboot (thanks to PM2)
- Monitor logs regularly: `pm2 logs mistbot`
- Set up CloudWatch for AWS monitoring (optional)

