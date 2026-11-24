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

test("rolagens de dano da ameaça não descontam PV dela mesma", () => {
  const rollStart = main.indexOf('if (modal.type === "roll") {');
  const rollEnd = main.indexOf('  return "";', rollStart);
  const rollPanel = main.slice(rollStart, rollEnd);
  assert.ok(rollStart >= 0);
  assert.doesNotMatch(rollPanel, /apply-rolled-damage|roll-damage-apply|applyTypedDamage/);
  assert.ok(rollPanel.includes("Dano causado ao alvo"));
});

test("dano recebido pela ameaça tem uma ação independente com tipos e valores predefinidos", () => {
  assert.ok(main.includes('data-action="receive-damage"'));
  assert.ok(main.includes('data-action="select-incoming-damage-type"'));
  assert.ok(main.includes('data-action="apply-incoming-damage"'));
  assert.ok(main.includes('data-action="toggle-incoming-ignore-rd"'));
  assert.ok(main.includes("DAMAGE_TYPES.map"));
  assert.ok(main.includes("const presets = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50]"));
  assert.ok(!main.includes('id="hp-amount"'));
});

test("cura manual da ameaça tem botão independente e apenas valores predefinidos", () => {
  assert.ok(main.includes('data-action="open-heal"'));
  assert.ok(main.includes('data-action="apply-healing"'));
  assert.ok(main.includes('data-action="heal-to-full"'));
  assert.ok(main.includes('const presets = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50]'));
  assert.ok(main.includes('changeHitPoints(record, amount, "heal")'));
  assert.ok(main.includes('changeHitPoints(record, missing, "heal")'));
  assert.ok(!main.includes('id="hp-amount"'));
});

test("a janela de cura não aparece nem interfere no resultado de dano que a ameaça rola", () => {
  const rollStart = main.indexOf('if (modal.type === "roll") {');
  const rollEnd = main.indexOf('  return "";', rollStart);
  const rollPanel = main.slice(rollStart, rollEnd);
  assert.doesNotMatch(rollPanel, /open-heal|apply-healing|heal-to-full/);
  assert.ok(main.includes('if (action === "open-heal" && record)'));
});
