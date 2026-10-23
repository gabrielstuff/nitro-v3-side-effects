# Nitro v3 bundles unused `node_modules` imports (v2 didn't)

Same app, same preset (`cloudflare_module`). Each StackBlitz builds on start and prints the bundle size.

| | Server bundle | video.js bundled | Open |
|---|---|---|---|
| **v2**: nitropack 2.13.5 | 125 KB | no | [StackBlitz](https://stackblitz.com/github/gabrielstuff/nitro-v3-side-effects/tree/main/v2) |
| **v3**: nitro 3.0.260903-beta | **1,819 KB** | **YES** | [StackBlitz](https://stackblitz.com/github/gabrielstuff/nitro-v3-side-effects/tree/main/v3) |
| **v3-workaround** | 23 KB | no | [StackBlitz](https://stackblitz.com/github/gabrielstuff/nitro-v3-side-effects/tree/main/v3-workaround) |

## Code

```ts
// server/utils/player.ts
import videojs from "video.js"; // browser-only, no "sideEffects" field
export function mountPlayer(el: HTMLVideoElement) { return videojs(el); } // never called
export const PLAYER_LABEL = "video";

// server/routes/index.ts
import { PLAYER_LABEL } from "../utils/player";
export default defineHandler(() => `hello ${PLAYER_LABEL}`);
```

v3 output (`.output/server/_routes/index.mjs`):

```js
import { require_video_cjs } from "../_libs/video.js+videojs-vtt.js.mjs";
require_video_cjs();
```

The ESM entry (`video.js/dist/video.es.js`) gives the same result: `import "../_libs/video.js+…"`, 1,746 KB.

## Cause

- **v2**: `treeshake.moduleSideEffects` returns `false` for `node_modules` (except `nitro.options.moduleSideEffects` polyfills). See `nitropack/dist/rollup/index.mjs`.
- **v3**: no override. Rolldown's default treats packages without `"sideEffects": false` as side-effectful.

## Real-world impact (Nuxt 5)

Nuxt strips `onMounted` from the SSR build, which leaves a bare `import "video.js"`. v2 dropped it, v3 keeps it. Our Cloudflare Worker: **2.7 MB → 4.2 MB gzip**. `experimental.nitroViteEnvironment: false` doesn't help.

## Workaround

```ts
rolldownConfig: {
  treeshake: { moduleSideEffects: (id) => !id.includes("/node_modules/") },
}
```

## Ask

Restore v2's default in v3, or document the change in the migration guide.
