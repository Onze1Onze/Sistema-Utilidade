export const META_KEY = "com.onze11.sistema-utilidade/session";
export const CHANNEL = "com.onze11.sistema-utilidade/v1";
export const SECRET_PREFIX = "com.onze11.sistema-utilidade/secret/";

export const LOCK_PRESETS = {
  1: { tolerance: 34, picks: 7 },
  2: { tolerance: 26, picks: 6 },
  3: { tolerance: 19, picks: 5 },
  4: { tolerance: 12, picks: 4 },
  5: { tolerance: 7, picks: 3 }
};

export const HACK_PRESETS = {
  1: { rows: 4, columns: 6, sequenceLength: 3 },
  2: { rows: 5, columns: 6, sequenceLength: 3 },
  3: { rows: 5, columns: 7, sequenceLength: 4 },
  4: { rows: 6, columns: 8, sequenceLength: 5 },
  5: { rows: 6, columns: 8, sequenceLength: 6 }
};

export function randomHex(random = Math.random) {
  return Math.floor(random() * 256).toString(16).padStart(2, "0").toUpperCase();
}

export function angularDistance(a, b) {
  const diff = Math.abs(((Number(a) - Number(b)) % 360 + 360) % 360);
  return Math.min(diff, 360 - diff);
}

export function validateLockAttempt(angle, targetAngle, tolerance) {
  return angularDistance(angle, targetAngle) <= tolerance;
}

export function makeHackPuzzle(config, random = Math.random) {
  const rows = clampInteger(config.rows, 4, 8, 6);
  const columns = clampInteger(config.columns, 4, 8, 8);
  const maxLength = Math.min(6, rows * columns, rows + columns - 1);
  const sequenceLength = clampInteger(config.sequenceLength, 3, maxLength, 4);
  const board = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => randomHex(random))
  );

  const path = makeAlternatingPath(rows, columns, sequenceLength, random);
  const target = Array.from({ length: sequenceLength }, () => randomHex(random));
  path.forEach(([row, column], index) => { board[row][column] = target[index]; });

  return { rows, columns, sequenceLength, board, target };
}

export function makeAlternatingPath(rows, columns, length, random = Math.random) {
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1) {
    throw new RangeError("Dimensões inválidas para o caminho.");
  }
  if (!Number.isInteger(length) || length < 1 || length > rows + columns - 1 || length > rows * columns) {
    throw new RangeError("Comprimento inválido para o caminho.");
  }

  const starts = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) starts.push([row, column]);
  }
  shuffle(starts, random);

  function search(path) {
    if (path.length === length) return path;
    const [currentRow, currentColumn] = path[path.length - 1];
    const nextIndex = path.length;
    const candidates = [];
    if (nextIndex % 2 === 1) {
      for (let row = 0; row < rows; row += 1) {
        if (row !== currentRow && !path.some(([usedRow, usedColumn]) => usedRow === row && usedColumn === currentColumn)) {
          candidates.push([row, currentColumn]);
        }
      }
    } else {
      for (let column = 0; column < columns; column += 1) {
        if (column !== currentColumn && !path.some(([usedRow, usedColumn]) => usedRow === currentRow && usedColumn === column)) {
          candidates.push([currentRow, column]);
        }
      }
    }
    shuffle(candidates, random);
    for (const candidate of candidates) {
      const result = search([...path, candidate]);
      if (result) return result;
    }
    return null;
  }

  for (const start of starts) {
    const result = search([start]);
    if (result) return result;
  }
  throw new Error("Não foi possível gerar um caminho válido para essa configuração.");
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

export function isValidHackPath(path, rows, columns) {
  if (!Array.isArray(path) || path.length === 0) return false;
  const seen = new Set();
  for (let index = 0; index < path.length; index += 1) {
    const cell = path[index];
    if (!Array.isArray(cell) || cell.length !== 2) return false;
    const [row, column] = cell;
    if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= rows || column < 0 || column >= columns) return false;
    const key = `${row}:${column}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (index === 0) continue;
    const previous = path[index - 1];
    const sameColumn = column === previous[1];
    const sameRow = row === previous[0];
    const mustShareColumn = index % 2 === 1;
    if (mustShareColumn ? !sameColumn || sameRow : !sameRow || sameColumn) return false;
  }
  return true;
}

export function validateHackAttempt(path, puzzle) {
  if (!puzzle || !Array.isArray(puzzle.board) || !Array.isArray(puzzle.target)) return false;
  if (path.length !== puzzle.sequenceLength || !isValidHackPath(path, puzzle.rows, puzzle.columns)) return false;
  const values = path.map(([row, column]) => puzzle.board[row][column]);
  return values.every((value, index) => value === puzzle.target[index]);
}

export function normalizePin(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 8);
}

export function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function createSessionId(random = Math.random) {
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256).toString(16).padStart(2, "0"));
  return bytes.join("");
}
