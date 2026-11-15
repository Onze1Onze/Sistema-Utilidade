import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("a tela do jogador monta um botão independente para cada pino", () => {
  const lockPlayer = app.match(/function lockPlayer\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(lockPlayer, "lockPlayer precisa existir");
  assert.match(lockPlayer, /data-pin-index/);
  assert.match(lockPlayer, /lock-pin-track/);
  assert.match(lockPlayer, /lock-pin-target/);
  assert.match(lockPlayer, /lock-tumbler/);
  assert.match(lockPlayer, /TRAVADO/);
  assert.match(lockPlayer, /lock-pick-icons/);
});

test("a animação e o clique usam a mesma função de movimento por pino", () => {
  assert.match(app, /function startLockAnimation\(\)/);
  assert.match(app, /getLockPinMotion\(pin, elapsed\)/);
  assert.match(app, /function getCurrentLockPinMotion\(pinIndex\)/);
  assert.match(app, /kind:"lock-pin"/);
  assert.match(app, /position:Number\(motion\.position\.toFixed\(3\)\)/);
  assert.match(app, /rising:motion\.rising/);
});

test("a faixa visual de acerto é dimensionada pela precisão configurada", () => {
  assert.match(app, /const targetHeight = Math\.max\(2, \(1 - config\.hitThreshold\) \* 100\)/);
  assert.match(app, /style="height:/);
  assert.match(css, /\.lock-pin-target/);
});

test("a configuração do mestre publica velocidades individuais e sincroniza a faixa visual com o limiar de validação", () => {
  assert.match(app, /createLockPuzzle\(\{/);
  assert.match(app, /cycleMs:state\.lockCycleMs/);
  assert.match(app, /speedVariationMs:state\.lockSpeedVariation/);
  assert.match(app, /hitThreshold:puzzle\.hitThreshold/);
});
