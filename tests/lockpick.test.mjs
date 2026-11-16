import test from "node:test";
import assert from "node:assert/strict";
import { createLockPuzzle, getLockPinMotion, resolvePlayerAttempt, LOCK_PRESETS } from "../game-logic.js";

function seeded(seed) {
  let n=seed>>>0;
  return ()=>((n=(n*1664525+1013904223)>>>0)/4294967296);
}

test("a animação desacelera perto do topo e tem uma faixa de acerto mais legível", () => {
  const pin = { cycleDurationMs:1000, phaseOffsetMs:0 };
  const beforeTop = getLockPinMotion(pin, 375);
  const nearTop = getLockPinMotion(pin, 495);
  const atTop = getLockPinMotion(pin, 500);
  const afterTop = getLockPinMotion(pin, 625);
  assert.equal(beforeTop.rising,true);
  assert.ok(beforeTop.position > 0.85);
  assert.ok(nearTop.position > 0.99);
  assert.equal(atTop.rising,false);
  assert.equal(atTop.position,1);
  assert.equal(afterTop.rising,false);
  assert.ok(afterTop.position > 0.85);
});
test("a configuração de lockpick cria pinos com velocidades e fases individuais", () => {
  const puzzle = createLockPuzzle({
    pinCount:6,picks:4,lockPrecision:78,cycleMs:1000,speedVariationMs:700
  },seeded(77));
  assert.equal(puzzle.pinCount,6);
  assert.equal(puzzle.picks,4);
  assert.equal(puzzle.hitThreshold,0.78);
  assert.equal(puzzle.pins.length,6);
  assert.ok(puzzle.pins.every((pin)=>pin.cycleDurationMs>=1000&&pin.cycleDurationMs<=1700));
  assert.ok(puzzle.pins.every((pin)=>pin.phaseOffsetMs>=0&&pin.phaseOffsetMs<pin.cycleDurationMs));
});

test("clique fora da faixa, em qualquer sentido, consome uma gazua", () => {
  const session = { status:"active", sessionId:"lock-1", game:"lock" };
  const secret = {
    game:"lock",
    pins:[{cycleDurationMs:1000,phaseOffsetMs:0},{cycleDurationMs:1350,phaseOffsetMs:200},{cycleDurationMs:1650,phaseOffsetMs:600}],
    hitThreshold:0.78,
    picksLeft:2,
    lockedPins:[false,false,false],
    finished:false
  };
  const early = resolvePlayerAttempt(session,secret,{
    sessionId:"lock-1",game:"lock",kind:"lock-pin",pinIndex:0,position:0.68,rising:true
  });
  assert.equal(early.success,false);
  assert.equal(early.remaining,1);
  assert.equal(early.secret.picksLeft,1);
  assert.equal(early.lockedCount,0);
  assert.equal(early.finished,false);

  const descending = resolvePlayerAttempt(session,early.secret,{
    sessionId:"lock-1",game:"lock",kind:"lock-pin",pinIndex:1,position:0.74,rising:false
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
    hitThreshold:0.78,
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
    sessionId:"lock-2",game:"lock",kind:"lock-pin",pinIndex:2,position:0.91,rising:false
  });
  assert.equal(second.success,true);
  assert.equal(second.lockedCount,2);
  const third = resolvePlayerAttempt(session,second.secret,{
    sessionId:"lock-2",game:"lock",kind:"lock-pin",pinIndex:1,position:0.99,rising:false
  });
  assert.equal(third.success,true);
  assert.equal(third.finished,true);
  assert.match(third.responseText,/Fechadura destrancada/);
  assert.deepEqual(third.lockedPins,[true,true,true]);
});
test("um pino já travado não consome outra gazua", () => {
  const session = { status:"active", sessionId:"lock-3", game:"lock" };
  const secret = {
    game:"lock",pins:[{cycleDurationMs:1000,phaseOffsetMs:0},{cycleDurationMs:1000,phaseOffsetMs:0},{cycleDurationMs:1000,phaseOffsetMs:0}],
    hitThreshold:0.78,picksLeft:3,lockedPins:[true,false,false],finished:false
  };
  const result = resolvePlayerAttempt(session,secret,{
    sessionId:"lock-3",game:"lock",kind:"lock-pin",pinIndex:0,position:0.99,rising:true
  });
  assert.equal(result.success,false);
  assert.equal(result.remaining,3);
  assert.match(result.responseText,/já está travado/i);
});


test("os cinco presets escalam a dificuldade sem tornar o nível máximo impraticável", () => {
  assert.equal(LOCK_PRESETS[1].pinCount,3);
  assert.equal(LOCK_PRESETS[5].pinCount,7);
  assert.ok(LOCK_PRESETS[1].picks > LOCK_PRESETS[5].picks);
  assert.ok(LOCK_PRESETS[5].picks >= LOCK_PRESETS[5].pinCount + 2);
  assert.ok(LOCK_PRESETS[1].lockPrecision < LOCK_PRESETS[5].lockPrecision);
  assert.ok(LOCK_PRESETS[1].lockCycleMs > LOCK_PRESETS[5].lockCycleMs);
  assert.ok(LOCK_PRESETS[1].lockSpeedVariation < LOCK_PRESETS[5].lockSpeedVariation);
  assert.ok(LOCK_PRESETS[5].lockPrecision <= 80);
  assert.ok(LOCK_PRESETS[5].lockCycleMs >= 1300);
});
