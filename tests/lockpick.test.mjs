import test from "node:test";
import assert from "node:assert/strict";
import { createLockPuzzle, getLockPinMotion, resolvePlayerAttempt } from "../game-logic.js";

function seeded(seed) {
  let n=seed>>>0;
  return ()=>((n=(n*1664525+1013904223)>>>0)/4294967296);
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

test("clique fora da janela ou durante a descida quebra uma gazua", () => {
  const session = { status:"active", sessionId:"lock-1", game:"lock" };
  const secret = {
    game:"lock",
    pins:[{cycleDurationMs:1000,phaseOffsetMs:0},{cycleDurationMs:1350,phaseOffsetMs:200}],
    hitThreshold:0.9,
    picksLeft:2,
    lockedPins:[false,false],
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

