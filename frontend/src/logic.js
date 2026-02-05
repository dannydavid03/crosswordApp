export const getNextCell = (grid, r, c, direction) => {
  let nextR = r;
  let nextC = c;
  let attempts = 0;

  // Try to find the next white square
  while (attempts < 30) { // Safety break
    if (direction === 'ACROSS') {
      nextC++;
      if (nextC >= 15) { // Wrap to next row
        nextC = 0;
        nextR++;
      }
    } else {
      nextR++;
      if (nextR >= 15) { // Wrap to next col
        nextR = 0;
        nextC++;
      }
    }

    // Check bounds
    if (nextR >= 15 || nextR < 0 || nextC >= 15 || nextC < 0) return { r, c }; // Stay put if end of board

    // If it's a white square (1), we found our spot
    if (grid[nextR][nextC] === 1) {
      return { r: nextR, c: nextC };
    }
    attempts++;
  }
  return { r, c };
};