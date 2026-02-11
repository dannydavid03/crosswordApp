from flask import Flask, jsonify, request
from flask_cors import CORS
from scraper import get_puzzle
from grid_extractor import process_grid_image, generate_numbering
import traceback

app = Flask(__name__)
CORS(app)

@app.route('/api/crossword', methods=['GET'])
def get_crossword():
    # Accept 'date' param (YYYY-MM-DD), optional
    date_str = request.args.get('date')
    
    try:
        # 1. Scrape Data
        scraped_data = get_puzzle(date_str)
        
        # Check for scraper errors
        if "error" in scraped_data:
            print("Scraper returned error:", scraped_data['error'])
            return jsonify(scraped_data), 500

        # 2. Process Image
        # Pass rows/cols from scraper to extractor
        rows = scraped_data.get('rows', 15)
        cols = scraped_data.get('cols', 15)
        
        print(f"Processing grid image ({rows}x{cols})...")
        try:
            grid_matrix = process_grid_image(scraped_data['image_url'], rows, cols)
        except Exception as e:
            print(f"Image processing failed: {e}")
            print(traceback.format_exc())
            return jsonify({"error": "Failed to process grid image."}), 500
        
        # 3. Generate Numbers
        grid_numbers = generate_numbering(grid_matrix)

        print("Successfully built puzzle!")
        return jsonify({
            "title": scraped_data['title'],
            "grid": grid_matrix,
            "numbers": grid_numbers,
            "clues": scraped_data['clues'],
            "date": date_str
        })

    except Exception as e:
        print("CRITICAL SERVER ERROR:")
        print(traceback.format_exc())
        return jsonify({"error": "Internal Server Error", "details": str(e)}), 500

# Keep legacy endpoint for backward compatibility (optional)
@app.route('/api/latest-crossword', methods=['GET'])
def latest_crossword():
    return get_crossword()

if __name__ == '__main__':
    app.run(debug=True, port=5000)