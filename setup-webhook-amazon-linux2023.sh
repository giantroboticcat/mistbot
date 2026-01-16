#!/bin/bash
# Setup script for Google Sheets webhook on Amazon Linux 2023
# This script installs nginx and certbot for webhook support

set -e

echo "Setting up nginx and certbot for Amazon Linux 2023..."

# Update system
sudo dnf update -y

# Install nginx
echo "Installing nginx..."
sudo dnf install -y nginx

# Install Python 3 and pip (usually pre-installed)
sudo dnf install -y python3 python3-pip

# Install certbot using pip (most reliable method for AL2023)
echo "Installing certbot..."
sudo pip3 install --upgrade pip
sudo pip3 install certbot certbot-nginx

# Make certbot executable from PATH
if [ ! -f /usr/bin/certbot ]; then
    # Check if it's in the pip install location
    if [ -f ~/.local/bin/certbot ]; then
        sudo ln -s ~/.local/bin/certbot /usr/bin/certbot
    elif [ -f /usr/local/bin/certbot ]; then
        sudo ln -s /usr/local/bin/certbot /usr/bin/certbot
    fi
fi

# Start and enable nginx
echo "Starting nginx..."
sudo systemctl start nginx
sudo systemctl enable nginx

# Configure firewalld if it's running
if systemctl is-active --quiet firewalld; then
    echo "Configuring firewall..."
    sudo firewall-cmd --permanent --add-service=http
    sudo firewall-cmd --permanent --add-service=https
    sudo firewall-cmd --reload
else
    echo "Note: firewalld is not running. Make sure your Security Group allows ports 80 and 443."
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit /etc/nginx/nginx.conf and add your server block"
echo "2. Run: sudo nginx -t"
echo "3. Run: sudo systemctl restart nginx"
echo "4. Run: sudo certbot --nginx -d your-domain.com"
echo ""
echo "To find certbot location, run: which certbot"

