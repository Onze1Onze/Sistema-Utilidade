import { addCondition, removeCondition, computeEffectiveStats } from "./threat-engine.js";

export const CONDITION_PRESETS = [
  { name: "Agarrado", group: "Paralisia", description: "O personagem fica desprevenido e imóvel, sofre –1d20 em testes de ataque e só pode atacar com armas leves. Um personagem fazendo um ataque à distância contra um alvo envolvido na manobra agarrar tem 50% de chance de acertar o alvo errado.", modifiers: { defense: -5, reflexes: 0, movementSet: 0, diceCount: { attack: -1, reflexes: -1 } }, rules: ["immobile", "onlyLightWeapons", "rangedAttackMisfire50"] },
  { name: "Caído", group: "Estado físico", description: "Deitado no chão. O personagem sofre –2d20 em ataques corpo a corpo e seu deslocamento é reduzido a 1,5m. Além disso, sofre –5 na Defesa contra ataques corpo a corpo, mas recebe +5 na Defesa contra ataques à distância.", modifiers: { defenseMelee: -5, defenseRanged: 5, movementSet: 1.5, diceCount: { attackMelee: -2 } }, rules: [] },
  { name: "Cego", group: "Sentidos", description: "O personagem fica desprevenido e lento, não pode fazer testes de Percepção para observar e sofre –2d20 em testes de perícias baseadas em Agilidade ou Força. Todos os alvos de seus ataques recebem camuflagem total. Você é considerado cego enquanto estiver em uma área de escuridão total, a menos que algo lhe permita perceber no escuro.", modifiers: { defense: -5, reflexes: 0, movementMultiplier: 0.5, diceCount: { reflexes: -1, attributes: { agi: -2, for: -2 } } }, rules: ["cannotObserve", "attacksTargetTotalConcealment"] },
  { name: "Debilitado", group: "Estado físico", description: "O personagem sofre –2d20 em testes de Agilidade, Força e Vigor. Se o personagem ficar debilitado novamente, em vez disso fica inconsciente.", modifiers: { diceCount: { attributes: { agi: -2, for: -2, vig: -2 } } }, rules: [] },
  { name: "Desprevenido", group: "Combate", description: "Despreparado para reagir. O personagem sofre –5 na Defesa e –1d20 em Reflexos. Você fica desprevenido contra inimigos que não possa perceber.", modifiers: { defense: -5, diceCount: { reflexes: -1 } }, rules: [] },
  { name: "Enredado", group: "Paralisia", description: "O personagem fica lento, vulnerável e sofre –1d20 em testes de ataque.", modifiers: { movementMultiplier: 0.5, defense: -2, diceCount: { attack: -1 } }, rules: [] },
  { name: "Exausto", group: "Fadiga", description: "O personagem fica debilitado, lento e vulnerável. Se ficar exausto novamente, em vez disso fica inconsciente.", modifiers: { movementMultiplier: 0.5, defense: -2, diceCount: { attributes: { agi: -2, for: -2, vig: -2 } } }, rules: [] },
  { name: "Fatigado", group: "Fadiga", description: "O personagem fica fraco e vulnerável. Se o personagem ficar fatigado novamente, em vez disso fica exausto.", modifiers: { defense: -2, diceCount: { attributes: { agi: -1, for: -1, vig: -1 } } }, rules: [] },
  { name: "Fraco", group: "Estado físico", description: "O personagem sofre –1d20 em testes de Agilidade, Força e Vigor. Se ficar fraco novamente, em vez disso fica debilitado.", modifiers: { diceCount: { attributes: { agi: -1, for: -1, vig: -1 } } }, rules: [] },
  { name: "Inconsciente", group: "Incapacitação", description: "O personagem fica indefeso e não pode fazer ações, incluindo reações. Balançar um ser para acordá-lo gasta uma ação padrão.", modifiers: { defense: -10 }, rules: ["incapacitated", "cannotAct", "cannotReact", "reflexesAutoFail"] },
  { name: "Indefeso", group: "Incapacitação", description: "O personagem é considerado desprevenido, mas sofre –10 na Defesa, falha automaticamente em testes de Reflexos e pode sofrer golpes de misericórdia.", modifiers: { defense: -10 }, rules: ["reflexesAutoFail"] },
  { name: "Ofuscado", group: "Sentidos", description: "O personagem sofre –1d20 em testes de ataque e de Percepção.", modifiers: { diceCount: { attack: -1, senses: { perception: -1 } } }, rules: [] },
  { name: "Paralisado", group: "Paralisia", description: "O personagem fica imóvel e indefeso e só pode realizar ações puramente mentais.", modifiers: { defense: -10, movementSet: 0 }, rules: ["immobile", "mentalOnly", "reflexesAutoFail"] },
  { name: "Petrificado", group: "Incapacitação", description: "O personagem fica inconsciente e recebe resistência a dano 10.", modifiers: { defense: -10 }, rules: ["incapacitated", "cannotAct", "cannotReact", "reflexesAutoFail", "resistanceAll10"] },
  { name: "Surdo", group: "Sentidos", description: "O personagem não pode fazer testes de Percepção para ouvir e sofre –2d20 em testes de Iniciativa. Além disso, é considerado em condição ruim para lançar rituais.", modifiers: { diceCount: { senses: { initiative: -2 } } }, rules: ["cannotHear", "ritualsPoorCondition"] },
  { name: "Surpreendido", group: "Combate", description: "Não ciente de seus inimigos. O personagem fica desprevenido e não pode fazer ações.", modifiers: { defense: -5, diceCount: { reflexes: -1 } }, rules: ["cannotAct"] },
  { name: "Vulnerável", group: "Combate", description: "O personagem sofre –2 na Defesa.", modifiers: { defense: -2 }, rules: [] }
];

function normalizeSenseText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Retorna uma mensagem quando uma condição impede o teste sensorial configurado.
 * senseUse aceita "observe" ou "hear"; quando omitido, um teste chamado Percepção
 * é tratado como observação, para não permitir que Cego role observação por engano.
 */
export function getSkillTestRestriction(record, skillTest) {
  const rules = computeEffectiveStats(record).rules;
  const descriptor = normalizeSenseText([
    skillTest?.name, skillTest?.skill, skillTest?.purpose, skillTest?.description,
    skillTest?.senseUse, skillTest?.perceptionMode
  ].filter(Boolean).join(" "));
  const usage = normalizeSenseText(skillTest?.senseUse ?? skillTest?.perceptionMode ?? "");
  const hearing = usage === "hear" || usage === "hearing" || usage === "ouvir"
    || /\b(ouvir|escutar|audicao|hearing|listening)\b/.test(descriptor);
  const perception = /percepc|observar|observacao/.test(descriptor);
  const observing = usage === "observe" || usage === "observar" || usage === "visual"
    || (perception && !hearing);
  if (rules.includes("cannotObserve") && observing) {
    return "Cego: não pode realizar testes de Percepção para observar.";
  }
  if (rules.includes("cannotHear") && hearing) {
    return "Surdo: não pode realizar testes de Percepção para ouvir.";
  }
  return null;
}

const ESCALATION = { "Fraco": "Debilitado", "Debilitado": "Inconsciente", "Fatigado": "Exausto", "Exausto": "Inconsciente" };
const LOWER_TIER = { "Debilitado": "Fraco", "Exausto": "Fatigado" };
const HIGHER_TIER = { "Fraco": ["Debilitado", "Inconsciente"], "Debilitado": ["Inconsciente"], "Fatigado": ["Exausto", "Inconsciente"], "Exausto": ["Inconsciente"] };
export function canPerformAction(record, action = {}, { isReaction = false } = {}) {
  const rules = computeEffectiveStats(record).rules;
  if (rules.includes("incapacitated") || rules.includes("cannotAct")) return false;
  if (isReaction && rules.includes("cannotReact")) return false;
  if (rules.includes("mentalOnly")) {
    const descriptor = normalizeSenseText([action?.actionType, action?.type, action?.name, action?.description, action?.category].filter(Boolean).join(" "));
    return action?.mental === true || /mental|concentracao|psiquic/.test(descriptor);
  }
  return true;
}

export function canUseAttackWhileGrappled(attack) {
  if (attack?.light === true || attack?.isLightWeapon === true) return true;
  const weapon = normalizeSenseText([attack?.weaponType, attack?.weaponClass, attack?.weaponCategory, attack?.weapon].filter(Boolean).join(" "));
  return /(^|[\s_-])(light|leve)([\s_-]|$)|arma\s+leve|light\s+weapon/.test(weapon);
}

export function getConditionPreset(name) { return CONDITION_PRESETS.find((condition) => condition.name === name) ?? null; }
export function getConditionEscalation(name) { return ESCALATION[name] ?? null; }
export function applyPresetCondition(record, name, duration = "") {
  const preset = getConditionPreset(name);
  if (!preset) throw new Error(`Condição predefinida “${name}” não encontrada.`);
  const conditions = record.runtime.conditions;
  const existing = conditions.find((condition) => condition.name === name);
  if (existing) {
    const upgradedName = getConditionEscalation(name);
    if (!upgradedName) throw new Error(`${name} já está aplicada. Remova-a antes de aplicar novamente.`);
    const upgraded = getConditionPreset(upgradedName);
    if (!upgraded) throw new Error(`A condição de agravamento “${upgradedName}” não foi configurada.`);
    const cleared = removeCondition(record, existing.id);
    return addCondition(cleared, { ...upgraded, duration, description: `${upgraded.description} (Agravamento de ${name}.)` });
  }
  const higher = HIGHER_TIER[name] ?? [];
  const activeHigher = conditions.find((condition) => higher.includes(condition.name));
  if (activeHigher) throw new Error(`${name} não foi aplicada: ${activeHigher.name} já representa um estágio mais grave.`);
  const lowerName = LOWER_TIER[name];
  const activeLower = lowerName ? conditions.find((condition) => condition.name === lowerName) : null;
  const cleared = activeLower ? removeCondition(record, activeLower.id) : record;
  return addCondition(cleared, { ...preset, duration, description: activeLower ? `${preset.description} (Substitui ${lowerName}.)` : preset.description });
}
