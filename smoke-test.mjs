// Smoke test: load the real client.js with a stubbed DSH module system and a
// stubbed Cordis context, then assert both slot registrations happen.
// Run: node smoke-test.mjs
import { readFileSync } from "node:fs";

// Minimal React surface the plugin is allowed to use. The test never renders,
// so hooks only need to exist.
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useRef: () => ({ current: null }),
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
};

let captured = null;
globalThis.window = {
  __ModuleLoader__: {
    load(def) {
      captured = def;
    },
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
  },
};

new Function(readFileSync(new URL("./client.js", import.meta.url), "utf8"))();

if (captured === null) throw new Error("client.js did not register with __ModuleLoader__");
if (captured.id !== "dsh-queue-first-enter") throw new Error(`unexpected id: ${captured.id}`);

const mod = captured.factory((spec) => {
  if (spec === "react") return React;
  throw new Error(`unexpected require("${spec}")`);
});

if (typeof mod.apply !== "function") throw new Error("exports.apply missing");
if (!Array.isArray(mod.inject)) throw new Error("exports.inject missing");

const registered = [];
const fakeSlotService = {
  register(options, Component) {
    registered.push(options);
    return () => {};
  },
  inject(name, callback) {
    callback();
    return () => {};
  },
};
const fakeSession = {
  getSnapshot: () => ({ queue: [], running: false }),
  updateQueue: async () => ({ ok: true }),
};
const fakeCtx = {
  get(name) {
    if (name === "slots") return fakeSlotService;
    if (name === "sessions") return { binding: () => ({ session: fakeSession }) };
    if (name === "styles") return { insert: () => () => {} };
    return undefined;
  },
  effect(fn) {
    fn();
    return () => {};
  },
};

mod.apply(fakeCtx);

const names = registered.map((options) => options.name).join(", ");
if (!names.includes("conversation.input.left")) throw new Error(`missing composer anchor: ${names}`);
if (!names.includes("settings.general.item")) throw new Error(`missing settings row: ${names}`);
const settings = registered.find((options) => options.name === "settings.general.item");
if (settings.id !== "queue-first-enter" || settings.order !== 21) {
  throw new Error(`unexpected settings row options: ${JSON.stringify(settings)}`);
}

console.log("smoke test OK:", JSON.stringify(registered));
