export const SCHEMA_VERSION = 1;

export class ThreatValidationError extends Error {
  constructor(errors) {
    super(errors.map((entry) => `${entry.path}: ${entry.message}`).join("\n"));
    this.name = "ThreatValidationError";
    this.errors = errors;
  }
}

export function createThreatTemplate() {
  return {
    schemaVersion: SCHEMA_VERSION,
    creature: {
      name: "NOME DA AMEAÇA",
      vd: 0,
      category: "",
      type: "Criatura",
      elementPrimary: "",
      elementsSecondary: [],
      description: "",
      appearance: "",
      lore: "",
      presence: { dt: null, mentalDamage: "", nex: "" },
      senses: { perception: "", initiative: "", special: "" },
      defense: 0,
      saves: { fortitude: "", reflexes: "", will: "" },
      hp: { max: 1, current: 1, woundedAt: null },
      resistances: [],
      vulnerabilities: [],
      immunities: [],
      attributes: { agi: 0, for: 0, int: 0, pre: 0, vig: 0 },
      skills: [],
      movement: { meters: 0, squares: null },
      attacks: [
        {
          name: "ATAQUE",
          test: "1d20+0",
          damage: "1d6",
          critical: "20/x2",
          range: "Corpo a corpo",
          effects: "",
          description: ""
        }
      ],
      abilities: [],
      features: [],
      resources: [],
      notes: "",
      custom: {}
    },
    state: {
      hpCurrent: 1,
      conditions: [],
      resources: {},
      history: []
    }
  };
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
const clone = (value) => structuredClone(value);
const addError = (errors, path, message) => errors.push({ path, message });
const ensureArray = (value) => Array.isArray(value) ? value : [];
const stringOr = (value, fallback = "") => typeof value === "string" ? value : fallback;

export function parseDiceExpression(expression) {
  if (typeof expression !== "string" || !expression.trim()) {
    throw new Error("Informe uma expressão, como 1d20+5.");
  }
  const source = expression.replace(/\s+/g, "").toLowerCase();
  const tokens = [];
  let position = 0;
  while (position < source.length) {
    const match = source.slice(position).match(/^([+-]?)(?:(\d*)d(\d+)|(\d+))/);
    if (!match) throw new Error(`Trecho inválido próximo de “${source.slice(position)}”.`);
    const sign = match[1] === "-" ? -1 : 1;
    if (match[2] !== undefined) {
      const count = match[2] === "" ? 1 : Number(match[2]);
      const sides = Number(match[3]);
      if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("A quantidade de dados deve ficar entre 1 e 100.");
      if (!Number.isInteger(sides) || sides < 2 || sides > 1000) throw new Error("O dado deve ter entre 2 e 1000 faces.");
      tokens.push({ type: "dice", count, sides, sign });
    } else {
      const value = Number(match[4]);
      if (!Number.isSafeInteger(value) || value > 1000000) throw new Error("O modificador numérico é grande demais.");
      tokens.push({ type: "constant", value, sign });
    }
    position += match[0].length;
  }
  return tokens;
}

export function validateDiceExpression(expression) {
  try { parseDiceExpression(expression); return { valid: true, error: null }; }
  catch (error) { return { valid: false, error: error.message }; }
}

export function rollDiceExpression(expression, random = Math.random) {
  const tokens = parseDiceExpression(expression);
  const parts = [];
  let total = 0;
  for (const token of tokens) {
    if (token.type === "constant") {
      const value = token.value * token.sign;
      total += value;
      parts.push({ type: "constant", value, subtotal: value });
      continue;
    }
    const rolls = [];
    for (let i = 0; i < token.count; i += 1) {
      const value = Math.floor(random() * token.sides) + 1;
      rolls.push(value);
    }
    const subtotal = rolls.reduce((sum, value) => sum + value, 0) * token.sign;
    total += subtotal;
    parts.push({ type: "dice", count: token.count, sides: token.sides, sign: token.sign, rolls, subtotal });
  }
  return { expression, parts, total };
}

export function validateThreatPayload(payload) {
  const errors = [];
  if (!isObject(payload)) return [{ path: "$", message: "Era esperado um objeto JSON para a ameaça." }];
  const creature = payload.creature ?? payload.threat ?? payload;
  if (!isObject(creature)) return [{ path: "creature", message: "Era esperado um objeto com os dados da criatura." }];
  if (typeof creature.name !== "string" || !creature.name.trim()) addError(errors, "creature.name", "Campo obrigatório; informe o nome da ameaça.");
  if (creature.vd !== undefined && (!isNumber(creature.vd) || creature.vd < 0)) addError(errors, "creature.vd", "Informe um número maior ou igual a zero.");
  if (creature.defense !== undefined && !isNumber(creature.defense)) addError(errors, "creature.defense", "Informe um valor numérico para Defesa.");
  const hp = creature.hp;
  if (!isObject(hp)) addError(errors, "creature.hp", "Era esperado um objeto com max e current.");
  else {
    if (!Number.isInteger(hp.max) || hp.max < 1) addError(errors, "creature.hp.max", "Informe um inteiro maior que zero.");
    if (hp.current !== undefined && (!Number.isInteger(hp.current) || hp.current < 0)) addError(errors, "creature.hp.current", "Informe um inteiro maior ou igual a zero.");
    if (Number.isInteger(hp.max) && Number.isInteger(hp.current) && hp.current > hp.max) addError(errors, "creature.hp.current", "A vida atual não pode ultrapassar a vida máxima.");
  }
  if (creature.attributes !== undefined && !isObject(creature.attributes)) addError(errors, "creature.attributes", "Era esperado um objeto com AGI, FOR, INT, PRE e VIG.");
  else if (isObject(creature.attributes)) for (const key of ["agi", "for", "int", "pre", "vig"]) if (creature.attributes[key] !== undefined && !isNumber(creature.attributes[key])) addError(errors, `creature.attributes.${key}`, "Informe um número para o atributo.");
  if (creature.saves !== undefined && !isObject(creature.saves)) addError(errors, "creature.saves", "Era esperado um objeto com fortitude, reflexes e will.");
  else if (isObject(creature.saves)) for (const key of ["fortitude", "reflexes", "will"]) if (creature.saves[key] !== undefined && typeof creature.saves[key] !== "string" && !isNumber(creature.saves[key])) addError(errors, `creature.saves.${key}`, "Informe um número ou uma expressão de dados em texto.");
  if (creature.senses !== undefined && !isObject(creature.senses)) addError(errors, "creature.senses", "Era esperado um objeto com perception, initiative e special.");
  else if (isObject(creature.senses)) for (const key of ["perception", "initiative", "special"]) if (creature.senses[key] !== undefined && typeof creature.senses[key] !== "string" && !isNumber(creature.senses[key])) addError(errors, `creature.senses.${key}`, "Informe um número ou texto.");
  if (creature.presence !== undefined && !isObject(creature.presence)) addError(errors, "creature.presence", "Era esperado um objeto com dt, mentalDamage e nex.");
  else if (isObject(creature.presence)) {
    if (creature.presence.dt !== undefined && creature.presence.dt !== null && !isNumber(creature.presence.dt)) addError(errors, "creature.presence.dt", "Informe uma DT numérica ou null.");
    if (creature.presence.mentalDamage !== undefined && typeof creature.presence.mentalDamage !== "string" && !isNumber(creature.presence.mentalDamage)) addError(errors, "creature.presence.mentalDamage", "Informe texto ou um valor numérico.");
    if (creature.presence.nex !== undefined && typeof creature.presence.nex !== "string" && !isNumber(creature.presence.nex)) addError(errors, "creature.presence.nex", "Informe texto ou um valor numérico.");
  }
  if (creature.movement !== undefined && !isObject(creature.movement)) addError(errors, "creature.movement", "Era esperado um objeto com meters e squares.");
  else if (isObject(creature.movement)) {
    if (creature.movement.meters !== undefined && (!isNumber(creature.movement.meters) || creature.movement.meters < 0)) addError(errors, "creature.movement.meters", "Informe uma distância numérica não negativa.");
    if (creature.movement.squares !== undefined && creature.movement.squares !== null && typeof creature.movement.squares !== "string" && !isNumber(creature.movement.squares)) addError(errors, "creature.movement.squares", "Informe texto, número ou null.");
  }
  for (const field of ["resistances", "vulnerabilities", "immunities", "skills", "attacks", "abilities", "features", "resources", "elementsSecondary"]) {
    if (creature[field] !== undefined && !Array.isArray(creature[field])) addError(errors, `creature.${field}`, "Era esperado uma lista (array).");
  }
  for (const [index, attack] of ensureArray(creature.attacks).entries()) {
    if (!isObject(attack)) { addError(errors, `creature.attacks[${index}]`, "Era esperado um objeto de ataque."); continue; }
    for (const field of ["test", "damage"]) {
      if (attack[field] !== undefined && attack[field] !== "") {
        const validation = validateDiceExpression(attack[field]);
        if (!validation.valid) addError(errors, `creature.attacks[${index}].${field}`, validation.error);
      }
    }
  }
  for (const [index, ability] of ensureArray(creature.abilities).entries()) {
    if (!isObject(ability)) { addError(errors, `creature.abilities[${index}]`, "Era esperado um objeto de habilidade."); continue; }
    if (ability.roll) {
      const validation = validateDiceExpression(ability.roll);
      if (!validation.valid) addError(errors, `creature.abilities[${index}].roll`, validation.error);
    }
    if (ability.resourceCost !== undefined && (!Number.isInteger(ability.resourceCost) || ability.resourceCost < 0)) addError(errors, `creature.abilities[${index}].resourceCost`, "Informe um inteiro não negativo.");
  }
  for (const [index, resource] of ensureArray(creature.resources).entries()) {
    if (!isObject(resource)) { addError(errors, `creature.resources[${index}]`, "Era esperado um objeto de recurso."); continue; }
    if (resource.max !== undefined && (!Number.isInteger(resource.max) || resource.max < 0)) addError(errors, `creature.resources[${index}].max`, "Informe um inteiro não negativo.");
    if (resource.current !== undefined && (!Number.isInteger(resource.current) || resource.current < 0 || (Number.isInteger(resource.max) && resource.current > resource.max))) addError(errors, `creature.resources[${index}].current`, "Informe um inteiro entre zero e o máximo do recurso.");
  }
  if (payload.schemaVersion !== undefined && (!Number.isInteger(payload.schemaVersion) || payload.schemaVersion > SCHEMA_VERSION || payload.schemaVersion < 1)) {
    addError(errors, "schemaVersion", `Versão não suportada. Esta extensão aceita a versão ${SCHEMA_VERSION}.`);
  }
  const state = payload.state ?? payload.runtime;
  if (state !== undefined && !isObject(state)) addError(errors, "state", "Era esperado um objeto de estado atual.");
  if (state?.conditions !== undefined && !Array.isArray(state.conditions)) addError(errors, "state.conditions", "Era esperado uma lista de condições.");
  else for (const [index, condition] of ensureArray(state?.conditions).entries()) {
    if (!isObject(condition)) { addError(errors, `state.conditions[${index}]`, "Era esperado um objeto de condição."); continue; }
    if (typeof condition.name !== "string" || !condition.name.trim()) addError(errors, `state.conditions[${index}].name`, "Informe o nome da condição.");
    try { validateConditionModifiers(condition.modifiers ?? {}); }
    catch (error) { addError(errors, `state.conditions[${index}].modifiers`, error.message); }
  }
  if (state?.resources !== undefined && !isObject(state.resources)) addError(errors, "state.resources", "Era esperado um objeto de recursos por identificador.");
  else if (isObject(state?.resources)) for (const [key, value] of Object.entries(state.resources)) if (!Number.isInteger(value) || value < 0) addError(errors, `state.resources.${key}`, "Informe um inteiro não negativo.");
  if (state?.hpCurrent !== undefined && (!Number.isInteger(state.hpCurrent) || state.hpCurrent < 0 || (isObject(hp) && Number.isInteger(hp.max) && state.hpCurrent > hp.max))) addError(errors, "state.hpCurrent", "Informe um inteiro entre zero e a vida máxima.");
  return errors;
}

export function normalizeThreatPayload(payload, { id = crypto.randomUUID(), now = new Date().toISOString() } = {}) {
  const errors = validateThreatPayload(payload);
  if (errors.length) throw new ThreatValidationError(errors);
  const raw = payload.creature ?? payload.threat ?? payload;
  const creature = {
    ...clone(raw),
    name: raw.name.trim(),
    vd: isNumber(raw.vd) ? raw.vd : 0,
    type: stringOr(raw.type, "Criatura"),
    category: stringOr(raw.category),
    elementPrimary: stringOr(raw.elementPrimary),
    elementsSecondary: ensureArray(raw.elementsSecondary),
    presence: { dt: null, mentalDamage: "", nex: "", ...(isObject(raw.presence) ? raw.presence : {}) },
    senses: { perception: "", initiative: "", special: "", ...(isObject(raw.senses) ? raw.senses : {}) },
    defense: isNumber(raw.defense) ? raw.defense : 0,
    saves: { fortitude: "", reflexes: "", will: "", ...(isObject(raw.saves) ? raw.saves : {}) },
    hp: { max: raw.hp.max, current: raw.hp.current ?? raw.hp.max, woundedAt: null, ...raw.hp },
    resistances: ensureArray(raw.resistances),
    vulnerabilities: ensureArray(raw.vulnerabilities),
    immunities: ensureArray(raw.immunities),
    attributes: { agi: 0, for: 0, int: 0, pre: 0, vig: 0, ...(isObject(raw.attributes) ? raw.attributes : {}) },
    skills: ensureArray(raw.skills),
    movement: { meters: 0, squares: null, ...(isObject(raw.movement) ? raw.movement : {}) },
    attacks: ensureArray(raw.attacks).map((item) => ({ ...item, id: item.id || crypto.randomUUID() })),
    abilities: ensureArray(raw.abilities).map((item) => ({ ...item, id: item.id || crypto.randomUUID() })),
    features: ensureArray(raw.features),
    resources: ensureArray(raw.resources).map((item) => ({ ...item, id: item.id || crypto.randomUUID() })),
    notes: stringOr(raw.notes),
    custom: isObject(raw.custom) ? raw.custom : {}
  };
  const incomingState = payload.state ?? payload.runtime ?? {};
  const resources = {};
  for (const resource of creature.resources) resources[resource.id] = Number.isInteger(incomingState.resources?.[resource.id]) ? incomingState.resources[resource.id] : (resource.current ?? resource.max ?? 0);
  const runtime = {
    hpCurrent: Number.isInteger(incomingState.hpCurrent) ? Math.min(creature.hp.max, Math.max(0, incomingState.hpCurrent)) : creature.hp.current,
    conditions: ensureArray(incomingState.conditions).map((condition) => ({ ...condition, id: condition.id || crypto.randomUUID() })),
    resources: { ...resources, ...(isObject(incomingState.resources) ? incomingState.resources : {}) },
    history: ensureArray(incomingState.history).slice(-100)
  };
  return { id, creature, runtime, createdAt: now, updatedAt: now };
}

export function exportThreatRecord(record) {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    creature: clone(record.creature),
    state: clone(record.runtime)
  };
}

export function computeEffectiveStats(record) {
  const { creature, runtime } = record;
  const totals = { defense: 0, fortitude: 0, reflexes: 0, will: 0, perception: 0, initiative: 0, movement: 0, attack: 0, damage: 0, diceCount: { attack: 0, damage: 0, abilities: 0 }, attributes: {}, saves: {}, senses: {} };
  for (const condition of runtime.conditions ?? []) {
    const mod = condition.modifiers ?? {};
    for (const key of ["defense", "movement", "attack", "damage", "fortitude", "reflexes", "will", "perception", "initiative"]) {
      if (isNumber(mod[key])) totals[key] += mod[key];
    }
    for (const group of ["attributes", "saves", "senses", "diceCount"]) {
      if (isObject(mod[group])) for (const [key, value] of Object.entries(mod[group])) if (isNumber(value)) totals[group][key] = (totals[group][key] ?? 0) + value;
    }
  }
  const numberFrom = (value) => typeof value === "number" ? value : (typeof value === "string" && /^[-+]?\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : null);
  const effectiveExpression = (baseValue, flatBonus, diceAdjustment) => {
    const baseText = String(baseValue ?? "");
    if (numberFrom(baseValue) !== null) return numberFrom(baseValue) + flatBonus;
    if (!baseText.trim()) return "";
    let expression = baseText;
    try { if (diceAdjustment) expression = adjustDiceCount(expression, diceAdjustment); }
    catch { /* preserva a expressão original para que a validação possa sinalizar o problema */ }
    if (flatBonus) expression += `${flatBonus > 0 ? "+" : ""}${flatBonus}`;
    return expression;
  };
  const saves = {};
  for (const key of ["fortitude", "reflexes", "will"]) {
    const base = creature.saves?.[key] ?? "";
    const bonus = totals[key] + (totals.saves[key] ?? 0);
    saves[key] = { base, value: effectiveExpression(base, bonus, totals.diceCount[key] ?? 0) };
  }
  const senses = {};
  for (const key of ["perception", "initiative"]) {
    const base = creature.senses?.[key] ?? "";
    const bonus = totals[key] + (totals.senses[key] ?? 0);
    senses[key] = { base, value: effectiveExpression(base, bonus, totals.diceCount[key] ?? 0) };
  }
  const attributes = {};
  for (const key of ["agi", "for", "int", "pre", "vig"]) attributes[key] = { base: creature.attributes?.[key] ?? 0, value: (creature.attributes?.[key] ?? 0) + (totals.attributes[key] ?? 0) };
  return {
    defense: { base: creature.defense, value: creature.defense + totals.defense },
    saves, senses, attributes,
    movement: { base: creature.movement?.meters ?? 0, value: Math.max(0, (creature.movement?.meters ?? 0) + totals.movement) },
    attackBonus: totals.attack,
    damageBonus: totals.damage,
    diceCount: totals.diceCount
  };
}

export function validateConditionModifiers(modifiers) {
  if (!isObject(modifiers)) throw new Error("Os modificadores devem ser um objeto JSON.");
  const allowed = new Set(["defense", "movement", "attack", "damage", "fortitude", "reflexes", "will", "perception", "initiative", "attributes", "saves", "senses", "diceCount"]);
  const nestedAllowed = {
    attributes: new Set(["agi", "for", "int", "pre", "vig"]),
    saves: new Set(["fortitude", "reflexes", "will"]),
    senses: new Set(["perception", "initiative"]),
    diceCount: new Set(["attack", "damage", "abilities", "fortitude", "reflexes", "will", "perception", "initiative"])
  };
  for (const [key, value] of Object.entries(modifiers)) {
    if (!allowed.has(key)) throw new Error(`Modificador “${key}” não reconhecido.`);
    if (nestedAllowed[key]) {
      if (!isObject(value)) throw new Error(`O modificador “${key}” deve ser um objeto.`);
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (!nestedAllowed[key].has(nestedKey)) throw new Error(`Modificador “${key}.${nestedKey}” não reconhecido.`);
        if (!isNumber(nestedValue)) throw new Error(`“${key}.${nestedKey}” precisa ser numérico.`);
      }
    } else if (!isNumber(value)) throw new Error(`“${key}” precisa ser numérico.`);
  }
  return true;
}

export function addCondition(record, condition) {
  if (!condition || typeof condition.name !== "string" || !condition.name.trim()) throw new Error("A condição precisa de um nome.");
  validateConditionModifiers(condition.modifiers ?? {});
  const next = clone(record);
  const entry = { id: crypto.randomUUID(), name: condition.name.trim(), duration: stringOr(condition.duration), description: stringOr(condition.description), modifiers: condition.modifiers ?? {}, appliedAt: new Date().toISOString() };
  next.runtime.conditions.push(entry);
  pushHistory(next, `Condição aplicada: ${entry.name}.`);
  return next;
}

export function removeCondition(record, conditionId) {
  const next = clone(record);
  const removed = next.runtime.conditions.find((condition) => condition.id === conditionId);
  next.runtime.conditions = next.runtime.conditions.filter((condition) => condition.id !== conditionId);
  if (removed) pushHistory(next, `Condição removida: ${removed.name}.`);
  return next;
}

export function changeHitPoints(record, amount, operation = "damage") {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("Informe uma quantidade inteira não negativa.");
  const next = clone(record);
  const before = next.runtime.hpCurrent;
  next.runtime.hpCurrent = operation === "heal" ? Math.min(next.creature.hp.max, before + amount) : Math.max(0, before - amount);
  const changed = Math.abs(next.runtime.hpCurrent - before);
  if (changed) pushHistory(next, `${operation === "heal" ? "Recuperou" : "Sofreu"} ${changed} PV (${before} → ${next.runtime.hpCurrent}).`);
  return next;
}

export function changeResource(record, resourceId, amount) {
  if (!Number.isInteger(amount)) throw new Error("O ajuste do recurso precisa ser um inteiro.");
  const next = clone(record);
  const resource = next.creature.resources.find((entry) => entry.id === resourceId);
  if (!resource) throw new Error("Recurso não encontrado.");
  const max = Number.isInteger(resource.max) ? resource.max : 999999;
  const before = next.runtime.resources[resourceId] ?? 0;
  next.runtime.resources[resourceId] = Math.min(max, Math.max(0, before + amount));
  if (before !== next.runtime.resources[resourceId]) pushHistory(next, `${resource.name}: ${before} → ${next.runtime.resources[resourceId]}.`);
  return next;
}

export function pushHistory(record, message) {
  record.runtime.history = [...(record.runtime.history ?? []), { at: new Date().toISOString(), message }].slice(-100);
}

export function adjustDiceCount(expression, adjustment) {
  if (!adjustment) return expression;
  const tokens = parseDiceExpression(expression);
  return tokens.map((token) => {
    if (token.type === "constant") return `${token.sign < 0 ? "-" : "+"}${token.value}`;
    const count = Math.max(1, Math.min(100, token.count + adjustment));
    return `${token.sign < 0 ? "-" : "+"}${count}d${token.sides}`;
  }).join("").replace(/^\+/, "");
}
