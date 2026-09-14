import { mount } from "svelte";

import { overrideQuality, QUALITY_PRESETS } from "../state/Quality";

import "../tools/lib/theme.css";
import Editor from "./Editor.svelte";

// the tools judge art at full quality whatever the player has chosen in-game
overrideQuality(QUALITY_PRESETS.high);

export default mount(Editor, { target: document.getElementById("app")! });
