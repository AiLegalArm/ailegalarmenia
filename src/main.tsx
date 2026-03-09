import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config";
import { cleanupStaleLocalStorage } from "./lib/localStorage-utils";

// Clean up stale localStorage entries on app startup
cleanupStaleLocalStorage();

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <App />
  </ThemeProvider>
);
