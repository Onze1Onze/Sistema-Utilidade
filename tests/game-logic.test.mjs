import test from "node:test";
import assert from "node:assert/strict";
import {
  angularDistance, validateLockAttempt, makeHackPuzzle,
  isValidHackPath, validateHackAttempt, normalizePin, clampInteger
} from "../game-logic.js";

function seeded(seed) {
  let n = seed >>> 0;
  return () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function solve(puzzle) {
  const used = new Set();
  function walk(path) {
    const index = path.length;
    if (index === puzzle.sequenceLength) {
      const values = path.map(([r,c]) => puzzle.board[r][c]);
      return values.every((v,i) => v === puzzle.target[i]) ? path : null;
    }
    const candidates = [];
    if (!index) {
      for (let r=0;r<puzzle.rows;r++) for(let c=0;c<puzzle.columns;c++) candidates.push([r,c]);
    } else {
      const [pr,pc] = path[index-1];
      if (index % 2) for(let r=0;r<puzzle.rows;r++) if(r!==pr) candidates.push([r,pc]);
      else for(let c=0;c<puzzle.columns;c++) if(c!==pc) candidates.push([pr,c]);
    }
    for (const cell of candidates) {
      const key=cell.join(":");
      if(used.has(key) || puzzle.board[cell[0]][cell[1]]!==puzzle.target[index]) continue;
      used.add(key);
      const found=walk([...path,cell]);
      if(found) return found;
      used.delete(key);
    }
    return null;
  }
  return walk([]);
}

test("a fechadura considera a proximidade circular do ângulo", () => {
  assert.equal(angularDistance(359,1),2);
  assert.equal(validateLockAttempt(359,1,2),true);
  assert.equal(validateLockAttempt(359,1,1),false);
});
test("250 matrizes de hacking geram caminhos alternados e solucionáveis", () => {
  for(let seed=1;seed<=250;seed++){
    const puzzle=makeHackPuzzle({rows:6,columns:8,sequenceLength:6},seeded(seed));
    const path=solve(puzzle);
    assert.ok(path,"matriz sem solução para a semente "+seed);
    assert.equal(isValidHackPath(path,puzzle.rows,puzzle.columns),true);
    assert.equal(validateHackAttempt(path,puzzle),true);
  }
});
test("rejeita caminhos repetidos, diagonais ou em sequência incorreta", () => {
  assert.equal(isValidHackPath([[0,0],[2,0],[2,3],[4,3]],6,8),true);
  assert.equal(isValidHackPath([[0,0],[0,1]],6,8),false);
  assert.equal(isValidHackPath([[0,0],[2,0],[2,0]],6,8),false);
});
test("normaliza o PIN e limita valores numéricos", () => {
  assert.equal(normalizePin("12a-3456789"),"12345678");
  assert.equal(clampInteger("99",1,8,4),8);
  assert.equal(clampInteger("inválido",1,8,4),4);
});
