import { adjustDiceCount, computeEffectiveStats, rollDiceExpression } from "./threat-engine.js";

export function rollAttack(record, attack, part = "both") {
  const stats = computeEffectiveStats(record);
  const isMelee = /corpo|corpo a corpo|melee|adjacente/i.test(String(attack.range ?? ""));
  const categoryPenalty = isMelee ? stats.diceCount.attackMelee : stats.diceCount.attackRanged;
  const testExpression = applyFlatBonus(attack.test || "1d20", stats.attackBonus);
  const test = part === "damage" ? null : rollDiceExpression(applyDiceCondition(testExpression, stats.diceCount.attack + categoryPenalty));
  const damageExpression = attack.damage ? applyFlatBonus(attack.damage, stats.damageBonus) : "";
  const damage = part === "test" || !damageExpression ? null : rollDiceExpression(applyDiceCondition(damageExpression, stats.diceCount.damage));
  const warnings = [];
  if (stats.rules.includes("attacksTargetTotalConcealment")) warnings.push("Alvo recebe camuflagem total.");
  return { kind: "attack", title: attack.name, part, test, damage, critical: attack.critical ?? "", range: attack.range ?? "", effects: [attack.effects, ...warnings].filter(Boolean).join(" · ") };
}

export function rollAbility(record, ability, part = "both") {
  const stats = computeEffectiveStats(record);
  const legacyRoll = ability.roll || "";
  const testExpression = ability.test || (ability.rollType === "damage" ? "" : legacyRoll);
  const damageExpression = ability.damageDice || ability.damage || (ability.rollType === "damage" ? legacyRoll : "");
  const test = part === "damage" || !testExpression ? null : rollDiceExpression(
    applyDiceCondition(applyFlatBonus(testExpression, ability.rollType === "attack" ? stats.attackBonus : 0), stats.diceCount.abilities)
  );
  const damage = part === "test" || !damageExpression ? null : rollDiceExpression(
    applyDiceCondition(applyFlatBonus(damageExpression, stats.damageBonus), stats.diceCount.damage)
  );
  const isRitual = ability.ritual === true || /ritual/i.test(`${ability.type ?? ""} ${ability.actionType ?? ""}`);
  const ritualWarning = isRitual && stats.rules.includes("ritualsPoorCondition") ? "Condição ruim para lançar rituais." : "";
  const metadata = [
    ability.dt !== null && ability.dt !== undefined ? `DT ${ability.dt}` : "",
    ability.savingThrow ? `Teste de resistência: ${ability.savingThrow}` : ""
  ].filter(Boolean).join(" · ");
  return {
    kind: "ability", title: ability.name, part, test, damage,
    critical: ability.criticalMargin ? `${ability.criticalMargin}/${ability.criticalMultiplier || "x2"}` : "",
    range: ability.range ?? "",
    effects: ability.effects ?? "",
    description: [ability.description, metadata, ritualWarning].filter(Boolean).join(" · ")
  };
}

export function rollSkillTest(record, skillTest) {
  const stats = computeEffectiveStats(record);
  const expression = skillTest.test || skillTest.roll || "";
  const attribute = skillTest.attribute || "";
  const attributePenalty = attribute ? (stats.diceCount.attributes[attribute] ?? 0) : 0;
  const isPerception = /percep/.test(String(skillTest.name ?? skillTest.skill ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
  const perceptionPenalty = isPerception ? (stats.diceCount.senses.perception ?? 0) : 0;
  const roll = expression ? rollDiceExpression(applyDiceCondition(expression, attributePenalty + perceptionPenalty)) : null;
  return { kind: "skill", title: skillTest.name, roll, attribute, senseUse: skillTest.senseUse ?? null, description: skillTest.description ?? "" };
}

export function rollDamageExpression(record, expression) {
  const stats = computeEffectiveStats(record);
  const adjusted = applyFlatBonus(expression, stats.damageBonus);
  const roll = rollDiceExpression(applyDiceCondition(adjusted, stats.diceCount.damage));
  return { kind: "damage", title: "Dano", roll };
}

export function rollStat(record, expression, statKey) {
  const stats = computeEffectiveStats(record);
  if (statKey === "reflexes" && stats.rules.includes("reflexesAutoFail")) {
    return { kind: "forced-failure", title: "Reflexos", total: "FALHA", expression, description: "Esta condição determina falha automática em testes de Reflexos." };
  }
  // A expressão recebida vem de computeEffectiveStats e já contém os modificadores ativos.
  const roll = rollDiceExpression(expression);
  return { kind: "stat", title: statKey, roll };
}

export function rollStandalone(expression) { return rollDiceExpression(expression); }

function applyFlatBonus(expression, bonus) {
  if (!bonus) return expression;
  return `${expression}${bonus >= 0 ? "+" : ""}${bonus}`;
}

function applyDiceCondition(expression, adjustment) {
  if (!adjustment) return expression;
  return adjustDiceCount(expression, adjustment);
}
