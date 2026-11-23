import test from "node:test";
import assert from "node:assert/strict";
import {
  createThreatTemplate, parseDiceExpression, rollDiceExpression, validateThreatPayload,
  normalizeThreatPayload, computeEffectiveStats, addCondition, removeCondition,
  changeHitPoints, changeResource, exportThreatRecord, adjustDiceCount
} from "../src/threat-engine.js";

const makeRecord = () => normalizeThreatPayload(createThreatTemplate(), { id: "test-threat" });

test("parser aceita expressões compostas", () => {
  assert.deepEqual(parseDiceExpression("2d20+10-1d4"), [
    { type: "dice", count: 2, sides: 20, sign: 1 },
    { type: "constant", value: 10, sign: 1 },
    { type: "dice", count: 1, sides: 4, sign: -1 }
  ]);
});

test("rolagem calcula dados e modificadores", () => {
  const result = rollDiceExpression("2d6+3", () => 0.5);
  assert.deepEqual(result.parts[0].rolls, [4, 4]);
  assert.equal(result.total, 11);
});

test("validação aponta caminho e expressão incorreta", () => {
  const data = createThreatTemplate();
  data.creature.attacks[0].test = "2d20+";
  const errors = validateThreatPayload(data);
  assert.ok(errors.some((entry) => entry.path === "creature.attacks[0].test"));
});

test("condições alteram valores derivados e removê-las restaura a base", () => {
  let record = makeRecord();
  record.creature.defense = 25;
  record = addCondition(record, { name: "Penalidade de teste", modifiers: { defense: -4, diceCount: { attack: -1 } } });
  assert.equal(computeEffectiveStats(record).defense.value, 21);
  assert.equal(computeEffectiveStats(record).defense.base, 25);
  assert.match(adjustDiceCount("2d20+5", -1), /1d20\+5/);
  record = removeCondition(record, record.runtime.conditions[0].id);
  assert.equal(computeEffectiveStats(record).defense.value, 25);
});

test("vida e recursos são limitados aos intervalos válidos", () => {
  let record = makeRecord();
  record.creature.hp.max = 120;
  record.runtime.hpCurrent = 120;
  record = changeHitPoints(record, 33, "damage");
  assert.equal(record.runtime.hpCurrent, 87);
  record = changeHitPoints(record, 999, "heal");
  assert.equal(record.runtime.hpCurrent, 120);
  record.creature.resources = [{ id: "charge", name: "Carga", max: 3, current: 2 }];
  record.runtime.resources = { charge: 2 };
  record = changeResource(record, "charge", 8);
  assert.equal(record.runtime.resources.charge, 3);
});

test("exportação conserva dados da criatura e estado atual", () => {
  const record = makeRecord();
  const exported = exportThreatRecord(record);
  const imported = normalizeThreatPayload(exported, { id: "roundtrip" });
  assert.equal(imported.creature.name, record.creature.name);
  assert.equal(imported.runtime.hpCurrent, record.runtime.hpCurrent);
});
