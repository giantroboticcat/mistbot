#!/bin/bash

# EC2 Deployment Script for MistBot
# This script helps set up the bot on an EC2 instance

set -e

echo "🚀 MistBot EC2 Deployment Script"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo -e "${RED}❌ Cannot detect OS${NC}"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Installing Node.js 18.x..."
    
    if [[ "$OS" == "ubuntu" ]] || [[ "$OS" == "debian" ]]; then
        # Debian/Ubuntu installation
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [[ "$OS" == "amzn" ]] || [[ "$OS" == "amazon" ]]; then
        # Amazon Linux installation using nvm (recommended)
        echo "Installing Node.js 18.x using nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        nvm install 18
        nvm use 18
        nvm alias default 18
        # Add nvm to bashrc for future sessions
        echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
        echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
        echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> ~/.bashrc
    elif [[ "$OS" == "rhel" ]] || [[ "$OS" == "centos" ]] || [[ "$OS" == "fedora" ]]; then
        # RHEL/CentOS/Fedora installation
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs || sudo dnf install -y nodejs
    else
        echo -e "${RED}❌ Unsupported OS: $OS${NC}"
        echo "Please install Node.js 18.x manually"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Node.js installed${NC}"
else
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✅ Node.js is installed: $NODE_VERSION${NC}"
fi

# For Amazon Linux with nvm, ensure nvm is loaded in current session
if [[ "$OS" == "amzn" ]] || [[ "$OS" == "amazon" ]]; then
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" 2>/dev/null || true
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" 2>/dev/null || true
    
    # If node was just installed, make sure it's active
    if command -v node &> /dev/null; then
        nvm use 18 2>/dev/null || true
        nvm alias default 18 2>/dev/null || true
    fi
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    if [[ "$OS" == "amzn" ]] || [[ "$OS" == "amazon" ]]; then
        echo -e "${YELLOW}Trying to load nvm again...${NC}"
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
        nvm use 18 2>/dev/null || true
    fi
    
    # Check again
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm is still not available${NC}"
        echo "Please run: source ~/.bashrc and try again"
        exit 1
    fi
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install --production

# Deploy commands
echo ""
echo "📡 Deploying Discord commands..."
if [ -f .env ]; then
    npm run deploy:global || echo -e "${YELLOW}⚠️  Command deployment failed, but continuing...${NC}"
else
    echo -e "${YELLOW}⚠️  .env file not found. Please create it with DISCORD_TOKEN and CLIENT_ID${NC}"
fi

# Create logs directory
echo ""
echo "📁 Creating logs directory..."
mkdir -p logs

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo ""
    echo "📦 PM2 is not installed. Installing PM2..."
    
    # Ensure nvm is loaded for Amazon Linux
    if [[ "$OS" == "amzn" ]] || [[ "$OS" == "amazon" ]]; then
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" 2>/dev/null || true
        [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" 2>/dev/null || true
        nvm use 18 2>/dev/null || true
    fi
    
    # Install PM2 globally
    npm install -g pm2
    
    # Verify installation
    if command -v pm2 &> /dev/null; then
        echo -e "${GREEN}✅ PM2 installed successfully${NC}"
        pm2 -v
    else
        echo -e "${YELLOW}⚠️  PM2 installed but not in PATH. Trying to reload...${NC}"
        # Try to reload PATH
        export PATH="$PATH:$(npm config get prefix)/bin"
        if command -v pm2 &> /dev/null; then
            echo -e "${GREEN}✅ PM2 is now available${NC}"
        else
            echo -e "${RED}❌ PM2 installation may have failed${NC}"
            echo "Try running manually: npm install -g pm2"
        fi
    fi
else
    echo -e "${GREEN}✅ PM2 is installed${NC}"
    pm2 -v
fi

# Setup PM2 startup script
echo ""
echo "⚙️  Setting up PM2 startup script..."

# For Amazon Linux with nvm, we need to ensure PM2 uses the correct node path
if [[ "$OS" == "amzn" ]] || [[ "$OS" == "amazon" ]]; then
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" 2>/dev/null || true
    # Get the node path for PM2
    NODE_PATH=$(which node)
    echo "Using Node.js from: $NODE_PATH"
fi

pm2 startup systemd -u $USER --hp $HOME || {
    echo -e "${YELLOW}⚠️  PM2 startup command failed. You may need to run it manually:${NC}"
    echo "   pm2 startup systemd -u $USER --hp $HOME"
}

echo ""
echo -e "${GREEN}✅ Deployment setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Make sure your .env file is configured with:"
echo "   - DISCORD_TOKEN"
echo "   - CLIENT_ID"
echo "   - GUILD_ID (optional)"
echo ""
echo "2. Start the bot with PM2:"
echo "   pm2 start ecosystem.config.cjs"
echo ""
echo "3. Save PM2 configuration:"
echo "   pm2 save"
echo ""
echo "4. Monitor the bot:"
echo "   pm2 logs mistbot"
echo "   pm2 status"

