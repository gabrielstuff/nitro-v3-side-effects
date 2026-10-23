# Nitro v3 keeps an unused `node_modules` import in the server bundle

**TLDR**

- One app, one preset (`cloudflare_module`), two results:
  - **v2** (`nitropack` 2.13.5): **125 KB**. No `video.js`.
  - **v3** (`nitro` 3.0.260903-beta): **1,825 KB**. Full `video.js` inside.
- **Cause:** Rolldown keeps an unused import if the imported package does not declare `"sideEffects"` in its `package.json`. `video.js` declares nothing. Nitro v3 uses the Rolldown default.
- **Not a regression.** Nitro removed its old tree-shaking override on purpose (PR #4164, 2026-03-29). The old override deleted real side effects and broke apps in production.
- **Fix:** keep browser code out of the server graph. If you cannot, add a filter for the one package. Do **not** restore the v2 behavior.

Verified on 2026-10-23 with `nitro` 3.0.260903-beta, `rolldown` 1.2.15, `nitropack` 2.13.5, `video.js` 8.23.4.

## Result

| Build | Server bundle | `video.js` inside | Open |
|---|---|---|---|
| **v2** (nitropack 2.13.5) | 125 KB | no | [StackBlitz](https://stackblitz.com/github/gabrielstuff/nitro-v3-side-effects/tree/main/v2) |
| **v3** (nitro 3.0.260903-beta) | 1,825 KB | **yes** | [StackBlitz](https://stackblitz.com/github/gabrielstuff/nitro-v3-side-effects/tree/main/v3) |
| **v3-workaround** | 24 KB | no | [StackBlitz](https://stackblitz.com/github/gabrielstuff/nitro-v3-side-effects/tree/main/v3-workaround) |

A fresh build of `v3` gives 1,825 KB. The first report gave 1,819 KB. Expect small drift between installs.

Each folder builds and prints its size: `npm start`.

## The code

```ts
// server/utils/player.ts
import videojs from "video.js"; // browser-only. No "sideEffects" field.
export function mountPlayer(el: HTMLVideoElement) { return videojs(el); } // never called
export const PLAYER_LABEL = "video";

// server/routes/index.ts
import { PLAYER_LABEL } from "../utils/player";
export default defineHandler(() => `hello ${PLAYER_LABEL}`);
```

v3 output, `.output/server/_routes/index.mjs`:

```js
import { require_video_cjs } from "../_libs/video.js+videojs-vtt.js.mjs";
require_video_cjs();
```

The route chunk loads on demand. So this call runs on the first request to `/`.

## How I checked it

I did not trust the first draft. I ran six checks.

1. **Rebuilt all three folders.** The sizes above are real. The first draft was correct on this point.
2. **Read the Nitro source.**
   - v3 has **no** `treeshake` key: `nitro/dist/_build/rolldown.mjs` and `nitro/dist/vite.mjs`.
   - v2 sets one: `nitropack/dist/rollup/index.mjs:1830-1844`.
3. **Tested Rolldown alone, without Nitro.**
   - No `sideEffects` field: the package stays in the output.
   - `"sideEffects": false`: the package is gone.
   - A non-matching `sideEffects` array: the package is gone.
4. **Patched `video.js/package.json` only.** One line (`"sideEffects": false`) and **no** Nitro config: the bundle drops to 24 KB. This proves Rolldown reads the field.
5. **Tested what v2 does to app code.** I added `import "../utils/register"` to the route. The module only sets `globalThis.__registered = true`.
   - **v2 drops the call.** The side effect is gone.
   - **v3 keeps the call.**
6. **Read the Nitro history.** Issue #4085, PR #4164. The change has a reason. See below.

## What the first draft got wrong

- **"Regression."** No. Nitro removed the tree-shaking override on purpose.
- **"v2 made `node_modules` side-effect-free."** No. v2 made **all** modules side-effect-free, your own `server/` code too.
- **"The workaround restores v2 behavior."** No. The workaround keeps app side effects, but drops the side effects of every dependency.
- **"It is only bundle size."** No. The kept import runs on the first request to `/`.

## The cause, in four steps

1. The route imports `PLAYER_LABEL` from `player.ts`.
2. `player.ts` imports `video.js`. No code uses that import.
3. A bundler can drop an unused import. But it must know that the module has no side effects.
4. Rolldown assumes that a module **has** side effects, unless the nearest `package.json` says `"sideEffects": false` (or lists the files that do have them). `video.js` has no `sideEffects` field. So Rolldown keeps the import.

v3 uses this default. v2 overrode it.

This problem is not specific to `video.js`. Any browser-only package without a `sideEffects` field has the same result.

## Why v2 was different

v2 set `treeshake.moduleSideEffects`. That function returned `false` for **all** modules, not only `node_modules`.

Two exceptions:

- the Nitro runtime,
- a short allowlist (`unenv/polyfill/`, `node-fetch-native/polyfill`, `nitropack/dist/runtime/polyfill/`). See `nitropack/dist/core/index.mjs:122`.

So v2 deleted side effects everywhere, including your own `server/` files. That is the bug in Nitro issue #4085: `import '@pothos/plugin-prisma'` vanished from the production build, and the app broke. Dev mode worked.

PR #4164 (2026-03-29) removed the override from every bundler config. It also removed the `moduleSideEffects` option from the config types. The change is a breaking change.

**Do not ask Nitro to restore v2 behavior.** That puts the #4085 bug back.

## What to do

| # | Option | Result | Risk |
|---|---|---|---|
| 1 | Keep browser code out of the server graph. Use a dynamic import inside client-only code. | not measured here | none |
| 2 | Filter the one package. | 32 KB | low |
| 3 | Filter every dependency. This is the `v3-workaround` folder. | 24 KB | medium |
| 4 | Turn off all side effects. | 24 KB | high |

Option 2:

```ts
rolldownConfig: {
  treeshake: { moduleSideEffects: (id: string) => !/node_modules\/(video\.js|@videojs)\//.test(id) },
}
```

Option 3:

```ts
rolldownConfig: {
  treeshake: { moduleSideEffects: (id: string) => !id.includes("/node_modules/") },
}
```

Notes:

- Option 3 keeps app side effects, but drops side effects of every dependency. Packages that register themselves on import lose that code.
- Option 4 also drops app side effects. My test module `register.ts` vanished.
- Put the config under `rolldownConfig`. The Nitro vite builder reads `rolldownConfig` and `rollupConfig` too.

### What does not help

| Change | Result | Why |
|---|---|---|
| `treeshake: true` | 1,825 KB | Same as the default. |
| `moduleSideEffects: "no-external"` | 1,833 KB | `video.js` is bundled, not external. |
| Use the ESM entry (`video.js/dist/video.es.js`) | 1,752 KB | Entry format is not the cause. |

### If you maintain a library

Add `sideEffects` to your `package.json`. Bundlers can then tree-shake your package.

Do not do this for `video.js` by hand. It is a browser library, and it has real side effects. A false value can break the client bundle.

## Terms

- **Bundle:** the output files that run on the server.
- **Side effect:** code that runs when a module loads, with no export used.
- **Tree shaking:** the removal of code that the app never uses.
- **SSR:** server-side rendering. Nuxt removes client-only code, such as `onMounted` bodies. The `import` line stays, and nothing uses it.

## Ask

Document the change in the Nitro v2 to v3 migration guide (`21.migration.md`):

1. Nitro v3 no longer forces `node_modules` modules to be side-effect-free.
2. Users can set `treeshake.moduleSideEffects` in `rolldownConfig` to opt out.

Do not restore the v2 default.
