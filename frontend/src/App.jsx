import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { ArrowRight, ArrowDown, CheckCircle, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- HELPER COMPONENT: THE CELL ---
const Cell = ({ 
  r, c, value, number, type, isFocused, isHighlighted, 
  onClick, onChange 
}) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (isFocused && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  // --- THE FIX IS HERE ---
  // We use inline style={{ backgroundColor: 'black' }} to force it.
  if (type === 0) { 
    return (
      <div 
        style={{ backgroundColor: 'black' }} 
        className="w-full h-full border border-black" 
      />
    );
  }

  return (
    <div 
      className={twMerge(
        "relative w-full aspect-square border border-gray-400 bg-white transition-colors duration-75",
        isHighlighted && "bg-blue-100", 
        isFocused && "bg-yellow-200 ring-2 ring-blue-500 z-10"
      )}
      onClick={() => onClick(r, c)}
    >
      {number && (
        <span className="absolute top-0.5 left-0.5 text-[8px] sm:text-[10px] font-sans font-bold leading-none select-none">
          {number}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        maxLength={1}
        value={value}
        onChange={(e) => onChange(r, c, e.target.value)}
        className="w-full h-full text-center bg-transparent border-none outline-none font-sans font-bold text-lg sm:text-xl uppercase p-0"
      />
    </div>
  );
};
// --- MAIN APP ---
function App() {
  const [puzzle, setPuzzle] = useState(null);
  const [gridState, setGridState] = useState([]);
  const [focus, setFocus] = useState({ r: 0, c: 0 });
  const [direction, setDirection] = useState('ACROSS'); // 'ACROSS' | 'DOWN'
  const [loading, setLoading] = useState(true);

  // FETCH DATA FROM FLASK BACKEND
  useEffect(() => {
    fetchPuzzle();
  }, []);

  const fetchPuzzle = async () => {
    setLoading(true);
    try {
      // Assuming your Flask backend is running on port 5000
      const res = await fetch('http://127.0.0.1:5000/api/latest-crossword');
      const data = await res.json();
      
      setPuzzle(data);
      // Initialize User Grid (Empty Strings)
      const initialGrid = data.grid.map(row => row.map(cell => ''));
      setGridState(initialGrid);
      
      // Find first white square to focus
      // (Simple loop to find first 1)
      setLoading(false);
    } catch (err) {
      console.error("Error fetching puzzle:", err);
      setLoading(false);
    }
  };

  // --- GAME LOGIC ---

  const handleCellChange = (r, c, char) => {
    const val = char.slice(-1).toUpperCase();
    
    const newGrid = [...gridState];
    newGrid[r][c] = val;
    setGridState(newGrid);

    // Auto-advance logic
    if (val) {
      moveFocus(r, c, 1);
    }
  };

  const moveFocus = (r, c, step) => {
    // Simple lookahead for next white cell
    // (In production, use the helper function logic from Step A)
    let nextR = r;
    let nextC = c;
    
    if (direction === 'ACROSS') {
        nextC += step;
    } else {
        nextR += step;
    }
    
    // Boundary checks & Black square skipping (Simplified)
    if(nextR < 15 && nextC < 15 && puzzle.grid[nextR][nextC] === 1) {
        setFocus({ r: nextR, c: nextC });
    }
  };

  const handleCellClick = (r, c) => {
    if (focus.r === r && focus.c === c) {
      // Toggle direction if clicking the same cell
      setDirection(prev => prev === 'ACROSS' ? 'DOWN' : 'ACROSS');
    } else {
      setFocus({ r, c });
    }
  };

  const checkPuzzle = () => {
    // Flatten grid and check
    // This is a placeholder. You would need the 'answer' matrix from backend
    // For now, let's just trigger confetti for fun!
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 }
    });
    alert("Checking answers... (Implement verification logic here!)");
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin text-news-blue"><RefreshCw size={40}/></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans">
      {/* HEADER */}
      <header className="bg-news-black text-white p-4 shadow-lg sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-serif font-bold tracking-wider">NYX DAILY</h1>
            <p className="text-xs text-gray-400">{puzzle?.title || "Daily Crossword"}</p>
          </div>
          <div className="flex gap-4">
            <button onClick={checkPuzzle} className="flex items-center gap-2 bg-news-blue px-4 py-2 rounded-full font-bold hover:bg-blue-600 transition">
              <CheckCircle size={18} /> Check
            </button>
          </div>
        </div>
      </header>

      {/* GAME BOARD AREA */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 flex flex-col lg:flex-row gap-8 items-start">
        
        {/* LEFT: GRID */}
        <div className="flex-none mx-auto lg:mx-0 shadow-2xl rounded-lg overflow-hidden border-4 border-black bg-black">
          <div 
            className="grid gap-[1px] bg-black" 
            style={{ 
              gridTemplateColumns: `repeat(15, minmax(20px, 34px))`, 
            }}
          >
            {puzzle.grid.map((row, r) => (
              row.map((cellType, c) => (
                <Cell 
                  key={`${r}-${c}`}
                  r={r} 
                  c={c}
                  type={cellType} // 0 or 1
                  number={puzzle.numbers[`${r},${c}`]}
                  value={gridState[r][c]}
                  isFocused={focus.r === r && focus.c === c}
                  // Simple logic: Highlight if in same row/col as focus
                  isHighlighted={
                    (direction === 'ACROSS' && focus.r === r && cellType === 1) ||
                    (direction === 'DOWN' && focus.c === c && cellType === 1)
                  }
                  onClick={handleCellClick}
                  onChange={handleCellChange}
                />
              ))
            ))}
          </div>
        </div>

        {/* RIGHT: CLUES */}
        <div className="flex-1 w-full bg-white rounded-xl shadow-sm border border-gray-200 h-[600px] flex flex-col">
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <h2 className="font-bold text-gray-700 flex items-center gap-2">
              {direction === 'ACROSS' ? <ArrowRight size={20}/> : <ArrowDown size={20}/>}
              Current Clue
            </h2>
            <div className="text-sm text-gray-400">
               Click a clue to jump
            </div>
          </div>
          
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            {/* ACROSS CLUES */}
            <div className="flex-1 overflow-y-auto clue-scroll p-4 border-r">
              <h3 className="font-bold text-news-blue mb-3 sticky top-0 bg-white py-2">ACROSS</h3>
              <ul className="space-y-2">
                {Object.entries(puzzle.clues.across).map(([num, data]) => (
                  <li 
                    key={`a-${num}`} 
                    className="text-sm hover:bg-blue-50 p-2 rounded cursor-pointer transition-colors"
                    onClick={() => {
                        // Logic to find coords of this number would go here
                        setDirection('ACROSS');
                    }}
                  >
                    <span className="font-bold mr-2 text-news-blue">{num}</span>
                    {data.clue}
                  </li>
                ))}
              </ul>
            </div>

            {/* DOWN CLUES */}
            <div className="flex-1 overflow-y-auto clue-scroll p-4">
              <h3 className="font-bold text-news-blue mb-3 sticky top-0 bg-white py-2">DOWN</h3>
              <ul className="space-y-2">
                {Object.entries(puzzle.clues.down).map(([num, data]) => (
                  <li 
                    key={`d-${num}`} 
                    className="text-sm hover:bg-blue-50 p-2 rounded cursor-pointer transition-colors"
                    onClick={() => {
                        setDirection('DOWN');
                    }}
                  >
                    <span className="font-bold mr-2 text-news-blue">{num}</span>
                    {data.clue}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

export default App;