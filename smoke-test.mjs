// Smoke test: load the real client.js with a stubbed DSH module system and a
// stubbed Cordis context, then assert the slot registrations and the locale
// dictionaries both happen.
// Run: node smoke-test.mjs
import { readFileSync } from "node:fs";

// Minimal React surface the plugin is allowed to use. This test renders one
// component, so useState/useEffect are functional enough for a single pass.
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
    registered.push({ options, Component });
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
const dictionaries = [];
let activeLocale = "zh";
const fakeLocale = {
  getLocale: () => ({ active: activeLocale, locales: [], revision: 0 }),
  subscribe: () => () => {},
  register(ns, locale, dict) {
    dictionaries.push({ ns, locale, keys: Object.keys(dict).sort() });
    return () => {};
  },
};
const fakeCtx = {
  get(name) {
    if (name === "slots") return fakeSlotService;
    if (name === "sessions") return { binding: () => ({ session: fakeSession }) };
    if (name === "locale") return fakeLocale;
    return undefined;
  },
  effect(fn) {
    fn();
    return () => {};
  },
};

mod.apply(fakeCtx);

const names = registered.map((entry) => entry.options.name).join(", ");
if (!names.includes("conversation.input.left")) throw new Error(`missing composer anchor: ${names}`);
if (!names.includes("settings.general.item")) throw new Error(`missing settings row: ${names}`);
const settingsEntry = registered.find((entry) => entry.options.name === "settings.general.item");
const settings = settingsEntry.options;
if (settings.id !== "queue-first-enter" || settings.order !== 21) {
  throw new Error(`unexpected settings row options: ${JSON.stringify(settings)}`);
}

// Locale: one namespace registered in both shipped locales, same key set.
const locales = dictionaries.map((entry) => entry.locale).sort();
if (locales.join(",") !== "en,zh") {
  throw new Error(`expected zh+en dictionaries, got ${JSON.stringify(dictionaries)}`);
}
const [zh, en] = dictionaries;
if (zh.keys.join(",") !== en.keys.join(",")) {
  throw new Error(`dictionary key sets differ: ${zh.keys} vs ${en.keys}`);
}
if (zh.ns !== "dsh-queue-first-enter") throw new Error(`unexpected namespace: ${zh.ns}`);

// Rendering the row follows the active locale.
function renderTitle() {
  const tree = settingsEntry.Component();
  return tree.children[0].children[0].children;
}
const zhTitle = renderTitle();
activeLocale = "en";
const enTitle = renderTitle();
if (zhTitle === enTitle) throw new Error(`row copy did not follow locale: ${zhTitle}`);
if (!/[\u4e00-\u9fa5]/.test(zhTitle)) throw new Error(`zh title is not Chinese: ${zhTitle}`);
if (/[\u4e00-\u9fa5]/.test(enTitle)) throw new Error(`en title still contains Chinese: ${enTitle}`);

console.log("smoke test OK:", JSON.stringify({
  slots: registered.map((entry) => entry.options),
  dictionaries: dictionaries.map((entry) => `${entry.ns}:${entry.locale}`),
  zhTitle,
  enTitle,
}));
