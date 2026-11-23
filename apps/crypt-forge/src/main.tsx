import { createRoot } from "react-dom/client";
import "specter-ui/theme.css";
import "./app.css";
import { App } from "./App";

// No StrictMode: it mounts effects twice in dev, which would create two WebGL contexts.
createRoot(document.getElementById("root")!).render(<App />);
