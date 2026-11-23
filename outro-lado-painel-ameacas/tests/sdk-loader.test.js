import test from "node:test";
import assert from "node:assert/strict";
import { loadOwlbearSDK } from "../src/sdk-loader.js";

const validSdk = {
  onReady() {},
  player: { getRole() {} },
  action: { close() {} }
};
test("usa provedor alternativo quando o primeiro falha com 503", async () => {
  const visited = [];
  const loaded = await loadOwlbearSDK({
    sources: ["https://cdn-a.invalid/sdk", "https://cdn-b.invalid/sdk"],
    importModule: async (url) => {
      visited.push(url);
      if (url.includes("cdn-a")) throw new Error("HTTP 503 Service Unavailable");
      return { default: validSdk };
    },
    timeoutMs: 50
  });
  assert.equal(loaded.OBR, validSdk);
  assert.equal(loaded.source, "https://cdn-b.invalid/sdk");
  assert.equal(loaded.failures.length, 1);
  assert.match(loaded.failures[0].message, /503/);
  assert.deepEqual(visited, ["https://cdn-a.invalid/sdk", "https://cdn-b.invalid/sdk"]);
});

test("rejeita um módulo que não exporta a API Owlbear e segue para o próximo", async () => {
  const loaded = await loadOwlbearSDK({
    sources: ["bad", "good"],
    importModule: async (url) => url === "bad" ? { default: {} } : { default: validSdk },
    timeoutMs: 50
  });
  assert.equal(loaded.source, "good");
  assert.match(loaded.failures[0].message, /API Owlbear válida/);
});

test("produz diagnóstico de todas as origens quando nenhuma responde", async () => {
  await assert.rejects(
    loadOwlbearSDK({
      sources: ["cdn-a", "cdn-b"],
      importModule: async (url) => { throw new Error(`${url} HTTP 503`); },
      timeoutMs: 50
    }),
    (error) => {
      assert.equal(error.name, "OwlbearSDKLoadError");
      assert.equal(error.failures.length, 2);
      assert.match(error.message, /cdn-a: cdn-a HTTP 503/);
      assert.match(error.message, /cdn-b: cdn-b HTTP 503/);
      return true;
    }
  );
});
