#!/bin/bash
# Script to test webhook endpoint
# Usage: ./scripts/test-webhook-endpoint.sh <guildId> [webhookUrl]

GUILD_ID=$1
WEBHOOK_URL=${2:-"https://your-domain.com/webhook/sheets"}

if [ -z "$GUILD_ID" ]; then
  echo "Usage: $0 <guildId> [webhookUrl]"
  echo "Example: $0 996943472571453480 https://mistbot.duckdns.org/webhook/sheets"
  exit 1
fi

FULL_URL="${WEBHOOK_URL}/${GUILD_ID}"

echo "🧪 Testing webhook endpoint: ${FULL_URL}"
echo ""

# Test 1: Health check
echo "1. Testing health endpoint..."
HEALTH_URL=$(echo $WEBHOOK_URL | sed 's|/webhook/sheets.*|/health|')
curl -s -o /dev/null -w "   Status: %{http_code}\n" "$HEALTH_URL" || echo "   ❌ Health check failed"
echo ""

# Test 2: Send a test notification (simulating Google Drive API)
echo "2. Sending test notification (sync event)..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$FULL_URL" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Resource-State: sync" \
  -H "X-Goog-Channel-Id: test-channel-$(date +%s)" \
  -H "X-Goog-Resource-Id: test-resource-id" \
  -H "X-Goog-Message-Number: 1" \
  -d '{}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Webhook endpoint responded with 200 OK"
  echo "   Response: $BODY"
else
  echo "   ⚠️  Webhook endpoint responded with HTTP $HTTP_CODE"
  echo "   Response: $BODY"
fi
echo ""

# Test 3: Send a change notification
echo "3. Sending test change notification..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$FULL_URL" \
  -H "Content-Type: application/json" \
  -H "X-Goog-Resource-State: update" \
  -H "X-Goog-Channel-Id: test-channel-$(date +%s)" \
  -H "X-Goog-Resource-Id: test-resource-id" \
  -H "X-Goog-Message-Number: 2" \
  -d '{}')

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Change notification accepted (200 OK)"
else
  echo "   ⚠️  Change notification responded with HTTP $HTTP_CODE"
fi
echo ""

echo "✅ Test complete!"
echo ""
echo "Note: These are test requests. Real Google Drive notifications will have valid channel IDs."
echo "Check your bot logs to see if the notifications were processed."

