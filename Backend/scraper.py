import requests
from bs4 import BeautifulSoup
import re
import traceback
import gzip
import zlib
import subprocess
import shutil
from datetime import datetime

# --- STRATEGY 1: MASQUERADE AS IE 11 ---
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko',
    'Accept': 'text/html, application/xhtml+xml, */*',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'Keep-Alive'
}

def decode_content(response):
    content = response.content
    try:
        text = response.text
        if text.strip().startswith("<?xml") or "<rss" in text or "<html" in text:
            return text
    except:
        pass

    # GZIP
    if content.startswith(b'\x1f\x8b'):
        return gzip.decompress(content).decode('utf-8')

    # BROTLI
    if response.headers.get('Content-Encoding') == 'br':
        try:
            import brotli
            return brotli.decompress(content).decode('utf-8')
        except ImportError:
            return fetch_with_curl(response.url)

    return response.text

def fetch_with_curl(url):
    if not shutil.which("curl"):
        return ""
    try:
        result = subprocess.run(
            ["curl", "-s", "-L", "--compressed", "-A", HEADERS['User-Agent'], url],
            capture_output=True, text=True, encoding='utf-8'
        )
        return result.stdout
    except:
        return ""

def extract_data_from_html(html_content):
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

def construct_url_for_date(date_obj):
    # Pattern: https://nyxcrossword.com/2026/02/0208-26-ny-times-crossword-8-feb-26-sunday.html
    # YYYY/MM/MMDD-YY-ny-times-crossword-d-mon-yy-day.html
    
    yyyy = date_obj.strftime("%Y")
    mm = date_obj.strftime("%m")
    mmdd = date_obj.strftime("%m%d")
    yy = date_obj.strftime("%y")
    d = date_obj.strftime("%d").lstrip('0') # 8, not 08
    mon = date_obj.strftime("%b").lower() # feb
    day = date_obj.strftime("%A").lower() # sunday
    
    # Note: 'ny-times-crossword' might be variable? Assuming constant for now based on request.
    slug = f"{mmdd}-{yy}-ny-times-crossword-{d}-{mon}-{yy}-{day}"
    
    url = f"https://nyxcrossword.com/{yyyy}/{mm}/{slug}.html"
    print(f"Constructed URL: {url}")
    return url

def get_puzzle(date_str=None):
    """
    Fetches puzzle for a specific date (YYYY-MM-DD) or latest if None.
    """
    print(f"--- FETCHING PUZZLE: {date_str or 'LATEST'} ---")
    
    try:
        url = None
        target_date = None
        
        if date_str:
            target_date = datetime.strptime(date_str, "%Y-%m-%d")
            url = construct_url_for_date(target_date)
            # We might need fallback strategies if the URL pattern varies
        else:
            # RSS Fallback for "Latest"
            url = "https://nyxcrossword.com/feed"

        print(f"Target URL: {url}")
        
        html_payload = ""

        # Fetch Logic
        try:
             res = requests.get(url, headers=HEADERS, timeout=15)
             if res.status_code == 200:
                 html_payload = decode_content(res)
             else:
                 print(f"Status {res.status_code} for {url}. Trying CURL...")
        except:
             pass
             
        if not html_payload or not html_payload.strip().startswith("<"):
            html_payload = fetch_with_curl(url)

        if not html_payload:
            return {"error": "Failed to fetch content."}

        # If RSS, we need to parse XML to get the actual HTML content
        title = "Daily Crossword"
        if not date_str:
             try:
                soup = BeautifulSoup(html_payload, 'xml')
                item = soup.find('item')
                if item:
                    title = item.find('title').get_text()
                    content_encoded = item.find('content:encoded')
                    if content_encoded:
                        html_payload = content_encoded.get_text()
                    # Try to parse date from title or pubDate if needed
             except:
                 pass
        else:
             # Basic Title from Date
             title = f"Crossword for {target_date.strftime('%B %d, %Y')}"

        # Extract
        image_url, clues = extract_data_from_html(html_payload)
        
        if not image_url:
            return {"error": "No grid image found."}
            
        print(f"Found {len(clues['across'])} Across clues.")

        # Determine Grid Size
        # Standard: 15x15. Sunday: 21x21.
        rows = 15
        cols = 15
        
        # Check if Sunday
        is_sunday = False
        if date_str:
             if target_date.weekday() == 6: # Sunday = 6
                 is_sunday = True
        elif "sunday" in title.lower():
             is_sunday = True
             
        if is_sunday:
            print("Detected SUNDAY puzzle -> Setting 21x21 grid.")
            rows = 21
            cols = 21

        return {
            "title": title,
            "image_url": image_url,
            "clues": clues,
            "rows": rows,
            "cols": cols
        }

    except Exception as e:
        print("CRITICAL SCRAPER ERROR:")
        print(traceback.format_exc())
        return {"error": str(e)}