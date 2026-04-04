import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./style.css";

const mountEl = document.getElementById("root");
ReactDOM.createRoot(mountEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
