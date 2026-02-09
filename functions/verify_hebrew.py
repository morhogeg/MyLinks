
import sys
import os
import json
from datetime import datetime

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from ai_service import ClaudeService, SYSTEM_PROMPT
from main import _format_success_message, LinkStatus

def test_hebrew_support():
    print("--- Testing Hebrew Support ---")
    
    # 1. Test Mock AI Analysis for Hebrew
    # We can't easily mock the Gemini API call without mocking the library, 
    # but we can test the Prompt structure by printing it (not really useful)
    # or better, we can test the logic around the result.
    
    # Let's test the _format_success_message first as it's deterministic
    print("\n1. Testing Message Localization:")
    
    hebrew_link_data = {
        "title": "בדיקה של כותרת בעברית",
        "category": "Tech", # Should be English
        "tags": ["טכנולוגיה", "בדיקה"],
        "metadata": {
            "estimatedReadTime": 5,
            "actionableTakeaway": "זוהי תובנה בעברית לבדיקה."
        }
    }
    
    msg_he = _format_success_message(hebrew_link_data, language="he")
    print(f"\nHebrew Message:\n{msg_he}")
    
    # Assertions for Hebrew
    if "✅ *נשמר למוח השני*" in msg_he:
        print("✓ Hebrew Header found")
    else:
        print("✗ Hebrew Header MISSING")
        
    if "קטגוריה" in msg_he:
        print("✓ Hebrew Category label found")
    else:
        print("✗ Hebrew Category label MISSING")
        
    if "תובנה מרכזית" in msg_he:
        print("✓ Hebrew Insight label found")
    else:
        print("✗ Hebrew Insight label MISSING")

    # Test English fallback
    print("\n2. Testing English Fallback:")
    msg_en = _format_success_message(hebrew_link_data, language="en")
    
    if "Saved to Second Brain" in msg_en:
        print("✓ English Header found")
    else:
        print("✗ English Header MISSING")


    # 3. Test AI Prompt contains language Instructions
    print("\n3. Verifying System Prompt Updates:")
    
    if "1. language: Identify the primary language" in SYSTEM_PROMPT:
        print("✓ 'language' field instruction found in prompt")
    else:
        print("✗ 'language' field instruction MISSING in prompt")
        
    if "**LANGUAGE**: Write the title in the SAME language" in SYSTEM_PROMPT:
        print("✓ Language consistency instruction found in prompt")
    else:
        print("✗ Language consistency instruction MISSING in prompt")

if __name__ == "__main__":
    try:
        test_hebrew_support()
        print("\n--- Test Complete ---")
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
