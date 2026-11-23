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
      presence: {
        dt: null,
        mentalDamage: "",
        nex: ""
      },
      senses: {
        perception: "",
        initiative: "",
        special: ""
      },
      defense: 0,
      saves: {
        fortitude: "",
        reflexes: "",
        will: ""
      },
      hp: {
        max: 1,
        current: 1,
        woundedAt: null
      },
      resistances: [],
      vulnerabilities: [],
      immunities: [],
      attributes: {
        agi: 0,
        for: 0,
        int: 0,
        pre: 0,
        vig: 0
      },
      skills: [],
      movement: {
        meters: 0,
        squares: null
      },
      attacks: [
        {
          name: "ATAQUE",
          test: "1d20+0",
          damage: "1d6",
          critical: "19/x2",
          range: "Corpo a corpo",
          effects: "",
          description: ""
        }
      ],
      abilities: [
        {
          name: "",
          description: "",
          damageDice: "",
          dt: null,
          savingThrow: ""
        }
      ],
      powers: [],
      actions: {
        agredir: [
          {
            name: "",
            test: "1d20+0",
            damage: "",
            criticalMargin: 19,
            criticalMultiplier: "x2",
            range: "Corpo a corpo",
            effects: "",
            description: ""
          }
        ],
        other: []
      },
      specialActions: [],
      reactions: [],
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
  const arrayFields = ["resistances", "vulnerabilities", "immunities", "skills", "attacks", "abilities", "powers", "specialActions", "reactions", "features", "resources", "elementsSecondary", "skillTests"];
  for (const field of arrayFields) {
    if (creature[field] !== undefined && !Array.isArray(creature[field])) addError(errors, `creature.${field}`, "Era esperado uma lista (array).");
  }

  const validateRollField = (entry, field, path) => {
    const value = entry?.[field];
    if (value === undefined || value === null || value === "") return;
    if (typeof value !== "string") {
      addError(errors, `${path}.${field}`, "Informe a expressão de dados em texto, como 2d8+5.");
      return;
    }
    const validation = validateDiceExpression(value);
    if (!validation.valid) addError(errors, `${path}.${field}`, validation.error);
  };
  const validateAttackEntries = (entries, path) => {
    for (const [index, attack] of ensureArray(entries).entries()) {
      const itemPath = `${path}[${index}]`;
      if (!isObject(attack)) { addError(errors, itemPath, "Era esperado um objeto de ataque."); continue; }
      validateRollField(attack, "test", itemPath);
      validateRollField(attack, "damage", itemPath);
      if (attack.criticalMargin !== undefined && attack.criticalMargin !== null && (!Number.isInteger(attack.criticalMargin) || attack.criticalMargin < 1 || attack.criticalMargin > 20)) {
        addError(errors, `${itemPath}.criticalMargin`, "Informe uma margem crítica inteira entre 1 e 20.");
      }
      if (attack.criticalMultiplier !== undefined && (typeof attack.criticalMultiplier !== "string" || !/^x[1-9]\d*$/i.test(attack.criticalMultiplier))) {
        addError(errors, `${itemPath}.criticalMultiplier`, 'Informe o multiplicador como texto, por exemplo "x2".');
      }
    }
  };
  const validateAbilityEntries = (entries, path, { allowStrings = false } = {}) => {
    for (const [index, ability] of ensureArray(entries).entries()) {
      const itemPath = `${path}[${index}]`;
      if (allowStrings && typeof ability === "string") continue;
      if (!isObject(ability)) { addError(errors, itemPath, "Era esperado um objeto de habilidade, poder ou ação."); continue; }
      for (const field of ["name", "description", "savingThrow", "range", "effects"]) {
        if (ability[field] !== undefined && typeof ability[field] !== "string") addError(errors, `${itemPath}.${field}`, "Informe um texto.");
      }
      if (ability.dt !== undefined && ability.dt !== null && (!isNumber(ability.dt) || ability.dt < 0)) addError(errors, `${itemPath}.dt`, "Informe uma DT numérica não negativa ou null.");
      validateRollField(ability, "damageDice", itemPath);
      validateRollField(ability, "test", itemPath);
      validateRollField(ability, "damage", itemPath);
      validateRollField(ability, "roll", itemPath);
      if (ability.resourceCost !== undefined && (!Number.isInteger(ability.resourceCost) || ability.resourceCost < 0)) addError(errors, `${itemPath}.resourceCost`, "Informe um inteiro não negativo.");
    }
  };

  validateAttackEntries(creature.attacks, "creature.attacks");
  validateAbilityEntries(creature.abilities, "creature.abilities");
  for (const group of ["powers", "specialActions", "reactions"]) {
    validateAbilityEntries(creature[group], `creature.${group}`, { allowStrings: true });
  }
  // actions aceita o formato anterior (array) durante a migração, mas o formato atual é um objeto.
  if (creature.actions !== undefined) {
    if (Array.isArray(creature.actions)) {
      validateAbilityEntries(creature.actions, "creature.actions", { allowStrings: true });
    } else if (!isObject(creature.actions)) {
      addError(errors, "creature.actions", "Era esperado um objeto com as listas agredir e other.");
    } else {
      for (const group of ["agredir", "other"]) {
        if (creature.actions[group] !== undefined && !Array.isArray(creature.actions[group])) {
          addError(errors, `creature.actions.${group}`, "Era esperado uma lista (array).");
        }
      }
      validateAttackEntries(creature.actions.agredir, "creature.actions.agredir");
      validateAbilityEntries(creature.actions.other, "creature.actions.other", { allowStrings: true });
    }
  }
  // skillTests continua sendo aceito para importar fichas feitas com o modelo anterior.
  for (const [index, skillTest] of ensureArray(creature.skillTests).entries()) {
    if (!isObject(skillTest)) { addError(errors, `creature.skillTests[${index}]`, "Era esperado um objeto de teste de perícia."); continue; }
    if (typeof skillTest.name !== "string" || !skillTest.name.trim()) addError(errors, `creature.skillTests[${index}].name`, "Informe o nome da perícia ou teste.");
    if (skillTest.attribute !== undefined && !["agi", "for", "int", "pre", "vig"].includes(skillTest.attribute)) addError(errors, `creature.skillTests[${index}].attribute`, "Use agi, for, int, pre ou vig.");
    if (skillTest.senseUse !== undefined && !["observe", "hear"].includes(skillTest.senseUse)) addError(errors, `creature.skillTests[${index}].senseUse`, 'Use "observe" ou "hear" para testes de Percepção sensoriais.');
    validateRollField(skillTest, "test", `creature.skillTests[${index}]`);
    validateRollField(skillTest, "damage", `creature.skillTests[${index}]`);
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
    if (condition.rules !== undefined && (!Array.isArray(condition.rules) || condition.rules.some((rule) => typeof rule !== "string"))) addError(errors, `state.conditions[${index}].rules`, "Informe uma lista de regras em texto.");
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
  const rawActions = raw.actions;
  const normalizeEntries = (value) => ensureArray(value).map((item) => {
    const entry = typeof item === "string" ? { name: item } : (isObject(item) ? clone(item) : {});
    return { ...entry, id: entry.id || crypto.randomUUID() };
  });
  const normalizedActions = Array.isArray(rawActions)
    ? { agredir: [], other: normalizeEntries(rawActions) }
    : {
        ...(isObject(rawActions) ? clone(rawActions) : {}),
        agredir: normalizeEntries(rawActions?.agredir),
        other: normalizeEntries(rawActions?.other)
      };
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
    ...(Array.isArray(raw.skillTests) ? { skillTests: normalizeEntries(raw.skillTests) } : {}),
    movement: { meters: 0, squares: null, ...(isObject(raw.movement) ? raw.movement : {}) },
    attacks: normalizeEntries(raw.attacks),
    abilities: normalizeEntries(raw.abilities),
    powers: normalizeEntries(raw.powers),
    actions: normalizedActions,
    specialActions: normalizeEntries(raw.specialActions),
    reactions: normalizeEntries(raw.reactions),
    features: ensureArray(raw.features),
    resources: normalizeEntries(raw.resources),
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
    history: ensureArray(incomingState.history).slice(-100),
    rollHistory: ensureArray(incomingState.rollHistory).slice(-100)
  };
  return { id, creature, runtime, createdAt: now, updatedAt: now };
}

export function exportThreatRecord(record) {
  const state = clone(record.runtime);
  // rollHistory é um campo complementar da extensão e só é exportado quando há registros.
  if (!state.rollHistory?.length) delete state.rollHistory;
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    creature: clone(record.creature),
    state
  };
}

export function computeEffectiveStats(record) {
  const { creature, runtime } = record;
  const totals = {
    defense: 0, defenseMelee: 0, defenseRanged: 0, movement: 0, movementMultiplier: 1,
    movementSet: null, attack: 0, damage: 0,
    diceCount: { attack: 0, damage: 0, abilities: 0, attackMelee: 0, attackRanged: 0, attributes: {}, senses: {}, fortitude: 0, reflexes: 0, will: 0 },
    attributes: {}, saves: {}, senses: {}, rules: new Set()
  };
  for (const condition of runtime.conditions ?? []) {
    const mod = condition.modifiers ?? {};
    for (const key of ["defense", "defenseMelee", "defenseRanged", "movement", "attack", "damage", "fortitude", "reflexes", "will", "perception", "initiative"]) {
      if (isNumber(mod[key])) totals[key] += mod[key];
    }
    if (isNumber(mod.movementMultiplier)) totals.movementMultiplier = Math.min(totals.movementMultiplier, mod.movementMultiplier);
    if (isNumber(mod.movementSet)) totals.movementSet = totals.movementSet === null ? mod.movementSet : Math.min(totals.movementSet, mod.movementSet);
    for (const group of ["attributes", "saves", "senses"]) {
      if (isObject(mod[group])) for (const [key, value] of Object.entries(mod[group])) if (isNumber(value)) totals[group][key] = (totals[group][key] ?? 0) + value;
    }
    if (isObject(mod.diceCount)) {
      for (const [key, value] of Object.entries(mod.diceCount)) {
        if (isNumber(value)) totals.diceCount[key] = (totals.diceCount[key] ?? 0) + value;
        else if (["attributes", "senses"].includes(key) && isObject(value)) {
          for (const [nestedKey, nestedValue] of Object.entries(value)) if (isNumber(nestedValue)) {
            totals.diceCount[key][nestedKey] = (totals.diceCount[key][nestedKey] ?? 0) + nestedValue;
          }
        }
      }
    }
    for (const rule of condition.rules ?? []) totals.rules.add(rule);
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
    const diceAdjustment = (totals.diceCount[key] ?? 0) + (totals.diceCount.senses[key] ?? 0);
    senses[key] = { base, value: effectiveExpression(base, bonus, diceAdjustment) };
  }
  const attributes = {};
  for (const key of ["agi", "for", "int", "pre", "vig"]) attributes[key] = { base: creature.attributes?.[key] ?? 0, value: (creature.attributes?.[key] ?? 0) + (totals.attributes[key] ?? 0) };
  const baseMovement = creature.movement?.meters ?? 0;
  let movement = totals.movementSet === null ? baseMovement * totals.movementMultiplier : totals.movementSet;
  if (totals.rules.has("immobile")) movement = 0;
  return {
    defense: { base: creature.defense, value: creature.defense + totals.defense },
    defenseMelee: { base: creature.defense, value: creature.defense + totals.defense + totals.defenseMelee },
    defenseRanged: { base: creature.defense, value: creature.defense + totals.defense + totals.defenseRanged },
    saves, senses, attributes,
    movement: { base: baseMovement, value: Math.max(0, movement) },
    attackBonus: totals.attack, damageBonus: totals.damage,
    diceCount: totals.diceCount, rules: [...totals.rules]
  };
}

export function validateConditionModifiers(modifiers) {
  if (!isObject(modifiers)) throw new Error("Os modificadores devem ser um objeto JSON.");
  const allowed = new Set(["defense", "defenseMelee", "defenseRanged", "movement", "movementMultiplier", "movementSet", "attack", "damage", "fortitude", "reflexes", "will", "perception", "initiative", "attributes", "saves", "senses", "diceCount"]);
  const nestedAllowed = {
    attributes: new Set(["agi", "for", "int", "pre", "vig"]),
    saves: new Set(["fortitude", "reflexes", "will"]),
    senses: new Set(["perception", "initiative"]),
    diceCount: new Set(["attack", "damage", "abilities", "attackMelee", "attackRanged", "fortitude", "reflexes", "will", "perception", "initiative", "attributes", "senses"])
  };
  for (const [key, value] of Object.entries(modifiers)) {
    if (!allowed.has(key)) throw new Error(`Modificador “${key}” não reconhecido.`);
    if (["movementMultiplier"].includes(key) && (!isNumber(value) || value < 0 || value > 1)) throw new Error(`“${key}” precisa ser um número entre 0 e 1.`);
    if (key === "movementSet" && (!isNumber(value) || value < 0)) throw new Error(`“${key}” precisa ser uma distância não negativa.`);
    if (nestedAllowed[key]) {
      if (!isObject(value)) throw new Error(`O modificador “${key}” deve ser um objeto.`);
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        if (!nestedAllowed[key].has(nestedKey)) throw new Error(`Modificador “${key}.${nestedKey}” não reconhecido.`);
        if (key === "diceCount" && ["attributes", "senses"].includes(nestedKey)) {
          if (!isObject(nestedValue)) throw new Error(`“diceCount.${nestedKey}” deve ser um objeto.`);
          const nestedKeys = nestedKey === "attributes" ? new Set(["agi", "for", "int", "pre", "vig"]) : new Set(["perception", "initiative"]);
          for (const [subKey, subValue] of Object.entries(nestedValue)) {
            if (!nestedKeys.has(subKey) || !isNumber(subValue)) throw new Error(`“diceCount.${nestedKey}.${subKey}” precisa ser uma chave válida com valor numérico.`);
          }
        } else if (!isNumber(nestedValue)) throw new Error(`“${key}.${nestedKey}” precisa ser numérico.`);
      }
    } else if (!isNumber(value)) throw new Error(`“${key}” precisa ser numérico.`);
  }
  return true;
}

export function addCondition(record, condition) {
  if (!condition || typeof condition.name !== "string" || !condition.name.trim()) throw new Error("A condição precisa de um nome.");
  validateConditionModifiers(condition.modifiers ?? {});
  const allowedRules = new Set(["immobile", "onlyLightWeapons", "rangedAttackMisfire50", "cannotObserve", "attacksTargetTotalConcealment", "incapacitated", "cannotAct", "cannotReact", "reflexesAutoFail", "cannotHear", "ritualsPoorCondition", "mentalOnly", "resistanceAll10"]);
  const rules = ensureArray(condition.rules);
  for (const rule of rules) if (!allowedRules.has(rule)) throw new Error(`Regra de condição “${rule}” não reconhecida.`);
  const next = clone(record);
  const entry = { id: crypto.randomUUID(), name: condition.name.trim(), group: stringOr(condition.group), duration: stringOr(condition.duration), description: stringOr(condition.description), modifiers: condition.modifiers ?? {}, rules, appliedAt: new Date().toISOString() };
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
  const resistant = operation !== "heal" && computeEffectiveStats(next).rules.includes("resistanceAll10");
  const mitigated = resistant ? Math.min(10, amount) : 0;
  const effectiveAmount = operation === "heal" ? amount : Math.max(0, amount - mitigated);
  next.runtime.hpCurrent = operation === "heal" ? Math.min(next.creature.hp.max, before + effectiveAmount) : Math.max(0, before - effectiveAmount);
  const changed = Math.abs(next.runtime.hpCurrent - before);
  if (operation === "heal" && changed) pushHistory(next, `Recuperou ${changed} PV (${before} → ${next.runtime.hpCurrent}).`);
  else if (operation !== "heal" && amount > 0) {
    const suffix = mitigated ? ` (Resistência 10: ${mitigated} de dano reduzido)` : "";
    pushHistory(next, `Sofreu ${effectiveAmount} dano${suffix} (${before} → ${next.runtime.hpCurrent}).`);
  }
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

export function pushRollHistory(record, title, result) {
  const at = new Date().toISOString();
  const total = ["attack", "ability"].includes(result?.kind) ? (result.test?.total ?? result.damage?.total) : result?.roll?.total ?? result?.total;
  record.runtime.rollHistory = [...(record.runtime.rollHistory ?? []), {
    at, title: String(title || "Rolagem"), kind: result?.kind || "test",
    total: total ?? "—", expression: result?.expression || result?.test?.expression || result?.roll?.expression || "",
    result: clone(result)
  }].slice(-100);
  pushHistory(record, `${title}: ${total ?? "consulta"}.`);
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
