import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  resolvePlayerAttempt,
  CHANNEL,
  META_KEY,
  SECRET_PREFIX
} from "../game-logic.js";

const backgroundSource = await readFile(new URL("../background.js", import.meta.url), "utf8");

async function bootBackground({session, secret}) {
  const source = backgroundSource
    .replace(/^import OBR from [^\n]+\n/, "")
    .replace(/^import \{[^\n]+\} from ["']\.\/game-logic\.js["'];?\n/, "");
  const storage = new Map([[SECRET_PREFIX + session.sessionId, JSON.stringify(secret)]]);
  const sent = [];
  let messageHandler = null;
  let readyHandler = null;
  const OBR = {
    isReady: true,
    isAvailable: true,
    onReady(callback) { readyHandler = callback; },
    player: { async getRole() { return "GM"; } },
    broadcast: {
      onMessage(channel, callback) {
        assert.equal(channel, CHANNEL);
        messageHandler = callback;
      },
      async sendMessage(channel, data, options) {
        assert.equal(channel, CHANNEL);
        sent.push({ data, options });
      }
    },
    room: { async getMetadata() { return { [META_KEY]: session }; } },
    notification: { async show() {} },
    action: { async close() {}, async open() {} }
  };
  const windowMock = { __OBR_READY_BUFFER__: null, location: { search: "?obrref=test" }, dispatchEvent() {} };
  class MockMessageEvent {
    constructor(type, options) { this.type = type; this.data = options.data; this.origin = options.origin; }
  }
  const localStorageMock = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); }
  };
  new Function(
    "OBR","window","MessageEvent","URLSearchParams","localStorage",
    "setTimeout","clearTimeout","console","CHANNEL","META_KEY","SECRET_PREFIX","resolvePlayerAttempt",
    source
  )(
    OBR,windowMock,MockMessageEvent,URLSearchParams,localStorageMock,
    setTimeout,clearTimeout,{log(){},warn(){},error(){}},
    CHANNEL,META_KEY,SECRET_PREFIX,resolvePlayerAttempt
  );
  await readyHandler();
  assert.equal(typeof messageHandler,"function","árbitro do mestre precisa assinar o canal");
  return { messageHandler, sent, storage };
}

test("GM responde REMOTE ao jogador e LOCAL à interface do mestre", async () => {
  const session = { status:"active", sessionId:"pin-room", game:"pin" };
  const secret = { game:"pin", code:"2468", finished:false };
  const { messageHandler, sent, storage } = await bootBackground({session,secret});

  messageHandler({
    connectionId:"player-connection-123",
    data:{
      type:"attempt",
      requestId:"request-001",
      sessionId:"pin-room",
      game:"pin",
      kind:"pin",
      code:"2468"
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 25));

  const playerReply = sent.find((entry) => entry.data.type === "result");
  const masterStatus = sent.find((entry) => entry.data.type === "master-status");
  assert.ok(playerReply,"precisa haver resposta para o jogador");
  assert.ok(masterStatus,"precisa haver status para a interface do mestre");
  assert.equal(playerReply.options.destination,"REMOTE");
  assert.equal(playerReply.data.targetConnectionId,"player-connection-123");
  assert.equal(playerReply.data.requestId,"request-001");
  assert.equal(playerReply.data.success,true);
  assert.equal(masterStatus.options.destination,"LOCAL");
  assert.equal(masterStatus.data.playerConnectionId,"player-connection-123");
  assert.equal(masterStatus.data.success,true);
  assert.equal(JSON.parse(storage.get(SECRET_PREFIX+"pin-room")).finished,true);
});

test("tentativa incorreta recebe resposta e aparece no mestre sem encerrar o desafio", async () => {
  const session = { status:"active", sessionId:"pin-room-2", game:"pin" };
  const secret = { game:"pin", code:"2468", finished:false };
  const { messageHandler, sent } = await bootBackground({session,secret});

  messageHandler({
    connectionId:"player-connection-456",
    data:{
      type:"attempt",
      requestId:"request-002",
      sessionId:"pin-room-2",
      game:"pin",
      kind:"pin",
      code:"1111"
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 25));

  const playerReply = sent.find((entry) => entry.data.type === "result");
  const masterStatus = sent.find((entry) => entry.data.type === "master-status");
  assert.equal(playerReply?.data.success,false);
  assert.equal(playerReply?.data.responseText,"Código incorreto.");
  assert.equal(masterStatus?.data.responseText,"Código incorreto.");
  assert.equal(masterStatus?.options.destination,"LOCAL");
  assert.equal(playerReply?.data.requestId,"request-002");
});
