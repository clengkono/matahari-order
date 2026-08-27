import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const CatalogueStudio = lazy(() => import("./components/CatalogueStudio.jsx"));
const CustomerRoot = lazy(() => import("./CustomerRoot.jsx"));

const isStudioRoute =
  window.location.pathname === "/studio" ||
  window.location.pathname.startsWith("/studio/");

function BootFallback({ label }) {
  return (
    <p className="bootFallback" role="status">
      {label}
    </p>
  );
}

function Root() {
  if (isStudioRoute) {
    return (
      <Suspense fallback={<BootFallback label="Memuat Catalogue Studio…" />}>
        <CatalogueStudio />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<BootFallback label="Memuat Matahari Order…" />}>
      <CustomerRoot />
    </Suspense>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

export default Root;
