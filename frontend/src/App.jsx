import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { ArrowRight, ArrowDown, CheckCircle, RefreshCw, Trophy, XCircle, Play } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- HELPER: CN ---
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// --- HELPER: GENERATE SOLUTION GRID ---
const generateSolutionGrid = (puzzleData) => {
  if (!puzzleData || !puzzleData.grid || !puzzleData.clues) return [];

  const rows = 15;
  const cols = 15;
  const solution = Array(rows).fill(null).map(() => Array(cols).fill(''));

  // Helper to place a word
  const placeWord = (r, c, direction, answer) => {
    if (!answer) return;
    for (let i = 0; i < answer.length; i++) {
      let nr = r + (direction === 'down' ? i : 0);
      let nc = c + (direction === 'across' ? i : 0);
      if (nr < rows && nc < cols) {
        solution[nr][nc] = answer[i];
      }
    }
  };

  // We need to map clue numbers to grid positions.
  // The 'puzzle.numbers' object keys are "r,c" and values are numbers.
  // We can flip this to map Number -> "r,c"
  const numberToPos = {};
  Object.entries(puzzleData.numbers).forEach(([key, num]) => {
    numberToPos[num] = key.split(',').map(Number);
  });

  // Now fill from clues
  ['across', 'down'].forEach(dir => {
    Object.entries(puzzleData.clues[dir]).forEach(([num, data]) => {
      if (numberToPos[num]) {
        const [r, c] = numberToPos[num];
        placeWord(r, c, dir, data.answer);
      }
    });
  });

  return solution;
};


// --- COMPONENT: CELL ---
const Cell = ({
  r, c, value, number, type,
  isFocused, isHighlighted, isError, isCorrect,
  onClick, onChange
}) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (isFocused && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  if (type === 0) {
    return <div className="w-full h-full bg-black border border-black" />;
  }

  return (
    <div
      className={cn(
        "relative w-full aspect-square border border-gray-300 bg-white transition-all duration-200 select-none",
        isHighlighted && "bg-blue-50",
        isFocused && "bg-blue-100 ring-2 ring-blue-500 z-10",
        isError && "bg-red-100 animate-shake",
        isCorrect && "bg-green-100 text-green-900",
        "hover:bg-blue-50 cursor-pointer"
      )}
      onClick={() => onClick(r, c)}
    >
      {number && (
        <span className="absolute top-0.5 left-0.5 text-[9px] sm:text-[10px] font-sans font-semibold leading-none text-gray-500 select-none">
          {number}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        maxLength={1}
        value={value}
        onChange={(e) => onChange(r, c, e.target.value)}
        onKeyDown={(e) => onChange(r, c, e.key, true)} // Handle special keys
        className={cn(
          "w-full h-full text-center bg-transparent border-none outline-none font-sans font-bold text-lg sm:text-xl uppercase p-0 caret-transparent cursor-pointer",
          isCorrect ? "text-green-700" : "text-gray-900"
        )}
      />
    </div>
  );
};

// --- COMPONENT: CLUE LIST ---
const ClueList = ({ title, clues, direction, currentClueNum, onClueClick }) => {
  const listRef = useRef(null);

  useEffect(() => {
    // Scroll to active clue
    if (currentClueNum) {
      const activeEl = listRef.current?.querySelector(`[data-clue="${currentClueNum}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentClueNum]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <h3 className="font-serif font-bold text-lg text-gray-900 p-4 border-b bg-gray-50 sticky top-0 z-10 shadow-sm flex items-center gap-2">
        {title === "ACROSS" ? <ArrowRight size={18} /> : <ArrowDown size={18} />}
        {title}
      </h3>
      <ul ref={listRef} className="flex-1 overflow-y-auto clue-scroll p-2 space-y-1">
        {Object.entries(clues).map(([num, data]) => (
          <li
            key={num}
            data-clue={num}
            onClick={() => onClueClick(num, title.toLowerCase())}
            className={cn(
              "text-sm p-3 rounded-md cursor-pointer transition-all duration-200 border border-transparent",
              parseInt(num) === currentClueNum && direction === title.toUpperCase()
                ? "bg-blue-600 text-white shadow-md transform scale-[1.02]"
                : "hover:bg-gray-100 text-gray-700"
            )}
          >
            <span className={cn("font-bold mr-2", parseInt(num) === currentClueNum && direction === title.toUpperCase() ? "text-blue-100" : "text-gray-900")}>{num}</span>
            <span dangerouslySetInnerHTML={{ __html: data.clue }} />
          </li>
        ))}
      </ul>
    </div>
  );
};

// --- MAIN APP ---
function App() {
  const [puzzle, setPuzzle] = useState(null);
  const [gridState, setGridState] = useState([]);
  const [solutionGrid, setSolutionGrid] = useState([]);
  const [focus, setFocus] = useState({ r: 0, c: 0 });
  const [direction, setDirection] = useState('ACROSS'); // 'ACROSS' | 'DOWN'
  const [loading, setLoading] = useState(true);
  const [isChecked, setIsChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // FETCH DATA
  useEffect(() => {
    fetchPuzzle();
  }, []);

  const fetchPuzzle = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:5000/api/latest-crossword');
      const data = await res.json();

      setPuzzle(data);

      // Initialize User Grid
      const initialGrid = data.grid.map(row => row.map(() => ''));
      setGridState(initialGrid);

      // Generate Solution Grid
      const sol = generateSolutionGrid(data);
      setSolutionGrid(sol);

      // Set focus to first white square
      let firstR = 0, firstC = 0;
      outer: for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
          if (data.grid[r][c] === 1) {
            firstR = r; firstC = c;
            break outer;
          }
        }
      }
      setFocus({ r: firstR, c: firstC });

      setLoading(false);
    } catch (err) {
      console.error("Error fetching puzzle:", err);
      setLoading(false);
    }
  };

  // --- GAME LOGIC ---

  // Handle Input
  const handleCellChange = (r, c, value, isKeyDown = false) => {
    if (isKeyDown) {
      // Handle Backspace
      if (value === 'Backspace') {
        const newGrid = [...gridState];
        // If current cell is empty, move back then delete
        if (newGrid[r][c] === '') {
          moveFocus(r, c, -1);
          // We need to calculate prev pos to delete it, 
          // but moveFocus handles state. 
          // A simpler way: just delete current, if empty move back.
        } else {
          newGrid[r][c] = '';
          setGridState(newGrid);
        }
        return;
      }
      // Handle Arrow Keys
      if (value.startsWith('Arrow')) {
        const dir = value.replace('Arrow', '').toUpperCase(); // LEFT, RIGHT, UP, DOWN
        moveArrow(r, c, dir);
        return;
      }
      return;
    }

    // Handle Text Input
    const char = value.slice(-1).toUpperCase();
    if (!/^[A-Z0-9]?$/.test(char)) return; // Only alphanumeric

    const newGrid = [...gridState];
    newGrid[r][c] = char;
    setGridState(newGrid);

    // Auto-advance
    if (char) {
      moveFocus(r, c, 1);
    }
  };

  const moveArrow = (r, c, arrowDir) => {
    let nr = r, nc = c;
    if (arrowDir === 'LEFT') nc--;
    if (arrowDir === 'RIGHT') nc++;
    if (arrowDir === 'UP') nr--;
    if (arrowDir === 'DOWN') nr++;

    if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && puzzle.grid[nr][nc] === 1) {
      setFocus({ r: nr, c: nc });
    }
  };

  const moveFocus = (r, c, step) => {
    let currR = r;
    let currC = c;
    let found = false;

    // Safety break
    let loopCount = 0;

    while (!found && loopCount < 300) {
      loopCount++;
      if (direction === 'ACROSS') {
        currC += step;
        if (currC >= 15) { currC = 0; currR++; }
        if (currC < 0) { currC = 14; currR--; }
      } else {
        currR += step;
        if (currR >= 15) { currR = 0; currC++; }
        if (currR < 0) { currR = 14; currC--; }
      }

      // Wrap around
      if (currR < 0) { currR = 14; currC = 14; }
      if (currR >= 15) { currR = 0; currC = 0; }

      if (puzzle.grid[currR][currC] === 1) {
        found = true;
        setFocus({ r: currR, c: currC });
      }
    }
  };

  const handleCellClick = (r, c) => {
    if (focus.r === r && focus.c === c) {
      setDirection(prev => prev === 'ACROSS' ? 'DOWN' : 'ACROSS');
    } else {
      setFocus({ r, c });
    }
  };

  const handleClueClick = (num, dir) => {
    setDirection(dir.toUpperCase());
    // Find coordinates of this number
    // We need to scan grid numbers
    const posStr = Object.keys(puzzle.numbers).find(key => puzzle.numbers[key] == num);
    if (posStr) {
      const [r, c] = posStr.split(',').map(Number);
      setFocus({ r, c });
    }
  };

  // Verification Logic
  const checkPuzzle = () => {
    setIsChecked(true);
    let allCorrect = true;
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        if (puzzle.grid[r][c] === 1) {
          if (gridState[r][c] !== solutionGrid[r][c]) {
            allCorrect = false;
          }
        }
      }
    }

    if (allCorrect) {
      setIsCorrect(true);
      confetti({
        particleCount: 200,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#3b82f6', '#10b981', '#f59e0b']
      });
    } else {
      setIsCorrect(false);
      setTimeout(() => setIsChecked(false), 2000); // Remove red error state after 2s
    }
  };

  const resetPuzzle = () => {
    if (window.confirm("Are you sure you want to clear the grid?")) {
      const initialGrid = puzzle.grid.map(row => row.map(() => ''));
      setGridState(initialGrid);
      setIsChecked(false);
      setIsCorrect(false);
    }
  };

  // Determine current active clue number
  const getCurrentClueNum = () => {
    if (!puzzle) return null;

    // Backtrack to find the number for the current word
    let r = focus.r;
    let c = focus.c;

    // Simple heuristic: Walk back until we hit a block or edge, or a numbered cell
    // This is a bit complex because a cell can be part of two words.
    // We already know the direction.

    while (r >= 0 && c >= 0 && puzzle.grid[r][c] === 1) {
      const key = `${r},${c}`;
      // If this cell has a number, and it matches the start of a word in this direction...
      if (puzzle.numbers[key]) {
        // Check if this number is a valid clue in current direction
        const num = puzzle.numbers[key];
        const dirKey = direction.toLowerCase();
        if (puzzle.clues[dirKey][num]) {
          return num;
        }
      }

      if (direction === 'ACROSS') c--;
      else r--;
    }
    return null;
  };

  const currentClueNum = getCurrentClueNum();

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-50 space-y-4">
      <div className="animate-spin text-blue-600"><RefreshCw size={48} /></div>
      <p className="text-gray-500 font-serif animate-pulse">Loading today's puzzle...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans text-gray-900">
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-serif font-bold tracking-tight text-gray-900 flex items-center gap-2">
              <span className="bg-black text-white p-1 rounded-sm text-lg">NYX</span>
              Daily Mini
            </h1>
            <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>
            <p className="text-sm text-gray-500 hidden sm:block font-medium">{puzzle?.title}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={resetPuzzle} className="p-2 text-gray-500 hover:text-red-500 transition-colors" title="Reset Puzzle">
              <RefreshCw size={20} />
            </button>
            <button
              onClick={checkPuzzle}
              className={cn(
                "flex items-center gap-2 px-5 py-2 rounded-full font-bold transition-all shadow-sm hover:shadow-md active:scale-95",
                isCorrect
                  ? "bg-green-500 text-white hover:bg-green-600"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              {isCorrect ? <Trophy size={18} /> : <CheckCircle size={18} />}
              {isCorrect ? "Solved!" : "Check"}
            </button>
          </div>
        </div>
      </header>

      {/* GAME BOARD AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start">

        {/* LEFT: GRID (8 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">

          {/* CURRENT CLUE BAR (MOBILE/DESKTOP) */}
          <div className="bg-blue-600 text-white p-4 rounded-lg shadow-md min-h-[80px] flex flex-col justify-center items-center text-center">
            <div className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">
              {direction} &bull; {currentClueNum || "-"}
            </div>
            <div className="font-serif text-lg sm:text-xl font-medium leading-tight">
              {currentClueNum
                ? puzzle.clues[direction.toLowerCase()][currentClueNum]?.clue
                : "Select a cell to start"}
            </div>
          </div>

          {/* THE GRID */}
          <div className="w-full max-w-[600px] mx-auto bg-black p-1 shadow-2xl rounded-sm">
            <div
              className="grid gap-[1px] bg-black border border-black"
              style={{
                gridTemplateColumns: `repeat(15, 1fr)`,
              }}
            >
              {puzzle.grid.map((row, r) => (
                row.map((cellType, c) => (
                  <Cell
                    key={`${r}-${c}`}
                    r={r} c={c}
                    type={cellType} // 0 or 1
                    number={puzzle.numbers[`${r},${c}`]}
                    value={gridState[r][c]}
                    isFocused={focus.r === r && focus.c === c}
                    isHighlighted={
                      (direction === 'ACROSS' && focus.r === r && cellType === 1) ||
                      (direction === 'DOWN' && focus.c === c && cellType === 1)
                    }
                    isError={isChecked && !isCorrect && gridState[r][c] !== '' && gridState[r][c] !== solutionGrid[r][c]}
                    isCorrect={isCorrect}
                    onClick={handleCellClick}
                    onChange={handleCellChange}
                  />
                ))
              ))}
            </div>
          </div>

          <p className="text-center text-gray-400 text-sm mt-4">
            Use <kbd className="font-mono bg-gray-200 px-1 rounded">Arrow Keys</kbd> to move, <kbd className="font-mono bg-gray-200 px-1 rounded">Space</kbd> to toggle direction.
          </p>
        </div>

        {/* RIGHT: CLUES (4 cols) */}
        <div className="lg:col-span-5 h-[600px] lg:h-[700px] bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
          <div className="bg-gray-50 border-b p-3 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">
            Clues
          </div>
          <div className="flex-1 flex flex-col sm:flex-row lg:flex-col overflow-hidden">
            <ClueList
              title="ACROSS"
              clues={puzzle.clues.across}
              direction={direction}
              currentClueNum={direction === 'ACROSS' ? currentClueNum : null}
              onClueClick={handleClueClick}
            />
            <div className="h-px bg-gray-200 w-full lg:block hidden"></div>
            <div className="w-px bg-gray-200 h-full lg:hidden block sm:block"></div>
            <ClueList
              title="DOWN"
              clues={puzzle.clues.down}
              direction={direction}
              currentClueNum={direction === 'DOWN' ? currentClueNum : null}
              onClueClick={handleClueClick}
            />
          </div>
        </div>

      </main>
    </div>
  );
}

export default App;