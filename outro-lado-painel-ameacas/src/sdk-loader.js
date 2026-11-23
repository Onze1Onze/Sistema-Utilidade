const DEFAULT_SDK_SOURCES = Object.freeze([
  "https://esm.sh/@owlbear-rodeo/sdk@3.1.0?bundle",
  "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm",
  "https://cdn.skypack.dev/@owlbear-rodeo/sdk@3.1.0"
]);

function withTimeout(promise, timeoutMs, source) {
  let timeoutId;
  const setTimer = typeof window !== "undefined" ? window.setTimeout.bind(window) : setTimeout;
  const clearTimer = typeof window !== "undefined" ? window.clearTimeout.bind(window) : clearTimeout;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimer(() => {
      reject(new Error(`Tempo limite de ${timeoutMs} ms excedido ao carregar ${source}`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimer(timeoutId));
}

function resolveSdkModule(module, source) {
  const OBR = module?.default ?? module?.OBR ?? module;
  if (!OBR || typeof OBR.onReady !== "function" || typeof OBR.player?.getRole !== "function" || typeof OBR.action?.close !== "function") {
    throw new Error(`O módulo carregado de ${source} não exportou uma API Owlbear válida.`);
  }
  return OBR;
}

/**
 * Carrega o SDK oficial do Owlbear com fallback entre provedores independentes.
 * O callback importModule é injetável para permitir testes sem rede.
 */
export async function loadOwlbearSDK({
  sources = DEFAULT_SDK_SOURCES,
  importModule = (url) => import(url),
  timeoutMs = 12000
} = {}) {
  const failures = [];
  for (const source of sources) {
    try {
      const module = await withTimeout(importModule(source), timeoutMs, source);
      return { OBR: resolveSdkModule(module, source), source, failures };
    } catch (error) {
      failures.push({ source, message: error?.message ?? String(error) });
    }
  }
  const details = failures.map((failure) => `• ${failure.source}: ${failure.message}`).join("\n");
  const error = new Error(`Não foi possível carregar o SDK oficial do Owlbear por nenhuma origem.\n${details}`);
  error.name = "OwlbearSDKLoadError";
  error.failures = failures;
  throw error;
}

export { DEFAULT_SDK_SOURCES };
