import requests
import json

BASE_URL = "http://localhost:5001/webhook/whatsapp"

def test_webhook(from_number, body):
    payload = {
        "From": from_number,
        "Body": body,
        "MessageSid": "SM123456789",
        "ExtraField": "some_value" # To test flexibility
    }
    
    print(f"\n--- Testing with From: {from_number}, Body: {body} ---")
    try:
        response = requests.post(
            BASE_URL, 
            data=payload, # Twilio sends form-encoded
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        if response.json().get("queued"):
            print("SUCCESS: Webhook responded immediately and queued the task.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Test cases
    # 1. Authorized number (mocked in app/page.tsx as +16462440305)
    test_webhook("whatsapp:+16462440305", "Check this out: https://google.com")
    
    # 2. Unauthorized number
    test_webhook("whatsapp:+19999999999", "https://example.com")
    
    # 3. Form-encoded with extra fields
    test_webhook("whatsapp:+16462440305", "Just a message without URL")
