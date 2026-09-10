import { mount } from "svelte";

import "../lib/theme.css";
import Viewer from "./Viewer.svelte";

export default mount(Viewer, { target: document.getElementById("app")! });
