import { mount } from "svelte";

import "../tools/lib/theme.css";
import Editor from "./Editor.svelte";

export default mount(Editor, { target: document.getElementById("app")! });
