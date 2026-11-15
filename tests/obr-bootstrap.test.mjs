import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const indexHtml = await read("../index.html");
const backgroundHtml = await read("../background.html");
const appJs = await read("../app.js");
const backgroundJs = await read("../background.js");

test("captura OBR_READY no HTML antes do carregamento do módulo", () => {
  const script = indexHtml.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "script de captura precisa existir no index.html");
  const parent = {};
  const handlers = [];
  const windowMock = {
    parent,
    addEventListener(type, callback) {
      if (type === "message") handlers.push(callback);
    }
  };
  vm.runInNewContext(script, { window: windowMock });
  const message = {
    source: parent,
    origin: "https://www.owlbear.rodeo",
    data: { id: "OBR_READY", data: { userId: "player", ref: "nonce" } }
  };
  for (const handler of handlers) handler(message);
  assert.equal(windowMock.__OBR_READY_BUFFER__.data.id, "OBR_READY");
  assert.equal(windowMock.__OBR_READY_BUFFER__.origin, message.origin);
  assert.equal(windowMock.__OBR_READY_BUFFER__.replayed, false);
});

test("ignora mensagens que não sejam o handshake do parent", () => {
  const script = indexHtml.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  const parent = {};
  const handlers = [];
  const windowMock = {
    parent,
    addEventListener(type, callback) {
      if (type === "message") handlers.push(callback);
    }
  };
  vm.runInNewContext(script, { window: windowMock });
  for (const message of [
    { source: parent, origin: "https://www.owlbear.rodeo", data: { id: "OTHER" } },
    { source: {}, origin: "https://www.owlbear.rodeo", data: { id: "OBR_READY" } }
  ]) for (const handler of handlers) handler(message);
  assert.equal(windowMock.__OBR_READY_BUFFER__, null);
});

test("reentrega OBR_READY ao SDK uma única vez depois do import", () => {
  const replayCode = appJs.match(/function replayBufferedOwlbearReady\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(replayCode, "função de replay precisa existir em app.js");
  const parent = {};
  const listeners = [];
  const windowMock = {
    __OBR_READY_BUFFER__: {
      data: { id: "OBR_READY", data: { userId: "player", ref: "nonce" } },
      origin: "https://www.owlbear.rodeo",
      replayed: false
    },
    addEventListener(type, callback) {
      if (type === "message") listeners.push(callback);
    },
    dispatchEvent(event) {
      for (const callback of listeners) callback(event);
      return true;
    }
  };
  let received = 0;
  windowMock.addEventListener("message", (event) => {
    if (event.origin === "https://www.owlbear.rodeo" && event.data?.id === "OBR_READY") received += 1;
  });
  class MockMessageEvent {
    constructor(type, options) {
      this.type = type;
      this.data = options.data;
      this.origin = options.origin;
    }
  }
  vm.runInNewContext(
    replayCode + "\nreplayBufferedOwlbearReady();\nreplayBufferedOwlbearReady();",
    { OBR: { isReady: false }, window: windowMock, MessageEvent: MockMessageEvent }
  );
  assert.equal(received, 1);
  assert.equal(windowMock.__OBR_READY_BUFFER__.replayed, true);
});

test("ambas as páginas usam import estático do SDK 3.1.0", () => {
  const expected = /^import OBR from "https:\/\/cdn\.jsdelivr\.net\/npm\/@owlbear-rodeo\/sdk@3\.1\.0\/\+esm";/m;
  assert.match(appJs, expected);
  assert.match(backgroundJs, expected);
  assert.doesNotMatch(appJs, /import\s*\(/);
  assert.doesNotMatch(backgroundJs, /import\s*\(/);
  assert.match(backgroundHtml, /window\.__OBR_READY_BUFFER__/);
});

test("OBR.onReady executa depois que o evento buffered é reproduzido", () => {
  const replayCode = appJs.match(/function replayBufferedOwlbearReady\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(replayCode);
  const listeners = [];
  const windowMock = {
    __OBR_READY_BUFFER__: {
      data: { id: "OBR_READY", data: { userId: "gm", ref: "nonce" } },
      origin: "https://www.owlbear.rodeo",
      replayed: false
    },
    addEventListener(type, callback) {
      if (type === "message") listeners.push(callback);
    },
    dispatchEvent(event) {
      for (const callback of listeners) callback(event);
      return true;
    }
  };
  let sdkReady = false;
  windowMock.addEventListener("message", (event) => {
    if (event.origin === "https://www.owlbear.rodeo" && event.data?.id === "OBR_READY") sdkReady = true;
  });
  class MockMessageEvent {
    constructor(type, options) {
      this.type = type;
      this.data = options.data;
      this.origin = options.origin;
    }
  }
  vm.runInNewContext(replayCode + "\nreplayBufferedOwlbearReady();", {
    OBR: { isReady: false },
    window: windowMock,
    MessageEvent: MockMessageEvent
  });
  let readyCallbackRan = false;
  const onReady = (callback) => {
    if (sdkReady) callback();
  };
  onReady(() => { readyCallbackRan = true; });
  assert.equal(readyCallbackRan, true);
});
