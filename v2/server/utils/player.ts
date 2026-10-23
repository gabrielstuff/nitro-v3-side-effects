// A browser-only library, used only by a function the server never calls.
// (In Nuxt this is what SSR leaves behind after it strips onMounted bodies.)
import videojs from "video.js";

export function mountPlayer(el: HTMLVideoElement) {
  return videojs(el);
}

export const PLAYER_LABEL = "video";
