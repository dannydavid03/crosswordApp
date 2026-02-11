import cv2
import numpy as np
import requests
import os

def get_default_grid(rows=15, cols=15):
    return [[1 for _ in range(cols)] for _ in range(rows)]

def process_grid_image(image_url, rows=15, cols=15):
    if not image_url:
        return get_default_grid(rows, cols)

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
        
        # Invert
        binary_inv = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                          cv2.THRESH_BINARY_INV, 15, 3)

        # 3. Find the Grid Contour
        contours, _ = cv2.findContours(binary_inv, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)
        
        best_cnt = None
        for i, cnt in enumerate(contours[:5]):
            x, y, w, h = cv2.boundingRect(cnt)
            aspect_ratio = float(w) / h
            area = cv2.contourArea(cnt)
            
            if 0.85 < aspect_ratio < 1.15 and area > 10000:
                best_cnt = cnt
                break
        
        # Crop Logic
        if best_cnt is not None:
            x, y, w, h = cv2.boundingRect(best_cnt)
            margin = int(w * 0.01) # 1% margin
            crop = gray[y+margin:y+h-margin, x+margin:x+w-margin]
        else:
            # Fallback
            h_img, w_img = gray.shape
            crop_size = min(h_img, w_img)
            start_x = (w_img - crop_size) // 2
            start_y = (h_img - crop_size) // 2
            crop = gray[start_y:start_y+crop_size, start_x:start_x+crop_size]

        # Resize for consistent sampling
        # We need a size divisible by both 15 and 21 to be safe, or just large enough.
        # 15*21 * x ... let's just use a fixed large size and calculate cell size dynamically
        target_size = 1050 # Divisible by 15 (70) and 21 (50)
        crop = cv2.resize(crop, (target_size, target_size))
        
        cell_size = target_size // cols # cols determines width division
        
        grid_matrix = []

        print(f"--- SAMPLING PIXELS ({rows}x{cols}) ---")
        
        for r in range(rows):
            row_data = []
            for c in range(cols):
                # Calculate center of cell
                # Note: if rows != cols (unlikely for NYT), we'd need separate y_cell_size
                y_center = r * cell_size + (cell_size // 2)
                x_center = c * cell_size + (cell_size // 2)
                
                # Sample a small box
                sample_box = crop[y_center-5:y_center+5, x_center-5:x_center+5]
                avg_val = np.mean(sample_box)
                
                is_black_square = 1 if avg_val < 60 else 0 
                cell_value = 0 if is_black_square else 1
                row_data.append(cell_value)

            grid_matrix.append(row_data)

        return grid_matrix

    except Exception as e:
        print(f"CV Error: {e}")
        import traceback
        traceback.print_exc()
        return get_default_grid(rows, cols)

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