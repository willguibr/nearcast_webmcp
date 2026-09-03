import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallback={(e) => <div style={{ padding: 24, fontFamily: "system-ui" }}><h1>Nearcast could not start</h1><p>{e.message}</p><p>Please try a current version of Chrome, Edge, Firefox or Safari.</p></div>}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
