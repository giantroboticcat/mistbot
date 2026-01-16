#!/bin/bash
# Troubleshooting script for 502 Bad Gateway errors

echo "🔍 Troubleshooting 502 Bad Gateway Error"
echo "========================================"
echo ""

# Check 1: Is the webhook server running?
echo "1. Checking if webhook server is running on port 3000..."
if sudo netstat -tlnp 2>/dev/null | grep :3000 > /dev/null || sudo ss -tlnp 2>/dev/null | grep :3000 > /dev/null; then
    echo "   ✅ Port 3000 is listening"
    sudo netstat -tlnp 2>/dev/null | grep :3000 || sudo ss -tlnp 2>/dev/null | grep :3000
else
    echo "   ❌ Port 3000 is NOT listening - webhook server is not running"
fi
echo ""

# Check 2: Check PM2 status
echo "2. Checking PM2 process status..."
if command -v pm2 &> /dev/null; then
    pm2 status
    echo ""
    echo "   Recent logs:"
    pm2 logs mistbot --lines 10 --nostream 2>/dev/null | tail -5 || echo "   (No logs available)"
else
    echo "   ⚠️  PM2 not found"
fi
echo ""

# Check 3: Environment variables
echo "3. Checking environment variables..."
if [ -f .env ]; then
    if grep -q "WEBHOOK_PORT" .env; then
        echo "   ✅ WEBHOOK_PORT is set:"
        grep "WEBHOOK_PORT" .env
    else
        echo "   ❌ WEBHOOK_PORT is NOT set in .env"
    fi
    
    if grep -q "WEBHOOK_URL" .env; then
        echo "   ✅ WEBHOOK_URL is set:"
        grep "WEBHOOK_URL" .env
    else
        echo "   ❌ WEBHOOK_URL is NOT set in .env"
    fi
else
    echo "   ❌ .env file not found"
fi
echo ""

# Check 4: Test direct connection to port 3000
echo "4. Testing direct connection to localhost:3000..."
if curl -s -o /dev/null -w "   Status: %{http_code}\n" http://localhost:3000/health 2>/dev/null; then
    echo "   ✅ Webhook server is responding"
else
    echo "   ❌ Cannot connect to webhook server on port 3000"
fi
echo ""

# Check 5: Check nginx configuration
echo "5. Checking nginx configuration..."
if [ -f /etc/nginx/nginx.conf ]; then
    echo "   Checking if nginx is configured to proxy to port 3000..."
    if grep -q "proxy_pass.*3000" /etc/nginx/nginx.conf; then
        echo "   ✅ nginx is configured to proxy to port 3000"
        grep "proxy_pass.*3000" /etc/nginx/nginx.conf | head -1
    else
        echo "   ⚠️  nginx may not be configured to proxy to port 3000"
    fi
else
    echo "   ⚠️  nginx.conf not found"
fi
echo ""

# Check 6: Check bot logs for webhook server startup
echo "6. Checking bot logs for webhook server messages..."
if command -v pm2 &> /dev/null; then
    echo "   Looking for 'Webhook server' messages:"
    pm2 logs mistbot --lines 50 --nostream 2>/dev/null | grep -i "webhook" | tail -5 || echo "   (No webhook messages found)"
else
    echo "   (PM2 not available to check logs)"
fi
echo ""

# Summary and recommendations
echo "📋 Summary and Recommendations:"
echo ""

if ! sudo netstat -tlnp 2>/dev/null | grep :3000 > /dev/null && ! sudo ss -tlnp 2>/dev/null | grep :3000 > /dev/null; then
    echo "❌ MAIN ISSUE: Webhook server is not running on port 3000"
    echo ""
    echo "   To fix:"
    echo "   1. Check if WEBHOOK_PORT and WEBHOOK_URL are set in .env"
    echo "   2. Restart the bot: pm2 restart mistbot"
    echo "   3. Check logs: pm2 logs mistbot"
    echo "   4. Look for 'Webhook server listening' message in logs"
else
    echo "✅ Webhook server appears to be running"
    echo ""
    echo "   If you still get 502 errors:"
    echo "   1. Check nginx error logs: sudo tail -f /var/log/nginx/error.log"
    echo "   2. Verify nginx proxy_pass points to http://localhost:3000"
    echo "   3. Test direct connection: curl http://localhost:3000/health"
fi
echo ""

