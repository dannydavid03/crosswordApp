import requests
from bs4 import BeautifulSoup
import re
import traceback

# Browser Headers (Good practice, even for RSS)
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
}

def extract_data_from_html(html_content):
    """Parses HTML content (from RSS or Web) to find Image and Clues."""
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # --- 1. FIND IMAGE ---
    image_url = None
    candidates = []
    
    # Find all images
    for img in soup.find_all('img'):
        src = img.get('src') or img.get('data-src')
        if not src or 'pixel' in src or 'icon' in src: continue
        
        # Score candidates
        score = 0
        if 'grid' in src.lower() or 'crossword' in src.lower(): score += 50
        width = int(img.get('width') or 0)
        if width > 200: score += 20
        
        candidates.append((score, src))
    
    # Pick best image
    candidates.sort(key=lambda x: x[0], reverse=True)
    if candidates:
        image_url = candidates[0][1]

    # --- 2. FIND CLUES ---
    clues = {"across": {}, "down": {}}
    text_content = soup.get_text("\n")
    lines = text_content.split("\n")
    
    current_section = None 
    line_pattern = re.compile(r"^\s*(\d+)([AD]?)\.?\s*(.+?)[:\u00A0\t]+(.+)$", re.IGNORECASE)

    for line in lines:
        line = line.strip()
        if not line: continue

        if "Across" in line and len(line) < 20: current_section = "across"
        if "Down" in line and len(line) < 20: current_section = "down"
            
        match = line_pattern.match(line)
        if match:
            num, d_char, clue, ans = match.groups()
            direction = "across" if d_char == 'A' else "down" if d_char == 'D' else current_section
            if direction:
                clues[direction][int(num)] = {"clue": clue.strip(), "answer": ans.strip().upper()}
                
    return image_url, clues

def get_latest_puzzle():
    print("--- STARTING SCRAPE (RSS STRATEGY) ---")
    
    try:
        # 1. Fetch RSS Feed
        rss_url = "https://nyxcrossword.com/feed"
        print(f"Fetching RSS: {rss_url}")
        res = requests.get(rss_url, headers=HEADERS, timeout=10)
        res.raise_for_status()
        
        # 2. Parse XML
        # We use 'xml' parser if available, else fallback
        try:
            feed_soup = BeautifulSoup(res.content, 'xml')
        except:
            feed_soup = BeautifulSoup(res.content, 'html.parser')
            
        item = feed_soup.find('item')
        if not item:
            return {"error": "RSS Feed fetched but empty."}

        title = item.find('title').get_text()
        print(f"Latest Post: {title}")

        # 3. Extract Content from RSS
        # WordPress/Blogspot puts full HTML in <content:encoded> or <description>
        content_encoded = item.find('content:encoded')
        description = item.find('description')
        
        html_payload = ""
        if content_encoded:
            html_payload = content_encoded.get_text()
        elif description:
            html_payload = description.get_text()
            
        if not html_payload:
            print("RSS had no content body. Fallback to scraping URL (likely to fail if blocked).")
            post_url = item.find('link').get_text()
            res_page = requests.get(post_url, headers=HEADERS)
            html_payload = res_page.text

        # 4. Parse the Payload
        image_url, clues = extract_data_from_html(html_payload)
        
        if image_url:
            print(f"Found Grid Image: {image_url}")
        else:
            print("WARNING: No image found in RSS content.")
            
        print(f"Found {len(clues['across'])} Across clues.")

        return {
            "title": title,
            "image_url": image_url,
            "clues": clues
        }

    except Exception as e:
        print(traceback.format_exc())
        return {"error": str(e)}