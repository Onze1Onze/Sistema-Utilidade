import test from "node:test";
import assert from "node:assert/strict";
import { CONDITION_PRESETS, applyPresetCondition, canPerformAction, canUseAttackWhileGrappled } from "../src/conditions.js";
import { createThreatTemplate, normalizeThreatPayload, computeEffectiveStats, changeHitPoints } from "../src/threat-engine.js";
import { rollAttack, rollSkillTest, rollDamageExpression } from "../src/dice.js";

function record() {
  const payload = createThreatTemplate();
  payload.creature.defense = 25;
  payload.creature.movement.meters = 9;
  payload.creature.saves.reflexes = "2d20+8";
  payload.creature.senses.perception = "2d20+5";
  payload.creature.attacks = [
    { name: "Golpe", test: "3d20+10", damage: "2d8+4", range: "Corpo a corpo", weaponType: "light" },
    { name: "Disparo", test: "2d20+8", damage: "1d8+3", range: "À distância", weaponType: "ranged" }
  ];
  payload.creature.skillTests = [
    { name: "Atletismo", attribute: "for", test: "3d20+5", damage: "2d6+2" }
  ];
  return normalizeThreatPayload(payload, { id: "condition-test" });
}

test("catálogo contém as 17 condições solicitadas", () => {
  assert.equal(CONDITION_PRESETS.length, 17);
  assert.deepEqual(CONDITION_PRESETS.map((condition) => condition.name), [
    "Agarrado", "Caído", "Cego", "Debilitado", "Desprevenido", "Enredado", "Exausto", "Fatigado", "Fraco", "Inconsciente", "Indefeso", "Ofuscado", "Paralisado", "Petrificado", "Surdo", "Surpreendido", "Vulnerável"
  ]);
});

test("Caído aplica defesa situacional, deslocamento e penalidade só em ataques corpo a corpo", () => {
  const next = applyPresetCondition(record(), "Caído");
  const stats = computeEffectiveStats(next);
  assert.equal(stats.defenseMelee.value, 20);
  assert.equal(stats.defenseRanged.value, 30);
  assert.equal(stats.movement.value, 1.5);
  const melee = rollAttack(next, next.creature.attacks[0], "test");
  const ranged = rollAttack(next, next.creature.attacks[1], "test");
  assert.match(melee.test.expression, /^1d20/);
  assert.match(ranged.test.expression, /^2d20/);
});

test("Cego e Debilitado alteram testes de perícias pelo atributo", () => {
  const blind = applyPresetCondition(record(), "Cego");
  assert.equal(computeEffectiveStats(blind).movement.value, 4.5);
  assert.match(rollSkillTest(blind, blind.creature.skillTests[0]).roll.expression, /^1d20/);
  const weak = applyPresetCondition(record(), "Debilitado");
  assert.match(rollSkillTest(weak, weak.creature.skillTests[0]).roll.expression, /^1d20/);
});

test("Desprevenido e Indefeso aplicam Defesa e Reflexos", () => {
  const surprised = applyPresetCondition(record(), "Desprevenido");
  assert.equal(computeEffectiveStats(surprised).defense.value, 20);
  assert.match(computeEffectiveStats(surprised).saves.reflexes.value, /^1d20/);
  const defenseless = applyPresetCondition(record(), "Indefeso");
  assert.equal(computeEffectiveStats(defenseless).defense.value, 15);
  assert.equal(computeEffectiveStats(defenseless).rules.includes("reflexesAutoFail"), true);
});

test("condições compostas aplicam os modificadores de fadiga e vulnerabilidade", () => {
  const exhausted = applyPresetCondition(record(), "Exausto");
  const stats = computeEffectiveStats(exhausted);
  assert.equal(stats.defense.value, 23);
  assert.equal(stats.movement.value, 4.5);
  assert.match(rollSkillTest(exhausted, exhausted.creature.skillTests[0]).roll.expression, /^1d20/);
});

test("reaplicação de Fraco, Debilitado, Fatigado e Exausto agrava a condição", () => {
  let current = applyPresetCondition(record(), "Fraco");
  current = applyPresetCondition(current, "Fraco");
  assert.equal(current.runtime.conditions.some((item) => item.name === "Debilitado"), true);
  current = applyPresetCondition(current, "Debilitado");
  assert.equal(current.runtime.conditions.some((item) => item.name === "Inconsciente"), true);
  let fatigue = applyPresetCondition(record(), "Fatigado");
  fatigue = applyPresetCondition(fatigue, "Fatigado");
  assert.equal(fatigue.runtime.conditions.some((item) => item.name === "Exausto"), true);
  fatigue = applyPresetCondition(fatigue, "Exausto");
  assert.equal(fatigue.runtime.conditions.some((item) => item.name === "Inconsciente"), true);
});

test("rolagem de teste e dano são independentes", () => {
  const r = record();
  const skill = r.creature.skillTests[0];
  const testResult = rollSkillTest(r, skill);
  const damageResult = rollDamageExpression(r, skill.damage);
  assert.equal(testResult.kind, "skill");
  assert.equal(testResult.roll.expression, "3d20+5");
  assert.equal(damageResult.kind, "damage");
  assert.equal(damageResult.roll.expression, "2d6+2");
});

test("rolagem de dano do ataque pode ocorrer sem rolar o teste de ataque", () => {
  const r = record();
  const result = rollAttack(r, r.creature.attacks[0], "damage");
  assert.equal(result.test, null);
  assert.equal(result.damage.expression, "2d8+4");
  assert.equal(result.part, "damage");
});

test("Petrificado reduz em 10 o dano aplicado antes de subtrair PV", () => {
  let r = applyPresetCondition(record(), "Petrificado");
  r.runtime.hpCurrent = 50;
  r = changeHitPoints(r, 7, "damage");
  assert.equal(r.runtime.hpCurrent, 50);
  r = changeHitPoints(r, 18, "damage");
  assert.equal(r.runtime.hpCurrent, 42);
  assert.match(r.runtime.history.at(-1).message, /Resistência 10/);
});

test("Cego bloqueia observação, mas preserva uma Percepção explicitamente usada para ouvir", async () => {
  const { getSkillTestRestriction } = await import("../src/conditions.js");
  const blind = applyPresetCondition(record(), "Cego");
  assert.match(getSkillTestRestriction(blind, { name: "Percepção", senseUse: "observe" }), /Cego/);
  assert.equal(getSkillTestRestriction(blind, { name: "Percepção", senseUse: "hear" }), null);
});

test("Surdo bloqueia testes de audição, mas não observação visual", async () => {
  const { getSkillTestRestriction } = await import("../src/conditions.js");
  const deaf = applyPresetCondition(record(), "Surdo");
  assert.match(getSkillTestRestriction(deaf, { name: "Percepção", senseUse: "hear" }), /Surdo/);
  assert.equal(getSkillTestRestriction(deaf, { name: "Percepção", senseUse: "observe" }), null);
});

test("Debilitado e Exausto substituem condições anteriores menos graves e não são rebaixados", () => {
  let current = applyPresetCondition(record(), "Fraco");
  current = applyPresetCondition(current, "Debilitado");
  assert.equal(current.runtime.conditions.some((item) => item.name === "Fraco"), false);
  assert.equal(current.runtime.conditions.some((item) => item.name === "Debilitado"), true);
  assert.throws(() => applyPresetCondition(current, "Fraco"), /estágio mais grave/);
  let fatigue = applyPresetCondition(record(), "Fatigado");
  fatigue = applyPresetCondition(fatigue, "Exausto");
  assert.equal(fatigue.runtime.conditions.some((item) => item.name === "Fatigado"), false);
  assert.throws(() => applyPresetCondition(fatigue, "Fatigado"), /estágio mais grave/);
});

test("Ofuscado também reduz em um dado os testes de Percepção cadastrados em skillTests", async () => {
  const { rollSkillTest } = await import("../src/dice.js");
  const payload = createThreatTemplate();
  payload.creature.skillTests = [{ name: "Percepção", senseUse: "observe", attribute: "pre", test: "2d20+5", damage: "" }];
  const record = normalizeThreatPayload(payload);
  const obscured = applyPresetCondition(record, "Ofuscado");
  assert.equal(rollSkillTest(obscured, obscured.creature.skillTests[0]).roll.expression, "1d20+5");
});

test("Paralisado permite ação mental explicitamente marcada e continua impedindo ações físicas", () => {
  const paralyzed = applyPresetCondition(record(), "Paralisado");
  const rules = computeEffectiveStats(paralyzed).rules;
  assert.equal(rules.includes("mentalOnly"), true);
  assert.equal(rules.includes("cannotReact"), false);
  assert.equal(computeEffectiveStats(paralyzed).movement.value, 0);
});

test("Agarrado só libera ataques identificados como armas leves", () => {
  assert.equal(canUseAttackWhileGrappled({ weaponType: "light" }), true);
  assert.equal(canUseAttackWhileGrappled({ weapon: "arma leve" }), true);
  assert.equal(canUseAttackWhileGrappled({ weaponType: "pesada" }), false);
  assert.equal(canUseAttackWhileGrappled({ weaponType: "ranged" }), false);
});

test("Inconsciente bloqueia ações e reações; Paralisado só libera ações mentais", () => {
  const unconscious = applyPresetCondition(record(), "Inconsciente");
  assert.equal(canPerformAction(unconscious, { name: "Ritual mental", mental: true }), false);
  assert.equal(canPerformAction(unconscious, { name: "Reação" }, { isReaction: true }), false);
  const paralyzed = applyPresetCondition(record(), "Paralisado");
  assert.equal(canPerformAction(paralyzed, { name: "Ataque físico" }), false);
  assert.equal(canPerformAction(paralyzed, { name: "Ritual mental", mental: true }), true);
  assert.equal(canPerformAction(paralyzed, { name: "Reação mental", mental: true }, { isReaction: true }), true);
});


test("condição predefinida salva a categoria para exibição na ficha", () => {
  const applied = applyPresetCondition(record(), "Agarrado");
  assert.equal(applied.runtime.conditions[0].group, "Paralisia");
  assert.ok(applied.runtime.conditions[0].description);
  assert.ok(applied.runtime.conditions[0].rules.includes("onlyLightWeapons"));
});

test("rollAbility interpreta damageDice e mantém DT e resistência na descrição", async () => {
  const { rollAbility } = await import("../src/dice.js");
  const payload = createThreatTemplate();
  payload.creature.abilities = [{ name: "Sopro", description: "Cone de energia", damageDice: "3d8+4", dt: 22, savingThrow: "Reflexos" }];
  const record = normalizeThreatPayload(payload);
  const result = rollAbility(record, record.creature.abilities[0], "damage");
  assert.equal(result.damage.expression, "3d8+4");
  assert.match(result.description, /DT 22/);
  assert.match(result.description, /Reflexos/);
});
