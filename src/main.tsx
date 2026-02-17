import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"

document.documentElement.classList.add("dark")
document.documentElement.style.colorScheme = "dark"

createRoot(document.getElementById("root")!).render(
  <App />
)
