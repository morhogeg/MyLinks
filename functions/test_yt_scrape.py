"""Quick test script to debug YouTube scraping."""
import requests
import re
import json

url = "https://www.youtube.com/watch?v=88-q3TIwdnA"
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
                    print(f"Keywords: {vd.get('keywords', [])[:5]}")
                    print(f"Short Description: {vd.get('shortDescription', 'N/A')[:200]}")
                    
                    # Full description in microformat
                    micro = data.get("microformat", {}).get("playerMicroformatRenderer", {})
                    full_desc = micro.get("description", {}).get("simpleText", "")
                    print(f"Full Description length: {len(full_desc)}")
                    if full_desc:
                        print(f"Full Description start: {full_desc[:200]}")

                    # Check for captions
                    captions = data.get("captions", {})
                    player_captions = captions.get("playerCaptionsTracklistRenderer", {})
                    tracks = player_captions.get("captionTracks", [])
                    print(f"\nCaption tracks found: {len(tracks)}")
                    for track in tracks:
                        print(f" - {track.get('languageCode')} ({track.get('kind', 'manual')}): {track.get('baseUrl')[:100]}...")
                    
                    if tracks:
                        first_track = tracks[0]
                        # Try to get VTT format
                        transcript_url = first_track.get('baseUrl') + "&fmt=vtt"
                        print(f"\nFetching VTT transcript from: {transcript_url[:100]}...")
                        t_resp = requests.get(transcript_url, cookies=cookies, headers=headers)
                        print(f"Transcript status: {t_resp.status_code}")
                        print(f"Transcript body preview (first 500): {t_resp.text[:500]}")
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

try:
    from youtube_transcript_api import YouTubeTranscriptApi
    transcript_list = YouTubeTranscriptApi.list_transcripts("88-q3TIwdnA")
    print(f"List Transcripts success!")
    # Try to find 'en'
    try:
        t = transcript_list.find_transcript(['en'])
        print(f"Found en transcript: {t.language_code}")
        data = t.fetch()
        print(f"Fetch success! Lines: {len(data)}")
    except:
        print("Could not find en, trying any...")
        t = next(iter(transcript_list))
        print(f"Found any transcript: {t.language_code}")
        data = t.fetch()
        print(f"Fetch success! Lines: {len(data)}")
except Exception as e:
    print(f"List Transcripts failed: {e}")

# Check ytInitialData for full description
print(f"\nytInitialData in HTML: {'ytInitialData' in html}")
data_match = re.search(r'var ytInitialData\s*=\s*(\{.+?\});', html)
if data_match:
    print("ytInitialData regex match: True")
    start = data_match.start()
    eq_pos = html.index('=', start) + 1
    brace_start = html.find('{', eq_pos)
    brace_count = 0
    for i in range(brace_start, min(brace_start + 1000000, len(html))):
        if html[i] == '{':
            brace_count += 1
        elif html[i] == '}':
            brace_count -= 1
            if brace_count == 0:
                try:
                    data = json.loads(html[brace_start:i+1])
                    
                    # Search for chapters
                    def find_chapters(obj):
                        if isinstance(obj, dict):
                            if "macroMarkersListItemRenderer" in obj:
                                return obj
                            for k, v in obj.items():
                                if k == "chapters": return v
                                res = find_chapters(v)
                                if res: return res
                        elif isinstance(obj, list):
                            for item in obj:
                                res = find_chapters(item)
                                if res: return res
                        return None
                    
                    chapters = find_chapters(data)
                    print(f"Chapters found: {bool(chapters)}")
                    if chapters:
                         print(f"Chapters count: {len(chapters)}")
                except Exception as e:
                    print(f"ytInitialData parse failed: {e}")
                break

# Last resort: find "description":{"simpleText":...} or similar anywhere in the HTML
desc_match = re.finditer(r'"description":\s*\{\s*"simpleText":\s*"([^"]+)"', html)
for m in desc_match:
    d = m.group(1).replace('\\n', '\n')
    if len(d) > 200:
        print(f"\nFound long simpleText description (len {len(d)}): {d[:200]}...")

runs_match = re.finditer(r'"description":\s*\{\s*"runs":\s*\[(.+?)\]\s*\}', html)
for m in runs_match:
    try:
        runs_json = "[" + m.group(1) + "]"
        runs = json.loads(runs_json)
        d = "".join([r.get("text", "") for r in runs])
        if len(d) > 200:
            print(f"\nFound long runs description (len {len(d)}): {d[:200]}...")
    except:
        pass
else:
    # Try more lenient find
    d_idx = html.find('ytInitialData =')
    if d_idx >= 0:
        print(f"ytInitialData found at {d_idx}")
