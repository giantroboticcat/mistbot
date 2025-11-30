# Deploying MistBot to AWS EC2

This guide will help you deploy MistBot to an AWS EC2 instance.

## Prerequisites

1. An AWS account with EC2 access
2. An EC2 instance running Ubuntu (20.04 LTS or later recommended)
3. SSH access to your EC2 instance
4. Your Discord bot token and application ID

## Step 1: Launch EC2 Instance

1. Go to AWS EC2 Console
2. Launch a new instance:
   - **AMI**: Ubuntu Server 20.04 LTS or later
   - **Instance Type**: t3.micro
   - **Security Group**: Allow SSH (port 22) from your IP
   - **Key Pair**: Create or select an existing key pair

## Step 2: Connect to Your Instance

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

## Step 3: Transfer Files to EC2

### Option A: Using Git

```bash
# On EC2 instance
cd ~
git clone <your-repo-url> mistbot
cd mistbot
```

### Option B: Using SCP

```bash
# On your local machine
scp -i your-key.pem -r . ubuntu@your-ec2-ip:~/mistbot
```

### Option C: Using rsync

```bash
# On your local machine
rsync -avz -e "ssh -i your-key.pem" --exclude 'node_modules' --exclude 'data' --exclude '.git' . ubuntu@your-ec2-ip:~/mistbot
```

## Step 4: Run Deployment Script

```bash
# On EC2 instance
cd ~/mistbot
chmod +x deploy-ec2.sh
./deploy-ec2.sh
```

This script will:
- Install Node.js 18.x if needed
- Install npm dependencies
- Deploy Discord commands
- Install and configure PM2
- Set up automatic startup

## Step 5: Configure Environment Variables

Create a `.env` file:

```bash
nano .env
```

Add your credentials:

```
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here
GUILD_ID=your_test_server_id_here
```

Save and exit (Ctrl+X, then Y, then Enter).

## Step 6: Start the Bot

```bash
# Start the bot
pm2 start ecosystem.config.cjs

# Save PM2 configuration (so it restarts on reboot)
pm2 save

```

## Managing the Bot

### PM2 Commands

```bash
# View all processes
pm2 list

# View logs
pm2 logs mistbot

# Restart
pm2 restart mistbot

# Stop
pm2 stop mistbot

# Delete from PM2
pm2 delete mistbot

# Monitor resources
pm2 monit
```

### Updating the Bot

```bash
# Pull latest changes (if using git)
cd ~/mistbot
git pull

# Install new dependencies
npm install --production

# Deploy updated commands (if command definitions changed)
npm run deploy:global

# Restart the bot
pm2 restart mistbot
```
