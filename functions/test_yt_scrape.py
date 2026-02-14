"""Quick test script to debug YouTube scraping."""
import requests
import re
import json

url = "https://www.youtube.com/watch?v=hX17U0Oas9Q"
headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}
cookies = {"CONSENT": "YES+cb.20210328-17-p0.en+FX+299"}
response = requests.get(url, headers=headers, cookies=cookies, timeout=10)
html = response.text
print(f"HTML length: {len(html)}")
print(f"Status: {response.status_code}")
print(f"Final URL: {response.url}")

# Check for consent redirect
if "consent" in response.url.lower():
    print("!!! CONSENT REDIRECT DETECTED !!!")

# Check meta tags
t_match = re.search(r'<meta name="title" content="([^"]+)">', html)
print(f"Meta title: {t_match.group(1) if t_match else 'NOT FOUND'}")

d_match = re.search(r'<meta name="description" content="([^"]+)">', html)
print(f"Meta desc: {d_match.group(1)[:100] if d_match else 'NOT FOUND'}")

a_match = re.search(r'<link itemprop="name" content="([^"]+)">', html)
print(f"Author: {a_match.group(1) if a_match else 'NOT FOUND'}")

# Check ytInitialPlayerResponse
print(f"\nytInitialPlayerResponse in HTML: {'ytInitialPlayerResponse' in html}")

player_match = re.search(r'var ytInitialPlayerResponse\s*=\s*(\{.+?\});', html)
print(f"ytInitialPlayerResponse regex match: {bool(player_match)}")

# Try a more lenient regex that grabs more
player_match2 = re.search(r'ytInitialPlayerResponse\s*=\s*\{', html)
print(f"ytInitialPlayerResponse lenient regex: {bool(player_match2)}")

if player_match2:
    # Find the start position and try to extract JSON
    start = player_match2.start()
    eq_pos = html.index('=', start) + 1
    # Find the matching closing brace  
    brace_count = 0
    json_start = None
    for i in range(eq_pos, min(eq_pos + 500000, len(html))):
        if html[i] == '{':
            if json_start is None:
                json_start = i
            brace_count += 1
        elif html[i] == '}':
            brace_count -= 1
            if brace_count == 0:
                json_str = html[json_start:i+1]
                try:
                    data = json.loads(json_str)
                    vd = data.get("videoDetails", {})
                    print(f"\n--- Parsed videoDetails ---")
                    print(f"Title: {vd.get('title', 'N/A')}")
                    print(f"Author: {vd.get('author', 'N/A')}")
                    print(f"Length: {vd.get('lengthSeconds', 'N/A')}s")
                    print(f"Views: {vd.get('viewCount', 'N/A')}")
                    print(f"Keywords: {vd.get('keywords', [])[:5]}")
                    print(f"Description: {vd.get('shortDescription', 'N/A')[:200]}")
                    
                    # Check for captions
                    captions = data.get("captions", {})
                    player_captions = captions.get("playerCaptionsTracklistRenderer", {})
                    tracks = player_captions.get("captionTracks", [])
                    print(f"\nCaption tracks found: {len(tracks)}")
                    for track in tracks:
                        print(f" - {track.get('languageCode')} ({track.get('kind', 'manual')}): {track.get('baseUrl')[:100]}...")
                    
                    if tracks:
                        first_track = tracks[0]
                        # Try to get JSON format
                        transcript_url = first_track.get('baseUrl') + "&fmt=json3"
                        print(f"\nFetching transcript from: {transcript_url[:100]}...")
                        t_resp = requests.get(transcript_url, cookies=cookies, headers=headers)
                        print(f"Transcript status: {t_resp.status_code}")
                        print(f"Transcript body preview: {t_resp.text[:200]}")
                        if t_resp.ok:
                            try:
                                t_data = t_resp.json()
                                events = t_data.get("events", [])
                                print(f"Transcript events found: {len(events)}")
                                for event in events[:5]:
                                    if "segs" in event:
                                        text = "".join([s.get("utf8", "") for s in event["segs"]])
                                        print(f" - [{event.get('tStartMs', 0)//1000}s] {text}")
                            except Exception as e:
                                print(f"Transcript parse failed: {e}")
                except json.JSONDecodeError as e:
                    print(f"JSON parse failed: {e}")
                break
    else:
        print("Could not find closing brace")

# Show what's around the ytInitialPlayerResponse if it exists
idx = html.find('ytInitialPlayerResponse')
if idx >= 0:
    print(f"\n--- Context around ytInitialPlayerResponse (position {idx}) ---")
    print(html[max(0,idx-20):idx+200])
