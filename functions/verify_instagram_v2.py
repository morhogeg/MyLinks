
import sys
import os
from unittest.mock import MagicMock

# Add current dir to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Mock firebase_admin and other heavyweight imports before importing main
sys.modules['firebase_admin'] = MagicMock()
sys.modules['firebase_functions'] = MagicMock()
sys.modules['google.cloud'] = MagicMock()

import main

def test_instagram_improvements():
    print("Testing Instagram Improvements...")
    
    # Scenario: User shares from Instagram with a long caption
    url = "https://www.instagram.com/reel/C3fV_S-v7U6/"
    long_caption = "Parenting is hard but rewarding. Here are 3 tips for toddlers: 1. Patience 2. Routine 3. Love. Follow for more parenting advice!"
    body = f"Check out this reel! {url} {long_caption}"
    
    print(f"\n--- Scenario: WhatsApp Share with Long Caption ---")
    result = main.scrape_url(url, body)
    print(f"Result Title: {result.get('title')}")
    print(f"Result Text contains caption guess: {long_caption in result.get('text')}")
    
    if long_caption in result.get('text') and result.get('title') != "Instagram Post":
        print("✅ SUCCESS: Captured caption and used it for Title.")
    else:
         print("❌ FAILURE: Didn't use caption effectively.")

    # Scenario: Bridge returns generic title but WhatsApp has info
    print(f"\n--- Scenario: Generic Bridge Title + WhatsApp Info ---")
    # Simulate a result where bridge fails but body is rich
    # Actually scrape_url will run the real _scrape_instagram_url
    # which we just updated.
    
    body_with_noise = f"Watch this reel by @parenting_pro: {url} This is a great tip for sleep training."
    result2 = main.scrape_url(url, body_with_noise)
    print(f"Result Title: {result2.get('title')}")
    if "@parenting_pro" in result2.get('text') and "sleep training" in result2.get('text'):
        print("✅ SUCCESS: Extracted info from noisy WhatsApp body")
    else:
        print("❌ FAILURE: Still stuck with generic info")

if __name__ == "__main__":
    test_instagram_improvements()
