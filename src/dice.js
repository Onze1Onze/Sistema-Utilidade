import { adjustDiceCount, computeEffectiveStats, rollDiceExpression } from "./threat-engine.js";

export function rollAttack(record, attack) {
  const stats = computeEffectiveStats(record);
  const testExpression = applyFlatBonus(attack.test || "1d20", stats.attackBonus);
  const test = rollDiceExpression(applyDiceCondition(testExpression, stats.diceCount.attack));
  const damageExpression = attack.damage ? applyFlatBonus(attack.damage, stats.damageBonus) : "";
  const damage = damageExpression ? rollDiceExpression(applyDiceCondition(damageExpression, stats.diceCount.damage)) : null;
  return { kind: "attack", title: attack.name, test, damage, critical: attack.critical ?? "", range: attack.range ?? "", effects: attack.effects ?? "" };
}

export function rollAbility(record, ability) {
  const stats = computeEffectiveStats(record);
  const modifier = ability.rollType === "attack" ? stats.attackBonus : ability.rollType === "damage" ? stats.damageBonus : 0;
  const roll = ability.roll ? rollDiceExpression(applyDiceCondition(applyFlatBonus(ability.roll, modifier), stats.diceCount.abilities)) : null;
  return { kind: "ability", title: ability.name, roll, description: ability.description ?? "" };
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
