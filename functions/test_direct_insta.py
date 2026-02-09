
import requests
from bs4 import BeautifulSoup

def test_direct_scrape():
    url = "https://www.instagram.com/reel/DGwCe2Lob53/"
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    
    print(f"Scraping {url} directly...")
    try:
        response = requests.get(url, headers=headers, timeout=10)
        print(f"Status: {response.status_code}")
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Check various meta tags
        meta_tags = [
            {'property': 'og:description'},
            {'name': 'description'},
            {'property': 'og:title'},
            {'name': 'twitter:description'}
        ]
        
        for attr in meta_tags:
            tag = soup.find('meta', attrs=attr)
            if tag:
                print(f"Found {attr}: {tag.get('content')}")
            else:
                print(f"Not found {attr}")
                
        # Also check title tag
        if soup.title:
            print(f"Title tag: {soup.title.string}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_direct_scrape()
