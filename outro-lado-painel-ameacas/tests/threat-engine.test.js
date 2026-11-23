import test from "node:test";
import assert from "node:assert/strict";
import {
  createThreatTemplate, parseDiceExpression, rollDiceExpression, validateThreatPayload,
  normalizeThreatPayload, computeEffectiveStats, addCondition, removeCondition,
  changeHitPoints, changeResource, exportThreatRecord, adjustDiceCount, pushRollHistory
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

test("validação aceita apenas senseUse observe ou hear em testes de perícia", () => {
  const data = createThreatTemplate();
  data.creature.skillTests[0].senseUse = "smell";
  const errors = validateThreatPayload(data);
  assert.ok(errors.some((entry) => entry.path === "creature.skillTests[0].senseUse"));
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


test("categorias de habilidades, poderes, ações e reações são preservadas no ciclo JSON", () => {
  const payload = createThreatTemplate();
  payload.creature.abilities = [{ name: "Marca", roll: "1d20+4" }];
  payload.creature.powers = [{ name: "Vínculo" }];
  payload.creature.actions = [{ name: "Investida" }];
  payload.creature.specialActions = [{ name: "Ruptura" }];
  payload.creature.reactions = [{ name: "Contra-ataque" }];
  const record = normalizeThreatPayload(payload);
  const exported = exportThreatRecord(record);
  assert.equal(exported.creature.abilities[0].name, "Marca");
  assert.equal(exported.creature.powers[0].name, "Vínculo");
  assert.equal(exported.creature.actions[0].name, "Investida");
  assert.equal(exported.creature.specialActions[0].name, "Ruptura");
  assert.equal(exported.creature.reactions[0].name, "Contra-ataque");
});


test("skillTests e histórico de rolagens sobrevivem à exportação e reimportação", () => {
  const record = makeRecord();
  record.creature.skillTests = [{ id: "athletics", name: "Atletismo", attribute: "for", test: "2d20+9", damage: "2d6+3" }];
  pushRollHistory(record, "Atletismo", { kind: "skill", roll: rollDiceExpression("2d20+9", () => 0.4) });
  const exported = exportThreatRecord(record);
  const imported = normalizeThreatPayload(exported, { id: "roundtrip-roll" });
  assert.equal(imported.creature.skillTests[0].test, "2d20+9");
  assert.equal(imported.creature.skillTests[0].damage, "2d6+3");
  assert.equal(imported.runtime.rollHistory[0].title, "Atletismo");
  assert.equal(imported.runtime.rollHistory[0].total, record.runtime.rollHistory[0].total);
});
