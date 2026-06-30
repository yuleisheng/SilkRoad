import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { installMockApiIfNeeded } from "./mock-api";
import "./styles/app.css";

installMockApiIfNeeded();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
