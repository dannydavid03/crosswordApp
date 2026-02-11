import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { ArrowRight, ArrowDown, CheckCircle, RefreshCw, Trophy, XCircle, Play, Calendar } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- HELPER: CN ---
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// --- HELPER: GENERATE SOLUTION GRID ---
const generateSolutionGrid = (puzzleData) => {
  if (!puzzleData || !puzzleData.grid || !puzzleData.clues) return [];

  const rows = puzzleData.grid.length;
  const cols = puzzleData.grid[0].length;
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

  const numberToPos = {};
  Object.entries(puzzleData.numbers).forEach(([key, num]) => {
    numberToPos[num] = key.split(',').map(Number);
  });

  ['across', 'down'].forEach(dir => {
    Object.entries(puzzleData.clues[dir]).forEach(([num, data]) => {
      if (numberToPos[num]) {
        const [r, c] = numberToPos[num];
        placeWord(r, c, dir, data.answer.toUpperCase());
      }
    });
  });

  return solution;
};


// --- COMPONENT: CELL ---
const Cell = ({
  r, c, value, number, type,
  isFocused, isHighlighted, isError, isCorrect,

  onClick, onChange, onKeyDown
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
        "relative w-full aspect-square border border-gray-400 bg-white transition-all duration-75 select-none", // Reduced duration for snappiness
        isHighlighted && "bg-blue-50",
        isFocused && "bg-blue-200 ring-2 ring-blue-600 z-10",
        isError && "bg-red-100 animate-shake",
        isCorrect && "bg-green-100 text-green-900",
        "hover:bg-blue-50 cursor-pointer"
      )}
      onClick={() => onClick(r, c)}
    >
      {number && (
        <span className="absolute top-0.5 left-0.5 text-[8px] sm:text-[9px] font-sans font-bold leading-none text-gray-600 select-none z-20">
          {number}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        // No maxLength to allow type-over
        value={value}
        onChange={(e) => onChange(r, c, e.target.value)}
        onKeyDown={(e) => onKeyDown(r, c, e)}
        className={cn(
          "w-full h-full text-center bg-transparent border-none outline-none font-sans font-bold text-lg sm:text-xl uppercase p-0 caret-transparent cursor-pointer z-10 relative",
          isCorrect ? "text-green-800" : "text-black"
        )}
      />
    </div>
  );
};

// --- COMPONENT: CLUE LIST ---
const ClueList = ({ title, clues, direction, currentClueNum, onClueClick }) => {
  const listRef = useRef(null);

  useEffect(() => {
    // Prevent automatic scrolling jumping the whole page
    // We only scroll the list itself
    if (currentClueNum) {
      const activeEl = listRef.current?.querySelector(`[data-clue="${currentClueNum}"]`);
      if (activeEl) {
        // Use block: 'nearest' to avoid jumping the parent container
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentClueNum]);

  return (
    <div className="flex flex-col h-full overflow-hidden border-r border-gray-200 last:border-r-0">
      <h3 className="font-serif font-bold text-lg text-gray-900 p-3 border-b bg-gray-50 sticky top-0 z-10 shadow-sm flex items-center gap-2">
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
              "text-sm p-3 rounded-md cursor-pointer transition-all duration-200 border-l-4",
              parseInt(num) === currentClueNum && direction === title.toUpperCase()
                ? "bg-blue-50 border-blue-500 text-black shadow-sm"
                : "border-transparent hover:bg-gray-100 text-gray-700"
            )}
          >
            <div className="flex gap-2">
              <span className={cn("font-bold min-w-[1.5rem] text-right", parseInt(num) === currentClueNum && direction === title.toUpperCase() ? "text-blue-700" : "text-gray-900")}>{num}</span>
              <span className="leading-snug" dangerouslySetInnerHTML={{ __html: data.clue }} />
            </div>
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
  const [direction, setDirection] = useState('ACROSS');
  const [loading, setLoading] = useState(true);
  const [isChecked, setIsChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // Date State
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [timer, setTimer] = useState(0);

  // --- PERSISTENCE & TIMER ---

  // Load progress on puzzle change
  useEffect(() => {
    if (!puzzle) return;
    const key = `crossword_progress_${selectedDate}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Validate grid size matches
        if (parsed.gridState.length === puzzle.grid.length && parsed.gridState[0].length === puzzle.grid[0].length) {
          setGridState(parsed.gridState);
          setTimer(parsed.timer || 0);
          setIsCorrect(parsed.isCorrect || false);
          setIsChecked(parsed.isCorrect || false); // Show green if solved
          if (parsed.isCorrect) {
            // Maybe don't fire confetti on reload, just show solved state
          }
        }
      } catch (e) {
        console.error("Error loading progress", e);
      }
    } else {
      setTimer(0); // Reset timer for new puzzle if no save
    }
  }, [puzzle, selectedDate]);

  // Save progress
  useEffect(() => {
    if (!puzzle || loading) return;
    const key = `crossword_progress_${selectedDate}`;
    const data = {
      gridState,
      timer,
      isCorrect
    };
    localStorage.setItem(key, JSON.stringify(data));
  }, [gridState, timer, isCorrect, puzzle, selectedDate, loading]);

  // Timer Tick
  useEffect(() => {
    if (!puzzle || isCorrect || loading) return;
    const interval = setInterval(() => {
      setTimer(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [puzzle, isCorrect, loading]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    fetchPuzzle(selectedDate);
  }, [selectedDate]);

  const fetchPuzzle = async (dateStr) => {
    setLoading(true);
    setPuzzle(null); // Clear prev puzzle while loading
    try {
      // Use new endpoint with date param
      const url = dateStr
        ? `http://127.0.0.1:5000/api/crossword?date=${dateStr}`
        : 'http://127.0.0.1:5000/api/crossword';

      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        alert(`Error: ${data.error}`);
        // Don't setPuzzle if error, maybe show error state
        setLoading(false);
        return;
      }

      setPuzzle(data);

      // Initialize User Grid based on dynamic rows/cols
      const rows = data.grid.length;
      const cols = data.grid[0].length;
      const initialGrid = data.grid.map(row => row.map(() => ''));
      setGridState(initialGrid);

      // Generate Solution Grid
      const sol = generateSolutionGrid(data);
      setSolutionGrid(sol);

      // Reset state for new puzzle
      setIsChecked(false);
      setIsCorrect(false);

      // Focus
      let firstR = 0, firstC = 0;
      outer: for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (data.grid[r][c] === 1) {
            firstR = r; firstC = c;
            break outer;
          }
        }
      }
      setFocus({ r: firstR, c: firstC });
      setIsChecked(false);
      setIsCorrect(false);

      setLoading(false);
    } catch (err) {
      console.error("Error fetching puzzle:", err);
      alert("Failed to connect to server.");
      setLoading(false);
    }
  };

  // --- GAME LOGIC ---

  const handleKeyDown = (r, c, e) => {
    const key = e.key;
    const rows = puzzle.grid.length;
    const cols = puzzle.grid[0].length;

    if (key === 'Backspace') {
      const newGrid = [...gridState];
      if (newGrid[r][c] === '') {
        moveFocus(r, c, -1, rows, cols);
      } else {
        newGrid[r][c] = '';
        setGridState(newGrid);
      }
      return;
    }
    if (key.startsWith('Arrow')) {
      const dir = key.replace('Arrow', '').toUpperCase();
      moveArrow(r, c, dir, rows, cols);
      return;
    }
    // Toggle Direction on Space
    if (key === ' ') {
      e.preventDefault(); // Prevent scrolling
      setDirection(prev => prev === 'ACROSS' ? 'DOWN' : 'ACROSS');
      return;
    }
    // Tab Navigation
    if (key === 'Tab') {
      e.preventDefault();
      const currentClue = getCurrentClueNum();
      if (!currentClue) return;

      const dirKey = direction.toLowerCase();
      const clues = puzzle.clues[dirKey];
      const clueNums = Object.keys(clues).map(Number).sort((a, b) => a - b);
      let nextIndex = clueNums.indexOf(parseInt(currentClue)) + 1;

      let nextDir = direction;
      let nextNum = null;

      if (nextIndex < clueNums.length) {
        nextNum = clueNums[nextIndex];
      } else {
        // Switch direction
        nextDir = direction === 'ACROSS' ? 'DOWN' : 'ACROSS';
        const otherClues = puzzle.clues[nextDir.toLowerCase()];
        const otherNums = Object.keys(otherClues).map(Number).sort((a, b) => a - b);
        if (otherNums.length > 0) {
          nextNum = otherNums[0];
        } else {
          // Loop back to start of current direction (rare)
          nextNum = clueNums[0];
          nextDir = direction;
        }
      }

      if (nextNum) {
        setDirection(nextDir);
        // Find pos
        const posKey = Object.keys(puzzle.numbers).find(k => puzzle.numbers[k] == nextNum);
        if (posKey) {
          const [r, c] = posKey.split(',').map(Number);
          setFocus({ r, c });
        }
      }
      return;
    }
  };

  const handleCellChange = (r, c, value) => {
    const rows = puzzle.grid.length;
    const cols = puzzle.grid[0].length;

    // Type-over logic: take the last character entered
    const char = value.slice(-1).toUpperCase();
    if (!/^[A-Z0-9]?$/.test(char)) return;

    const newGrid = [...gridState];
    newGrid[r][c] = char;
    setGridState(newGrid);

    if (char) {
      moveFocus(r, c, 1, rows, cols);
    }

    // Auto-Check if grid is full
    let isFull = true;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (puzzle.grid[r][c] === 1 && !newGrid[r][c]) {
          isFull = false;
          break;
        }
      }
    }

    if (isFull) {
      // Check correctness without triggering visual errors unless requested? 
      // Actually, let's just check if it matches solution perfectly.
      let allCorrect = true;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (puzzle.grid[r][c] === 1) {
            if (newGrid[r][c] !== solutionGrid[r][c]) {
              allCorrect = false;
              break;
            }
          }
        }
      }

      if (allCorrect) {
        setIsCorrect(true);
        setIsChecked(true); // To show green state
        confetti({
          particleCount: 200,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#3b82f6', '#10b981', '#f59e0b']
        });
      } else {
        // Grid is full but incorrect -> Show errors immediately
        setIsChecked(true);
      }
    }
  };

  const moveArrow = (r, c, arrowDir, rows, cols) => {
    let nr = r, nc = c;
    if (arrowDir === 'LEFT') nc--;
    if (arrowDir === 'RIGHT') nc++;
    if (arrowDir === 'UP') nr--;
    if (arrowDir === 'DOWN') nr++;

    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && puzzle.grid[nr][nc] === 1) {
      setFocus({ r: nr, c: nc });
    }
  };

  const moveFocus = (r, c, step, rows, cols) => {
    let currR = r;
    let currC = c;
    let found = false;
    let loopCount = 0;

    while (!found && loopCount < (rows * cols * 2)) {
      loopCount++;
      if (direction === 'ACROSS') {
        currC += step;
        if (currC >= cols) { currC = 0; currR++; }
        if (currC < 0) { currC = cols - 1; currR--; }
      } else {
        currR += step;
        if (currR >= rows) { currR = 0; currC++; }
        if (currR < 0) { currR = rows - 1; currC--; }
      }

      if (currR < 0) { currR = rows - 1; currC = cols - 1; }
      if (currR >= rows) { currR = 0; currC = 0; }

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
    const posStr = Object.keys(puzzle.numbers).find(key => puzzle.numbers[key] == num);
    if (posStr) {
      const [r, c] = posStr.split(',').map(Number);
      setFocus({ r, c });
    }
  };

  const checkPuzzle = () => {
    setIsChecked(true);
    let allCorrect = true;
    const rows = puzzle.grid.length;
    const cols = puzzle.grid[0].length;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
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
      // Removed timeout so errors persist
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

  const getCurrentClueNum = () => {
    if (!puzzle) return null;
    let r = focus.r;
    let c = focus.c;
    while (r >= 0 && c >= 0 && r < puzzle.grid.length && c < puzzle.grid[0].length && puzzle.grid[r][c] === 1) {
      const key = `${r},${c}`;
      if (puzzle.numbers[key]) {
        const num = puzzle.numbers[key];
        const dirKey = direction.toLowerCase();
        if (puzzle.clues[dirKey][num]) return num;
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
      <p className="text-gray-500 font-serif animate-pulse">Fetching puzzle...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-sans text-gray-900">
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-serif font-bold tracking-tight text-gray-900 flex items-center gap-2">
              <span className="bg-black text-white p-1 rounded-sm text-lg">NYT</span>
              Daily
            </h1>
            <div className="flex items-center gap-2 bg-gray-100 rounded-md px-2 py-1 border border-gray-200">
              <Calendar size={16} className="text-gray-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent border-none outline-none text-sm font-medium text-gray-700 font-sans"
              />
            </div>
            {puzzle && <span className="text-xs font-bold px-2 py-1 bg-blue-100 text-blue-700 rounded-full hidden sm:block">
              {puzzle.grid.length}x{puzzle.grid[0].length}
            </span>}
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

        <div className="absolute top-full left-1/2 transform -translate-x-1/2 bg-white px-3 py-1 rounded-b-lg shadow-sm border border-t-0 border-gray-200 text-sm font-mono font-bold text-gray-600 z-40">
          {formatTime(timer)}
        </div>
      </header>

      {/* GAME BOARD AREA */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* LEFT: GRID (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">

          {/* CURRENT CLUE BAR */}
          <div className="bg-blue-600 text-white p-4 rounded-lg shadow-md min-h-[80px] flex flex-col justify-center items-center text-center transition-all">
            <div className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-1">
              {direction} &bull; {currentClueNum || "-"}
            </div>
            <div className="font-serif text-lg sm:text-2xl font-medium leading-tight max-w-2xl">
              {currentClueNum
                ? puzzle.clues[direction.toLowerCase()][currentClueNum]?.clue
                : "Select a cell to start"}
            </div>
          </div>

          {/* THE GRID */}
          <div className="w-full flex justify-center">
            <div className="bg-black p-1 shadow-2xl rounded-sm w-full max-w-[700px]">
              <div
                className="grid gap-[1px] bg-black border border-black"
                style={{
                  gridTemplateColumns: `repeat(${puzzle.grid[0].length}, 1fr)`,
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
                        (() => {
                          if (!currentClueNum) return false;
                          const clueData = puzzle.clues[direction.toLowerCase()][currentClueNum];
                          if (!clueData) return false;
                          const length = clueData.answer ? clueData.answer.length : 0;
                          const posKey = Object.keys(puzzle.numbers).find(k => puzzle.numbers[k] === currentClueNum);
                          if (!posKey) return false;
                          const [startR, startC] = posKey.split(',').map(Number);

                          if (direction === 'ACROSS') {
                            return r === startR && c >= startC && c < startC + length;
                          } else {
                            return c === startC && r >= startR && r < startR + length;
                          }
                        })()
                      }
                      isError={isChecked && !isCorrect && gridState[r][c] !== '' && gridState[r][c] !== solutionGrid[r][c]}
                      isCorrect={isCorrect}
                      onClick={handleCellClick}
                      onChange={handleCellChange}
                      onKeyDown={handleKeyDown}
                    />
                  ))
                ))}
              </div>
            </div>
          </div >

          <p className="text-center text-gray-400 text-sm mt-4 hidden sm:block">
            Use <kbd className="font-mono bg-gray-200 px-1 rounded">Arrow Keys</kbd> to move, <kbd className="font-mono bg-gray-200 px-1 rounded">Space</kbd> to toggle direction.
            <br />
            <span className="text-xs text-gray-300 mt-1 block">Try selecting Sunday dates (e.g., Feb 8, 2026) for large puzzles!</span>
          </p>
        </div>

        {/* RIGHT: CLUES (5 cols) */}
        <div className="lg:col-span-5 h-[500px] lg:h-[800px] bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
          <div className="bg-gray-50 border-b p-3 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">
            Clues
          </div>
          <div className="flex-1 flex flex-col sm:flex-row lg:flex-item overflow-hidden">
            <ClueList
              title="ACROSS"
              clues={puzzle.clues.across}
              direction={direction}
              currentClueNum={direction === 'ACROSS' ? currentClueNum : null}
              onClueClick={handleClueClick}
            />
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