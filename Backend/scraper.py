import requests
from bs4 import BeautifulSoup
import re
import traceback
import gzip
import zlib
import subprocess
import shutil

# --- STRATEGY 1: MASQUERADE AS IE 11 ---
# IE 11 does not support Brotli (br), so the server MUST send gzip or deflate.
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko',
    'Accept': 'text/html, application/xhtml+xml, */*',
    'Accept-Encoding': 'gzip, deflate', # Explicitly exclude 'br'
    'Connection': 'Keep-Alive'
}

def decode_content(response):
    """
    Decodes response content handling Gzip, Deflate, and Brotli manually if needed.
    """
    content = response.content
    
    # 1. Try standard decoding (requests usually handles gzip/deflate auto-magically)
    try:
        text = response.text
        if text.strip().startswith("<?xml") or "<rss" in text or "<html" in text:
            return text
    except:
        pass

    print("WARNING: Standard decode failed. Checking compressed signatures...")
    
    # 2. Check for GZIP (Magic: 1f 8b)
    if content.startswith(b'\x1f\x8b'):
        print("DETECTED: GZIP data (manual)")
        return gzip.decompress(content).decode('utf-8')

    # 3. Check for BROTLI (if server ignored us and sent 'br' anyway)
    # Note: We can only do this if the user has the 'brotli' package.
    if response.headers.get('Content-Encoding') == 'br':
        try:
            import brotli
            print("DETECTED: Brotli data (using 'brotli' lib)")
            return brotli.decompress(content).decode('utf-8')
        except ImportError:
            print("ERROR: Server sent Brotli (br) but 'brotli' pip package is missing.")
            print("FALLBACK: Attempting to use system CURL...")
            return fetch_with_curl(response.url)

    return response.text

def fetch_with_curl(url):
    """
    Last resort: Use system 'curl' which usually handles compression transparently.
    """
    if not shutil.which("curl"):
        raise Exception("CURL not found on system and Brotli decode failed.")
        
    try:
        print(f"Executing CURL for {url}...")
        # -s: Silent, -L: Follow redirects, --compressed: Handle gzip/brotli
        result = subprocess.run(
            ["curl", "-s", "-L", "--compressed", "-A", HEADERS['User-Agent'], url],
            capture_output=True,
            text=True,
            encoding='utf-8'
        )
        return result.stdout
    except Exception as e:
        print(f"CURL failed: {e}")
        return ""

def extract_data_from_html(html_content):
    """Parses HTML content (from RSS or Web) to find Image and Clues."""
    if not html_content: return None, {"across": {}, "down": {}}

    soup = BeautifulSoup(html_content, 'html.parser')
    
    # --- 1. FIND IMAGE ---
    image_url = None
    candidates = []
    
    for img in soup.find_all('img'):
        src = img.get('src') or img.get('data-src')
        if not src or 'pixel' in src or 'icon' in src: continue
        
        score = 0
        if 'grid' in src.lower() or 'crossword' in src.lower(): score += 50
        width = int(img.get('width') or 0)
        if width > 200: score += 20
        
        candidates.append((score, src))
    
    candidates.sort(key=lambda x: x[0], reverse=True)
    if candidates:
        image_url = candidates[0][1]

    # --- 2. FIND CLUES ---
    clues = {"across": {}, "down": {}}
    
    for br in soup.find_all("br"):
        br.replace_with("\n")
        
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
    print("--- STARTING SCRAPE (IE11 + CURL STRATEGY) ---")
    
    try:
        rss_url = "https://nyxcrossword.com/feed"
        print(f"Fetching RSS: {rss_url}")
        
        payload_text = ""
        
        try:
            res = requests.get(rss_url, headers=HEADERS, timeout=15)
            print(f"Status: {res.status_code}, Encoding: {res.headers.get('Content-Encoding')}")
            
            if res.status_code == 200:
                payload_text = decode_content(res)
        except Exception as e:
            print(f"Requests failed ({e}). Trying CURL...")
        
        # Fallback to CURL if requests failed or returned empty/garbage
        if not payload_text or not payload_text.strip().startswith("<"):
            payload_text = fetch_with_curl(rss_url)

        # Validate XML
        if not payload_text or not payload_text.strip().startswith("<"):
            return {"error": "Failed to retrieve valid XML data."}

        # 2. Parse XML
        try:
            feed_soup = BeautifulSoup(payload_text, 'xml')
        except:
            feed_soup = BeautifulSoup(payload_text, 'html.parser')
            
        item = feed_soup.find('item')
        if not item:
            return {"error": "RSS Feed parsed but empty (no <item>)."}

        title = item.find('title').get_text()
        print(f"Latest Post: {title}")

        # 3. Extract Content
        content_encoded = item.find('content:encoded') or item.find('encoded') or item.find('content')
        description = item.find('description')
        
        html_payload = ""
        if content_encoded:
            html_payload = content_encoded.get_text()
        elif description:
            html_payload = description.get_text()
            
        if not html_payload:
            print("RSS body empty. Scraping link directly...")
            post_url = item.find('link').get_text()
            
            # Try fetching post with Requests
            res_page = requests.get(post_url, headers=HEADERS)
            html_payload = decode_content(res_page)
            
            # Retry with CURL if needed
            if not html_payload or not html_payload.strip().startswith("<"):
                html_payload = fetch_with_curl(post_url)

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
        print("CRITICAL SCRAPER ERROR:")
        print(traceback.format_exc())
        return {"error": str(e)}