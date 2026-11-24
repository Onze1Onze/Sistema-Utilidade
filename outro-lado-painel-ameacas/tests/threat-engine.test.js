import test from "node:test";
import assert from "node:assert/strict";
import {
  createThreatTemplate, parseDiceExpression, rollDiceExpression, validateThreatPayload,
  normalizeThreatPayload, computeEffectiveStats, addCondition, removeCondition,
  changeHitPoints, changeResource, exportThreatRecord, adjustDiceCount, pushRollHistory,
  calculateTypedDamage, applyTypedDamage, getFastHealing
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
  data.creature.skillTests = [{ name: "Percepção", attribute: "pre", test: "1d20+0", damage: "", senseUse: "smell" }];
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
  assert.equal(exported.creature.actions.other[0].name, "Investida");
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

test("modelo JSON usa a nova estrutura de abilities e actions", () => {
  const template = createThreatTemplate();
  assert.deepEqual(Object.keys(template.creature.actions), ["agredir", "other"]);
  assert.deepEqual(template.creature.abilities[0], {
    name: "", description: "", damageDice: "", dt: null, savingThrow: ""
  });
  assert.equal(template.creature.attacks[0].critical, "19/x2");
  assert.deepEqual(template.creature.actions.agredir[0], {
    name: "", test: "1d20+0", damage: "", criticalMargin: 19,
    criticalMultiplier: "x2", range: "Corpo a corpo", effects: "", description: ""
  });
  assert.deepEqual(Object.keys(template.state), ["hpCurrent", "conditions", "resources", "history"]);
  assert.equal("skillTests" in template.creature, false);
});

test("validação aceita abilities com damageDice, DT e savingThrow", () => {
  const payload = createThreatTemplate();
  payload.creature.abilities[0] = {
    name: "Grito", description: "Ataque mental", damageDice: "3d8+4",
    dt: 25, savingThrow: "Vontade"
  };
  assert.deepEqual(validateThreatPayload(payload), []);
});

test("validação acusa a expressão inválida em actions.agredir e abilities.damageDice", () => {
  const payload = createThreatTemplate();
  payload.creature.actions.agredir[0].test = "2d20+";
  payload.creature.abilities[0].damageDice = "3d8+";
  const errors = validateThreatPayload(payload);
  assert.ok(errors.some((item) => item.path === "creature.actions.agredir[0].test"));
  assert.ok(errors.some((item) => item.path === "creature.abilities[0].damageDice"));
});

test("normalização preserva ações por categoria e gera IDs para cada entrada", () => {
  const payload = createThreatTemplate();
  payload.creature.abilities[0] = { name: "Mordida", description: "Morde", damageDice: "2d8", dt: 18, savingThrow: "Reflexos" };
  payload.creature.actions.agredir[0].name = "Garras";
  payload.creature.actions.other = [{ name: "Rugido", description: "Assusta" }];
  const record = normalizeThreatPayload(payload);
  assert.equal(record.creature.abilities[0].damageDice, "2d8");
  assert.equal(record.creature.actions.agredir[0].name, "Garras");
  assert.equal(record.creature.actions.other[0].name, "Rugido");
  assert.ok(record.creature.abilities[0].id);
  assert.ok(record.creature.actions.agredir[0].id);
  assert.ok(record.creature.actions.other[0].id);
});

test("ações legadas em array migram para actions.other sem perder entradas", () => {
  const payload = createThreatTemplate();
  payload.creature.actions = [{ name: "Investida", description: "Avança" }];
  const record = normalizeThreatPayload(payload);
  assert.deepEqual(record.creature.actions.agredir, []);
  assert.equal(record.creature.actions.other[0].name, "Investida");
});

test("ciclo de exportação preserva nova estrutura de ações e habilidades", () => {
  const payload = createThreatTemplate();
  payload.creature.abilities = [{ name: "Sopro", description: "Cone", damageDice: "4d6+8", dt: 20, savingThrow: "Fortitude" }];
  payload.creature.actions.agredir = [{ name: "Garras", test: "2d20+10", damage: "3d8+5", criticalMargin: 19, criticalMultiplier: "x3", range: "Corpo a corpo" }];
  payload.creature.actions.other = [{ name: "Uivo", description: "Som alto" }];
  const normalized = normalizeThreatPayload(payload);
  const imported = normalizeThreatPayload(exportThreatRecord(normalized), { id: "schema-roundtrip" });
  assert.equal(imported.creature.abilities[0].damageDice, "4d6+8");
  assert.equal(imported.creature.abilities[0].dt, 20);
  assert.equal(imported.creature.abilities[0].savingThrow, "Fortitude");
  assert.equal(imported.creature.actions.agredir[0].criticalMargin, 19);
  assert.equal(imported.creature.actions.agredir[0].criticalMultiplier, "x3");
  assert.equal(imported.creature.actions.other[0].name, "Uivo");
});


test("criticalMultiplier é validado no formato xN", () => {
  const payload = createThreatTemplate();
  payload.creature.actions.agredir[0].criticalMultiplier = "2x";
  const errors = validateThreatPayload(payload);
  assert.ok(errors.some((item) => item.path === "creature.actions.agredir[0].criticalMultiplier"));
});

test("dano tipado aplica RD específica antes de descontar PV", () => {
  const record = makeRecord();
  record.creature.hp.max = 100;
  record.runtime.hpCurrent = 100;
  record.creature.resistances = ["RD 5 contra Corte e Impacto", "Resistência 3 a Fogo"];
  const result = applyTypedDamage(record, 12, "Corte");
  assert.equal(result.resistance, 5);
  assert.equal(result.applied, 7);
  assert.equal(result.record.runtime.hpCurrent, 93);
  assert.equal(record.runtime.hpCurrent, 100, "a ficha original não deve ser mutada");
});

test("dano tipado aceita objetos de RD e a opção Ignorar RD", () => {
  const record = makeRecord();
  record.creature.hp.max = 80;
  record.runtime.hpCurrent = 80;
  record.creature.resistances = [{ type: "Balístico", amount: 8 }];
  const normal = calculateTypedDamage(record, 15, "Balístico");
  const ignored = applyTypedDamage(record, 15, "Balístico", { ignoreRD: true });
  assert.equal(normal.applied, 7);
  assert.equal(ignored.resistance, 0);
  assert.equal(ignored.applied, 15);
  assert.equal(ignored.record.runtime.hpCurrent, 65);
});

test("imunidade anula dano mesmo quando Ignorar RD está marcado", () => {
  const record = makeRecord();
  record.creature.hp.max = 100;
  record.runtime.hpCurrent = 100;
  record.creature.resistances = ["RD 10 a Fogo"];
  record.creature.immunities = ["Imune a Fogo"];
  const result = applyTypedDamage(record, 20, "Fogo", { ignoreRD: true });
  assert.equal(result.immune, true);
  assert.equal(result.applied, 0);
  assert.equal(result.record.runtime.hpCurrent, 100);
});

test("RD universal de condição reduz dano de qualquer tipo, salvo ao ignorar RD", () => {
  const record = makeRecord();
  record.creature.hp.max = 100;
  record.runtime.hpCurrent = 100;
  record.runtime.conditions = [{ id: "rd-universal", name: "Proteção", modifiers: {}, rules: ["resistanceAll10"] }];
  assert.equal(calculateTypedDamage(record, 17, "Medo").applied, 7);
  assert.equal(calculateTypedDamage(record, 17, "Medo", { ignoreRD: true }).applied, 17);
});

test("Cura Acelerada é identificada por campo estruturado ou característica textual", () => {
  const record = makeRecord();
  assert.equal(getFastHealing(record), 0);
  record.creature.hp.fastHealing = 8;
  assert.equal(getFastHealing(record), 8);
  record.creature.hp.fastHealing = null;
  record.creature.features = [{ name: "Cura Acelerada 12" }];
  assert.equal(getFastHealing(record), 12);
});

test("Cura Acelerada é aplicada sem ultrapassar PV máximos", () => {
  const record = makeRecord();
  record.creature.hp.max = 30;
  record.runtime.hpCurrent = 27;
  const healed = changeHitPoints(record, 8, "heal");
  assert.equal(healed.runtime.hpCurrent, 30);
});
