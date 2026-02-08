#!/bin/bash

# Configuration
URL="http://localhost:5001/webhook/whatsapp"
# Replace with a real phone number registered in your local Firestore
FROM_NUMBER="+1234567890" 
# Example Recipe URL
LINK="https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/"

echo "🚀 Simulating WhatsApp message with link: $LINK"

curl -X POST $URL \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "From=whatsapp:$FROM_NUMBER" \
     -d "Body=$LINK" \
     -d "MessageSid=SM12345"

echo -e "\n\n✅ Request sent. Check the backend logs and your local Second Brain UI!"
