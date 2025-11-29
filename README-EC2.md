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
   - **Instance Type**: t2.micro (free tier) or t2.small (recommended)
   - **Security Group**: Allow SSH (port 22) from your IP
   - **Key Pair**: Create or select an existing key pair

## Step 2: Connect to Your Instance

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip
```

## Step 3: Transfer Files to EC2

### Option A: Using Git (Recommended)

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

### Using PM2 (Recommended)

```bash
# Start the bot
pm2 start ecosystem.config.cjs

# Save PM2 configuration (so it restarts on reboot)
pm2 save

# Check status
pm2 status

# View logs
pm2 logs mistbot

# Restart the bot
pm2 restart mistbot

# Stop the bot
pm2 stop mistbot
```

### Using systemd (Alternative)

```bash
# Copy service file
sudo cp mistbot.service /etc/systemd/system/

# Edit the service file to match your paths
sudo nano /etc/systemd/system/mistbot.service

# Reload systemd
sudo systemctl daemon-reload

# Enable and start the service
sudo systemctl enable mistbot
sudo systemctl start mistbot

# Check status
sudo systemctl status mistbot

# View logs
sudo journalctl -u mistbot -f
```

## Step 7: Deploy Commands (if not done automatically)

```bash
npm run deploy:global
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

## Security Best Practices

1. **Firewall**: Only allow SSH from your IP
2. **Environment Variables**: Never commit `.env` to git
3. **SSH Keys**: Use key-based authentication, disable password login
4. **Updates**: Keep your system updated:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```
5. **Backup**: Regularly backup the `data/` directory

## Troubleshooting

### Bot not starting

```bash
# Check PM2 logs
pm2 logs mistbot --lines 50

# Check if Node.js is installed
node -v

# Check if .env file exists and has correct values
cat .env
```

### Commands not appearing

```bash
# Redeploy commands
npm run deploy:global

# Check if CLIENT_ID is set correctly
echo $CLIENT_ID
```

### Bot crashes

```bash
# Check PM2 logs for errors
pm2 logs mistbot --err

# Check system resources
pm2 monit
```

### Port issues

The bot doesn't require any open ports (it connects to Discord), but ensure:
- SSH (port 22) is open for management
- Outbound HTTPS (port 443) is allowed for Discord API

## Monitoring

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# Process list with details
pm2 list

# Logs with timestamps
pm2 logs mistbot --timestamp
```

### System Monitoring

```bash
# Check system resources
htop

# Check disk space
df -h

# Check memory
free -h
```

## Cost Optimization

- Use **t2.micro** for free tier (limited performance)
- Use **t2.small** for better performance (~$15/month)
- Consider **t3.micro** for burstable performance
- Stop the instance when not in use to save costs

## Next Steps

- Set up CloudWatch for monitoring
- Configure automatic backups
- Set up a CI/CD pipeline for automated deployments
- Use AWS Systems Manager for secure environment variable management

