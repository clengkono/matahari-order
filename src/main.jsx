import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import CatalogueStudio from "./components/CatalogueStudio.jsx";
import { CartProvider } from "./context/CartContext";

const isStudioRoute =
  window.location.pathname === "/studio" ||
  window.location.pathname.startsWith("/studio/");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isStudioRoute ? (
      <CatalogueStudio />
    ) : (
      <CartProvider>
        <App />
      </CartProvider>
    )}
  </StrictMode>
);
