export const META_KEY = "com.onze11.sistema-utilidade/session";
export const CHANNEL = "com.onze11.sistema-utilidade/v1";
export const SECRET_PREFIX = "com.onze11.sistema-utilidade/secret/";

export const LOCK_PRESETS = {
  1: { pinCount: 3, picks: 9, lockPrecision: 76, lockCycleMs: 1850, lockSpeedVariation: 300 },
  2: { pinCount: 4, picks: 8, lockPrecision: 82, lockCycleMs: 1600, lockSpeedVariation: 450 },
  3: { pinCount: 5, picks: 7, lockPrecision: 88, lockCycleMs: 1350, lockSpeedVariation: 650 },
  4: { pinCount: 6, picks: 6, lockPrecision: 93, lockCycleMs: 1100, lockSpeedVariation: 800 },
  5: { pinCount: 7, picks: 5, lockPrecision: 97, lockCycleMs: 850, lockSpeedVariation: 1000 }
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

export function createLockPuzzle(config = {}, random = Math.random) {
  const pinCount = clampInteger(config.pinCount, 3, 8, 5);
  const picks = clampInteger(config.picks, 1, 15, 7);
  const lockPrecision = clampInteger(config.lockPrecision, 70, 98, 88);
  const cycleMs = clampInteger(config.cycleMs, 650, 2200, 1350);
  const speedVariationMs = clampInteger(config.speedVariationMs, 0, 1200, 650);
  const pins = Array.from({ length: pinCount }, (_, index) => {
    const cycleDurationMs = clampInteger(
      cycleMs + Math.floor(random() * (speedVariationMs + 1)),
      650,
      3400,
      cycleMs
    );
    return {
      id: index + 1,
      cycleDurationMs,
      phaseOffsetMs: Math.floor(random() * cycleDurationMs)
    };
  });
  return {
    pinCount,
    picks,
    lockPrecision,
    hitThreshold: lockPrecision / 100,
    pins
  };
}

export function getLockPinMotion(pin, elapsedMs) {
  const cycleDurationMs = clampInteger(pin?.cycleDurationMs, 650, 3400, 1350);
  const phaseOffsetMs = Number.isFinite(pin?.phaseOffsetMs) ? pin.phaseOffsetMs : 0;
  const elapsed = Number.isFinite(elapsedMs) ? elapsedMs : 0;
  const cyclePosition = ((elapsed + phaseOffsetMs) % cycleDurationMs + cycleDurationMs) % cycleDurationMs;
  const phase = cyclePosition / cycleDurationMs;
  const rising = phase < 0.5;
  const position = rising ? phase * 2 : (1 - phase) * 2;
  return {
    position: Math.max(0, Math.min(1, position)),
    rising,
    phase
  };
}

export function resolvePlayerAttempt(session, secret, message) {
  if (!session || session.status !== "active" || !message
    || session.sessionId !== message.sessionId
    || session.game !== message.game
    || !secret || secret.game !== session.game) return null;

  const nextSecret = { ...secret };
  if (nextSecret.finished) {
    return {
      success: false,
      responseText: "Este desafio já foi concluído ou esgotado.",
      remaining: Number.isInteger(nextSecret.picksLeft) ? nextSecret.picksLeft : null,
      finished: true,
      secret: nextSecret
    };
  }

  let success = false;
  let responseText = "";
  let remaining = null;

  let lockedPins = null;
  let lockedCount = null;

  if (session.game === "lock" && message.kind === "lock-pin") {
    if (!Array.isArray(nextSecret.pins) || nextSecret.pins.length < 3 || nextSecret.pins.length > 8
      || !Number.isInteger(nextSecret.picksLeft) || nextSecret.picksLeft < 1
      || !Number.isFinite(nextSecret.hitThreshold) || nextSecret.hitThreshold < 0.70 || nextSecret.hitThreshold > 0.98
      || !Number.isInteger(message.pinIndex) || message.pinIndex < 0 || message.pinIndex >= nextSecret.pins.length
      || !Number.isFinite(message.position) || message.position < 0 || message.position > 1
      || typeof message.rising !== "boolean") return null;

    if (!Array.isArray(nextSecret.lockedPins) || nextSecret.lockedPins.length !== nextSecret.pins.length) {
      nextSecret.lockedPins = Array.from({ length: nextSecret.pins.length }, () => false);
    }
    if (nextSecret.lockedPins[message.pinIndex]) {
      return {
        success: false,
        responseText: "Este pino já está travado.",
        remaining: nextSecret.picksLeft,
        finished: false,
        lockedPins: [...nextSecret.lockedPins],
        lockedCount: nextSecret.lockedPins.filter(Boolean).length,
        secret: nextSecret
      };
    }

    success = message.rising && message.position >= nextSecret.hitThreshold;
    if (success) {
      nextSecret.lockedPins[message.pinIndex] = true;
      lockedCount = nextSecret.lockedPins.filter(Boolean).length;
      lockedPins = [...nextSecret.lockedPins];
      remaining = nextSecret.picksLeft;
      nextSecret.finished = lockedCount === nextSecret.pins.length;
      responseText = nextSecret.finished
        ? "Todos os pinos travados. Fechadura destrancada!"
        : "Pino " + (message.pinIndex + 1) + " travado. " + lockedCount + "/" + nextSecret.pins.length + " posicionados.";
    } else {
      nextSecret.picksLeft = Math.max(0, nextSecret.picksLeft - 1);
      remaining = nextSecret.picksLeft;
      lockedPins = [...(nextSecret.lockedPins || [])];
      lockedCount = nextSecret.lockedPins.filter(Boolean).length;
      responseText = remaining > 0
        ? "Você perdeu o tempo. A gazua sofreu dano. Tente novamente."
        : "A gazua quebrou. A fechadura permanece trancada.";
      if (remaining === 0) nextSecret.finished = true;
    }
  } else if (session.game === "hack" && message.kind === "hack") {
    const puzzle = nextSecret.puzzle;
    if (!Array.isArray(message.path)
      || !message.path.every((cell) => Array.isArray(cell) && cell.length === 2 && cell.every(Number.isInteger))
      || !puzzle || !Array.isArray(puzzle.board) || !Array.isArray(puzzle.target)) return null;
    success = validateHackAttempt(message.path, puzzle);
    responseText = success ? "Acesso concedido." : "Sequência rejeitada. Tente novamente.";
    if (success) nextSecret.finished = true;
  } else if (session.game === "pin" && message.kind === "pin") {
    if (typeof nextSecret.code !== "string" || nextSecret.code.length < 3 || nextSecret.code.length > 8) return null;
    const candidate = normalizePin(message.code);
    if (!candidate || candidate.length !== nextSecret.code.length) {
      return {
        success: false,
        responseText: "O código precisa ter " + nextSecret.code.length + " dígitos.",
        remaining: null,
        finished: false,
        secret: nextSecret
      };
    }
    success = candidate === nextSecret.code;
    responseText = success ? "Código correto. Acesso liberado." : "Código incorreto.";
    if (success) nextSecret.finished = true;
  } else {
    return null;
  }

  return {
    success,
    responseText,
    remaining,
    finished: Boolean(nextSecret.finished),
    lockedPins: lockedPins ?? (Array.isArray(nextSecret.lockedPins) ? [...nextSecret.lockedPins] : null),
    lockedCount: lockedCount ?? (Array.isArray(nextSecret.lockedPins) ? nextSecret.lockedPins.filter(Boolean).length : null),
    secret: nextSecret
  };
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
