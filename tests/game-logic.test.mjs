import test from "node:test";
import assert from "node:assert/strict";
import {
  angularDistance, validateLockAttempt, makeHackPuzzle,
  isValidHackPath, validateHackAttempt, normalizePin, clampInteger,
  resolvePlayerAttempt
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
    if (index === 0) {
      for (let r=0;r<puzzle.rows;r++) for(let c=0;c<puzzle.columns;c++) candidates.push([r,c]);
    } else {
      const [pr,pc] = path[index-1];
      if (index % 2 === 1) {
        for(let r=0;r<puzzle.rows;r++) if(r!==pr) candidates.push([r,pc]);
      } else {
        for(let c=0;c<puzzle.columns;c++) if(c!==pc) candidates.push([pr,c]);
      }
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

test("tentativa de fechadura é validada e consome ferramentas", () => {
  const session = { status:"active", sessionId:"lock-1", game:"lock" };
  const secret = { game:"lock", targetAngle:90, tolerance:5, picksLeft:2, finished:false };
  const miss = resolvePlayerAttempt(session, secret, { type:"attempt", sessionId:"lock-1", game:"lock", kind:"lock", angle:120 });
  assert.equal(miss.success,false);
  assert.equal(miss.remaining,1);
  assert.equal(miss.secret.picksLeft,1);
  assert.equal(miss.finished,false);
  const hit = resolvePlayerAttempt(session, secret, { type:"attempt", sessionId:"lock-1", game:"lock", kind:"lock", angle:92 });
  assert.equal(hit.success,true);
  assert.equal(hit.finished,true);
  assert.equal(secret.picksLeft,2,"a validação não deve mutar o segredo original");
});
test("tentativa de hacking valida a rota completa", () => {
  const board = Array.from({length:4},()=>Array(4).fill("00"));
  board[0][0]="A0"; board[1][0]="B1"; board[1][1]="C2";
  const puzzle = { rows:4, columns:4, sequenceLength:3, board, target:["A0","B1","C2"] };
  const session = { status:"active", sessionId:"hack-1", game:"hack" };
  const secret = { game:"hack", puzzle, finished:false };
  const result = resolvePlayerAttempt(session, secret, { sessionId:"hack-1", game:"hack", kind:"hack", path:[[0,0],[1,0],[1,1]] });
  assert.equal(result.success,true);
  assert.equal(result.finished,true);
  const invalid = resolvePlayerAttempt(session, secret, { sessionId:"hack-1", game:"hack", kind:"hack", path:[[0,0],[1,0],[1,2]] });
  assert.equal(invalid.success,false);
  assert.equal(invalid.finished,false);
});
test("painel numérico distingue senha errada, comprimento e sucesso", () => {
  const session = { status:"active", sessionId:"pin-1", game:"pin" };
  const secret = { game:"pin", code:"4826", finished:false };
  const wrongLength = resolvePlayerAttempt(session, secret, { sessionId:"pin-1", game:"pin", kind:"pin", code:"48" });
  assert.equal(wrongLength.responseText,"O código precisa ter 4 dígitos.");
  assert.equal(wrongLength.finished,false);
  const wrong = resolvePlayerAttempt(session, secret, { sessionId:"pin-1", game:"pin", kind:"pin", code:"1111" });
  assert.equal(wrong.success,false);
  assert.equal(wrong.finished,false);
  const correct = resolvePlayerAttempt(session, secret, { sessionId:"pin-1", game:"pin", kind:"pin", code:"24-68" });
  assert.equal(correct.success,true);
  assert.equal(correct.finished,true);
});
test("protocolo rejeita mensagens de outra sessão, jogo ou formato", () => {
  const session = { status:"active", sessionId:"pin-2", game:"pin" };
  const secret = { game:"pin", code:"1234", finished:false };
  assert.equal(resolvePlayerAttempt(session, secret, { sessionId:"other", game:"pin", kind:"pin", code:"1234" }),null);
  assert.equal(resolvePlayerAttempt(session, secret, { sessionId:"pin-2", game:"lock", kind:"pin", code:"1234" }),null);
  assert.equal(resolvePlayerAttempt(session, secret, { sessionId:"pin-2", game:"pin", kind:"unknown" }),null);
});
