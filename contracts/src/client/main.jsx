import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import "./client.css";
import ClientApp from "./ClientApp.jsx";
import { applyLang } from "@/i18n";

applyLang();

ReactDOM.createRoot(document.getElementById("root")).render(<ClientApp />);
