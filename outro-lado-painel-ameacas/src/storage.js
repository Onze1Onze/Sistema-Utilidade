const DB_NAME = "outro-lado-painel-ameacas-private-v1";
const STORE_NAME = "threats";
const FALLBACK_KEY = "outro-lado-painel-ameacas:private:v1";

export class ThreatStore {
  constructor() { this.db = null; this.fallback = false; }

  async open() {
    if (typeof indexedDB === "undefined") { this.fallback = true; return this; }
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Falha ao abrir o banco local."));
      request.onblocked = () => reject(new Error("O banco local está bloqueado por outra aba."));
    }).catch(() => { this.fallback = true; return null; });
    return this;
  }

  async list() {
    if (this.fallback || !this.db) return this.#readFallback();
    return this.#request("readonly", (store) => store.getAll());
  }

  async put(record) {
    if (this.fallback || !this.db) {
      const all = await this.#readFallback();
      const index = all.findIndex((item) => item.id === record.id);
      if (index >= 0) all[index] = record; else all.push(record);
      this.#writeFallback(all);
      return record;
    }
    await this.#request("readwrite", (store) => store.put(record));
    return record;
  }

  async delete(id) {
    if (this.fallback || !this.db) {
      this.#writeFallback((await this.#readFallback()).filter((item) => item.id !== id));
      return;
    }
    await this.#request("readwrite", (store) => store.delete(id));
  }

  async clear() {
    if (this.fallback || !this.db) { this.#writeFallback([]); return; }
    await this.#request("readwrite", (store) => store.clear());
  }

  async #request(mode, operation) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error ?? request?.error ?? new Error("Falha no armazenamento local."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Operação local cancelada."));
    });
  }

  async #readFallback() {
    try { return JSON.parse(localStorage.getItem(FALLBACK_KEY) || "[]"); }
    catch { return []; }
  }

  #writeFallback(value) {
    try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(value)); }
    catch { throw new Error("Não foi possível salvar os dados localmente. Verifique o espaço disponível no navegador."); }
  }
}
