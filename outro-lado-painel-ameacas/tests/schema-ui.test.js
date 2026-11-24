import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");

test("ficha renderiza actions.agredir junto dos ataques normais", () => {
  assert.ok(main.includes("c.actions?.agredir"));
  assert.ok(main.includes("data-source="));
  assert.ok(main.includes('control.dataset.source === "agredir"'));
});

test("ficha mostra DT, teste de resistência e damageDice das habilidades", () => {
  assert.ok(main.includes("ability.damageDice"));
  assert.ok(main.includes("ability.dt"));
  assert.ok(main.includes("ability.savingThrow"));
  assert.ok(main.includes("use-ability-damage"));
});

test("vida machucada fica destacada e cura acelerada não exige quantidade digitada", () => {
  assert.ok(main.includes("is-wounded"));
  assert.ok(main.includes('data-action="fast-heal"'));
  assert.ok(main.includes("getFastHealing(record)"));
  assert.ok(!main.includes('id="hp-amount"'));
});

test("resultados de dano oferecem tipos, Ignorar RD e aplicação direta de PV", () => {
  assert.ok(main.includes("DAMAGE_TYPES.map"));
  assert.ok(main.includes('id="roll-damage-type"'));
  assert.ok(main.includes('id="ignore-damage-rd"'));
  assert.ok(main.includes('data-action="apply-rolled-damage"'));
});
