/**
 * ⚠️ CRITICAL FILE - REACT APPLICATION ENTRY POINT - DO NOT DELETE ⚠️
 *
 * Main entry point for the Smart CDP Platform React application.
 * This file initializes the React app and mounts it to the DOM.
 *
 * Last Updated: August 11, 2025 - Added critical file annotation
 */
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
