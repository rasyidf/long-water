import { mount } from "svelte";

import { overrideQuality, QUALITY_PRESETS } from "../../state/Quality";

import "../lib/theme.css";
import Viewer from "./Viewer.svelte";

// the tools judge art at full quality whatever the player has chosen in-game
overrideQuality(QUALITY_PRESETS.high);

export default mount(Viewer, { target: document.getElementById("app")! });
