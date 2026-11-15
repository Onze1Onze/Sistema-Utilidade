import test from "node:test";
import assert from "node:assert/strict";
import {
  angularDistance, validateLockAttempt, makeHackPuzzle,
  isValidHackPath, validateHackAttempt, normalizePin, clampInteger,
  resolvePlayerAttempt, createLockPuzzle, getLockPinMotion
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

test("os pinos sobem e descem e a janela superior só vale na subida", () => {
  const pin = { cycleDurationMs:1000, phaseOffsetMs:0 };
  const rising = getLockPinMotion(pin, 225);
  const nearTop = getLockPinMotion(pin, 495);
  const atTopDescending = getLockPinMotion(pin, 500);
  const falling = getLockPinMotion(pin, 750);
  assert.equal(rising.rising,true);
  assert.equal(rising.position,0.45);
  assert.equal(nearTop.rising,true);
  assert.ok(nearTop.position >= 0.98);
  assert.equal(atTopDescending.rising,false);
  assert.equal(atTopDescending.position,1);
  assert.equal(falling.rising,false);
  assert.equal(falling.position,0.5);
});
test("a configuração de lockpick cria pinos com velocidades e fases individuais", () => {
  const puzzle = createLockPuzzle({
    pinCount:6,picks:4,lockPrecision:94,cycleMs:900,speedVariationMs:900
  },seeded(77));
  assert.equal(puzzle.pinCount,6);
  assert.equal(puzzle.picks,4);
  assert.equal(puzzle.hitThreshold,0.94);
  assert.equal(puzzle.pins.length,6);
  assert.ok(puzzle.pins.every((pin)=>pin.cycleDurationMs>=900&&pin.cycleDurationMs<=1800));
  assert.ok(puzzle.pins.every((pin)=>pin.phaseOffsetMs>=0&&pin.phaseOffsetMs<pin.cycleDurationMs));
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

test("clique fora da janela ou durante a descida quebra uma gazua", () => {
  const session = { status:"active", sessionId:"lock-1", game:"lock" };
  const secret = {
    game:"lock",
    pins:[{cycleDurationMs:1000,phaseOffsetMs:0},{cycleDurationMs:1350,phaseOffsetMs:200},{cycleDurationMs:1650,phaseOffsetMs:600}],
    hitThreshold:0.9,
    picksLeft:2,
    lockedPins:[false,false,false],
    finished:false
  };
  const early = resolvePlayerAttempt(session,secret,{
    sessionId:"lock-1",game:"lock",kind:"lock-pin",pinIndex:0,position:0.78,rising:true
  });
  assert.equal(early.success,false);
  assert.equal(early.remaining,1);
  assert.equal(early.secret.picksLeft,1);
  assert.equal(early.lockedCount,0);
  assert.equal(early.finished,false);

  const descending = resolvePlayerAttempt(session,early.secret,{
    sessionId:"lock-1",game:"lock",kind:"lock-pin",pinIndex:1,position:0.99,rising:false
  });
  assert.equal(descending.success,false);
  assert.equal(descending.remaining,0);
  assert.equal(descending.finished,true);
  assert.match(descending.responseText,/gazua quebrou/i);
  assert.equal(secret.picksLeft,2,"a validação não deve mutar o segredo original");
});
test("acertos travam cada pino e só destrancam quando todos estão posicionados", () => {
  const session = { status:"active", sessionId:"lock-2", game:"lock" };
  const secret = {
    game:"lock",
    pins:[{cycleDurationMs:1000,phaseOffsetMs:0},{cycleDurationMs:1200,phaseOffsetMs:250},{cycleDurationMs:1500,phaseOffsetMs:600}],
    hitThreshold:0.88,
    picksLeft:4,
    lockedPins:[false,false,false],
    finished:false
  };
  const first = resolvePlayerAttempt(session,secret,{
    sessionId:"lock-2",game:"lock",kind:"lock-pin",pinIndex:0,position:0.94,rising:true
  });
  assert.equal(first.success,true);
  assert.equal(first.lockedCount,1);
  assert.equal(first.finished,false);
  assert.deepEqual(first.lockedPins,[true,false,false]);
  const second = resolvePlayerAttempt(session,first.secret,{
    sessionId:"lock-2",game:"lock",kind:"lock-pin",pinIndex:2,position:0.91,rising:true
  });
  assert.equal(second.success,true);
  assert.equal(second.lockedCount,2);
  const third = resolvePlayerAttempt(session,second.secret,{
    sessionId:"lock-2",game:"lock",kind:"lock-pin",pinIndex:1,position:0.99,rising:true
  });
  assert.equal(third.success,true);
  assert.equal(third.finished,true);
  assert.match(third.responseText,/Fechadura destrancada/);
  assert.deepEqual(third.lockedPins,[true,true,true]);
});
test("um pino já travado não consome outra gazua", () => {
  const session = { status:"active", sessionId:"lock-3", game:"lock" };
  const secret = {
    game:"lock",pins:[{cycleDurationMs:1000,phaseOffsetMs:0},{cycleDurationMs:1000,phaseOffsetMs:0}],
    hitThreshold:0.9,picksLeft:3,lockedPins:[true,false],finished:false
  };
  const result = resolvePlayerAttempt(session,secret,{
    sessionId:"lock-3",game:"lock",kind:"lock-pin",pinIndex:0,position:0.99,rising:true
  });
  assert.equal(result.success,false);
  assert.equal(result.remaining,3);
  assert.match(result.responseText,/já está travado/i);
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
  const correct = resolvePlayerAttempt(session, secret, { sessionId:"pin-1", game:"pin", kind:"pin", code:"48-26" });
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
