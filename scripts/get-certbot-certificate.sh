#!/bin/bash

DOMAIN="mistbot.duckdns.org"

echo "=== Getting Let's Encrypt Certificate for $DOMAIN ==="
echo ""

# Check if nginx is running
if systemctl is-active --quiet nginx; then
    echo "⚠️  nginx is running - we need to stop it temporarily for certbot"
    echo "   Stopping nginx..."
    sudo systemctl stop nginx
    NGINX_WAS_RUNNING=true
else
    echo "✅ nginx is not running (good for standalone mode)"
    NGINX_WAS_RUNNING=false
fi

# Check if port 80 is free
if sudo netstat -tuln 2>/dev/null | grep -q ":80 " || sudo ss -tuln 2>/dev/null | grep -q ":80 "; then
    echo "❌ Port 80 is still in use!"
    echo "   Find what's using it: sudo lsof -i :80"
    exit 1
else
    echo "✅ Port 80 is free"
fi

echo ""
echo "Running certbot in standalone mode..."
echo ""

# Try standalone mode with HTTP challenge
sudo certbot certonly --standalone \
    --preferred-challenges http \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email admin@mistbot.duckdns.org || {
    
    echo ""
    echo "❌ Certbot failed. Trying interactive mode..."
    echo ""
    sudo certbot certonly --standalone -d "$DOMAIN"
}

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Certificate obtained successfully!"
    echo ""
    echo "Certificate location:"
    sudo ls -la /etc/letsencrypt/live/$DOMAIN/
    echo ""
    
    # Restart nginx if it was running
    if [ "$NGINX_WAS_RUNNING" = true ]; then
        echo "Restarting nginx..."
        sudo systemctl start nginx
    fi
    
    echo ""
    echo "Next steps:"
    echo "1. Give Node.js permission to bind to port 443:"
    echo "   sudo setcap cap_net_bind_service=+ep \$(which node)"
    echo ""
    echo "2. Restart your bot:"
    echo "   pm2 restart mistbot"
    echo ""
    echo "3. Test the webhook server:"
    echo "   curl -k https://localhost:443/health"
else
    echo ""
    echo "❌ Failed to obtain certificate"
    echo ""
    echo "Troubleshooting:"
    echo "1. Make sure port 80 is accessible from the internet"
    echo "2. Check EC2 Security Group allows inbound port 80"
    echo "3. Verify DNS points to this server:"
    echo "   nslookup $DOMAIN"
    
    # Restart nginx if it was running
    if [ "$NGINX_WAS_RUNNING" = true ]; then
        echo ""
        echo "Restarting nginx..."
        sudo systemctl start nginx
    fi
fi

