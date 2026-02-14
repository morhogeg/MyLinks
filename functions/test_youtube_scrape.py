
import sys
import os

# Add the current directory to sys.path so we can import from main
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import scrape_url

# Test with a known YouTube video (e.g., a TED talk or similar informational video)
test_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ" # Rick Roll for consistency, or something more "second brain" like:
test_url_2 = "https://www.youtube.com/watch?v=p4vM3rYWxYk" # Veritassium - "The Man Who Invented the API"

print(f"Testing URL: {test_url_2}")
result = scrape_url(test_url_2)

print("\n--- Scrape Result ---")
print(f"Title: {result.get('title')}")
print(f"Text Length: {len(result.get('text', ''))}")
print(f"Text Preview: {result.get('text', '')[:500]}")
