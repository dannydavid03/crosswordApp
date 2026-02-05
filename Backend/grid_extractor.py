import cv2
import numpy as np
import requests
import os

def get_default_grid():
    return [[1 for _ in range(15)] for _ in range(15)]

def process_grid_image(image_url):
    if not image_url:
        return get_default_grid()

    try:
        # 1. Download
        headers = {'User-Agent': 'Mozilla/5.0'}
        print(f"Downloading image from: {image_url}")
        resp = requests.get(image_url, headers=headers, timeout=10)
        resp.raise_for_status()
        
        image_array = np.asarray(bytearray(resp.content), dtype="uint8")
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if image is None: raise Exception("Invalid image")

        # 2. Preprocessing
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Save original for debugging
        cv2.imwrite("debug_original.jpg", gray)

        # Invert: Text/Black Squares become WHITE (255). Background becomes BLACK (0).
        # This helps contours find "filled" areas better.
        binary_inv = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                          cv2.THRESH_BINARY_INV, 15, 3)

        # 3. Find the Grid Contour
        contours, _ = cv2.findContours(binary_inv, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Sort contours by Area (Largest first)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)
        
        best_cnt = None
        
        print(f"Found {len(contours)} contours. Analyzing top 5...")
        
        for i, cnt in enumerate(contours[:5]):
            x, y, w, h = cv2.boundingRect(cnt)
            aspect_ratio = float(w) / h
            area = cv2.contourArea(cnt)
            
            # Constraints for a Crossword Grid:
            # 1. Must be square-ish (0.9 to 1.1 ratio)
            # 2. Must be large enough (> 10% of image usually, but let's say > 2000px)
            print(f"Contour {i}: Size {w}x{h}, Aspect {aspect_ratio:.2f}, Area {area}")
            
            if 0.85 < aspect_ratio < 1.15 and area > 10000:
                best_cnt = cnt
                print(" -> MATCH FOUND! Using this contour.")
                break
        
        # Crop Logic
        if best_cnt is not None:
            x, y, w, h = cv2.boundingRect(best_cnt)
            # Refine crop: Remove outer border (often contains grid numbers/lines)
            margin = int(w * 0.01) # 1% margin
            crop = gray[y+margin:y+h-margin, x+margin:x+w-margin]
            print(f"Cropped to: x={x}, y={y}, w={w}, h={h}")
        else:
            print("WARNING: No perfect grid contour found. Using Center Crop fallback.")
            # Fallback: Assume grid is in the center, taking up 80% of width
            h_img, w_img = gray.shape
            crop_size = min(h_img, w_img)
            start_x = (w_img - crop_size) // 2
            start_y = (h_img - crop_size) // 2
            crop = gray[start_y:start_y+crop_size, start_x:start_x+crop_size]

        # Resize for consistent sampling
        target_size = 750 # 15 * 50px per cell
        crop = cv2.resize(crop, (target_size, target_size))
        
        # DEBUG: DRAW GRID LINES ON IMAGE TO SEE ALIGNMENT
        debug_img = cv2.cvtColor(crop, cv2.COLOR_GRAY2BGR)
        
        rows, cols = 15, 15
        cell_size = target_size // 15
        grid_matrix = []

        print("--- SAMPLING PIXELS ---")
        
        for r in range(rows):
            row_data = []
            for c in range(cols):
                # Calculate center of cell
                y_center = r * cell_size + (cell_size // 2)
                x_center = c * cell_size + (cell_size // 2)
                
                # Sample a small 10x10 box in the center of the cell
                # We avoid the edges to not hit the grid lines or letters
                sample_box = crop[y_center-5:y_center+5, x_center-5:x_center+5]
                avg_val = np.mean(sample_box)
                
                # Standard Grayscale: 0=Black, 255=White.
                # Heuristic: Black squares are VERY dark (< 50). 
                # White squares (even with letters) are brighter (> 100).
                is_black_square = 1 if avg_val < 60 else 0 
                
                # Invert for Frontend: 0 = Black Block, 1 = Playable White
                cell_value = 0 if is_black_square else 1
                row_data.append(cell_value)
                
                # Draw on debug image (Red dot = Black Square detected, Green = White)
                color = (0, 0, 255) if is_black_square else (0, 255, 0)
                cv2.circle(debug_img, (x_center, y_center), 4, color, -1)
                
                # Print first few cells to debug console
                if r == 0 and c < 5:
                    print(f"Cell (0,{c}): Avg Pixel {avg_val:.1f} -> {'BLACK' if is_black_square else 'WHITE'}")

            grid_matrix.append(row_data)

        # SAVE DEBUG IMAGE
        cv2.imwrite("debug_grid_view.jpg", debug_img)
        print("Saved debug_grid_view.jpg - CHECK THIS FILE!")
        
        return grid_matrix

    except Exception as e:
        print(f"CV Error: {e}")
        import traceback
        traceback.print_exc()
        return get_default_grid()

# Generate numbering remains the same...
def generate_numbering(grid_matrix):
    rows = len(grid_matrix)
    cols = len(grid_matrix[0])
    numbers = {}
    counter = 1
    for r in range(rows):
        for c in range(cols):
            if grid_matrix[r][c] == 0: continue
            is_across = (c == 0 or grid_matrix[r][c-1] == 0)
            is_down   = (r == 0 or grid_matrix[r-1][c] == 0)
            if is_across or is_down:
                numbers[f"{r},{c}"] = counter
                counter += 1
    return numbers