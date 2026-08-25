import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { CartProvider } from "./context/CartContext";

const CatalogueStudio = lazy(() => import("./components/CatalogueStudio.jsx"));

const isStudioRoute =
  window.location.pathname === "/studio" ||
  window.location.pathname.startsWith("/studio/");

function Root() {
  if (isStudioRoute) {
    return (
      <Suspense fallback={null}>
        <CatalogueStudio />
      </Suspense>
    );
  }

  return (
    <CartProvider>
      <App />
    </CartProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

export default Root;
