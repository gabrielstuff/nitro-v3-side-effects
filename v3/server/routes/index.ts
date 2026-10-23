import { defineHandler } from "nitro/h3";
import { PLAYER_LABEL } from "../utils/player";

export default defineHandler(() => `hello ${PLAYER_LABEL}`);
