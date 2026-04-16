import { render } from "preact";
import { App } from "./App";
import { applyPlatformClass } from "./platform";
import "./index.css";

applyPlatformClass();

render(<App />, document.getElementById("app")!);
