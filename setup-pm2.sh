#!/bin/bash
# Quick script to set up PM2 on Amazon Linux with nvm

echo "Setting up PM2..."

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Use Node.js 18
nvm use 18

# Install PM2 globally
echo "Installing PM2..."
npm install -g pm2

# Add npm global bin to PATH for current session
export PATH="$PATH:$(npm config get prefix)/bin"

# Verify installation
if command -v pm2 &> /dev/null; then
    echo "✅ PM2 installed successfully!"
    pm2 -v
    echo ""
    echo "To use PM2 in this session, run:"
    echo "  export PATH=\"\$PATH:\$(npm config get prefix)/bin\""
    echo ""
    echo "Or reload your shell:"
    echo "  source ~/.bashrc"
else
    echo "❌ PM2 installation failed"
    exit 1
fi

