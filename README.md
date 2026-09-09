# dsh-queue-first-enter

English | [中文](README.zh.md)

A DeepSeek Harness (dsh) Web plugin: **with an empty composer, pressing Enter immediately steers the first queued message into the running turn.**

While an agent is busy, the composer's Enter key queues the next message. A queued message normally waits for the current turn to end. This plugin adds one gesture: clear the composer, press Enter, and the **first** queued message is steered into the running turn at its next step boundary — the rest of the queue keeps its order.

![Settings row](assets/screenshot-settings.png)

## Install

```sh
dsh plugin --profile web add dsh-queue-first-enter
```

Then restart `dsh web`.

Installing from a checkout instead:

```sh
dsh plugin --profile web add /path/to/dsh-queue-first-enter
```

Requires `dsh web` 0.1.0-rc.6 or newer. The browser half is a `dsh.client` bundle (`platform: web`); the host half contributes no behavior and exists so the package is a normal installable plugin row.

## Behavior

The gesture fires only when **all** of these hold:

- the composer is empty — no text and no pending images;
- the addressed agent is running (a turn is in progress);
- the queue holds at least one item with placement `queued`;
- the composer is enabled, and the session is an ordinary session (not a subagent).

Everything else is left untouched:

- Enter with text or images behaves exactly as before (queue or direct send);
- `Ctrl`/`Cmd`+`Enter` keeps its built-in meaning — steer **all** queued messages;
- when the feature is switched off in Settings, an empty Enter is a no-op again, as shipped.

Delivery is a strict steer: the message is handed to the running turn at its next step boundary and is visible to the model then. It does **not** interrupt the current turn, and it does not wait for the turn to end. dsh's queue API offers exactly three operations — edit, remove, steer — so "skip the current turn and start a new one" is not something this plugin does; interrupting a turn is a separate, destructive action (`cancel` with the inbox preserved).

Convergence: if the turn ends in the same instant (`steer-unavailable`) or the agent has already claimed the item (`queue-item-not-found`), the failure is silent and the message stays in the queue.

## Settings

**Settings → General → "回车立即发送队列首条"** — a switch directly below dsh's own "繁忙时 Enter 键行为" row.

The preference lives in browser `localStorage` under `dsh.queueFirstEnter.enabled` (default: on).

## How it works

| File | Role |
| --- | --- |
| `index.js` | Host half. Contributes no host behavior; exists so the package is mountable. |
| `client.js` | Browser half. Registers the composer listener and the settings row through the client slot system. |
| `cordis.patch.yml` | Inserts the host row into the profile's layer stack. |
| `smoke-test.mjs` | Loads `client.js` against a stubbed module system and Cordis context, then asserts both slot registrations. |

The listener is attached in the capture phase to the composer's own `textarea`, located by walking up from the plugin's own anchor element inside the composer card — no product CSS class or absolute DOM path is used. It reads the authoritative `session/queue` snapshot and calls the existing `updateQueue(itemId, { kind: 'steer' })` RPC; it does not send prompts of its own, does not touch the network, and stores nothing beyond the on/off flag.

The screenshot above is rendered from `screenshots/settings-mockup.html`, a static mock of the Settings → General panel that reuses the shipped row geometry and the plugin's own inline styles. Open it in a browser to see exactly what the row renders.

```sh
npm test          # node smoke-test.mjs
npm run check     # node --check on both halves
```

## License

MIT
