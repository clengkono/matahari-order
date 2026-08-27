import { useCallback, useEffect, useRef, useState } from "react";
import StudioImagesTab from "./StudioImagesTab";
import StudioProductsTab from "./StudioProductsTab";
import StudioQueueTab from "./StudioQueueTab";
import { fetchStudioImages } from "../utils/studioApi";
import { isStudioTypingTarget } from "../utils/studioImageSearch";
import "../CatalogueStudio.css";

const TABS = [
  { id: "queue", label: "Queue" },
  { id: "images", label: "Images" },
  { id: "products", label: "Products" },
];

function CatalogueStudio() {
  const [tab, setTab] = useState("queue");
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recentProductIds, setRecentProductIds] = useState([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, missing: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadNonce, setLoadNonce] = useState(0);
  const [notice, setNotice] = useState(null);
  const searchRef = useRef(null);
  const queueSearchRef = useRef(null);
  const productsSearchRef = useRef(null);
  const queueApiRef = useRef(null);

  const applyCatalogue = useCallback((data) => {
    setProducts(data.products || []);
    setCategories(data.categories || []);
    setRecentProductIds(data.recentProductIds || []);
    setStats(data.stats || { total: 0, completed: 0, missing: 0 });
    setSelectedId((current) => {
      if (current && data.products?.some((product) => product.id === current)) {
        return current;
      }
      return (
        data.products?.find((product) => !product.hasImage)?.id ??
        data.products?.[0]?.id ??
        null
      );
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchStudioImages();
      applyCatalogue(data);
      setLoadError("");
      return data;
    } catch (error) {
      setLoadError(
        error.message ||
          "Could not reach the local image service. Run npm run studio."
      );
      throw error;
    }
  }, [applyCatalogue]);

  useEffect(() => {
    let cancelled = false;

    fetchStudioImages()
      .then((data) => {
        if (cancelled) {
          return;
        }
        applyCatalogue(data);
        setLoadError("");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setLoadError(
          error.message ||
            "Could not reach the local image service. Run npm run studio."
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applyCatalogue, loadNonce]);

  useEffect(() => {
    document.title = "Matahari Catalogue Studio";
  }, []);

  const handleRetry = useCallback(() => {
    setLoading(true);
    setLoadError("");
    setLoadNonce((value) => value + 1);
  }, []);

  const handleSaved = useCallback(
    async (result) => {
      await refresh();
      if (result?.notice) {
        setNotice({
          text: result.notice,
          tone: result.noticeTone || "success",
        });
      }
      if (result?.selectProductId) {
        setSelectedId(result.selectProductId);
      } else if (result?.productId) {
        setSelectedId(result.productId);
      }
    },
    [refresh]
  );

  useEffect(() => {
    if (!notice || notice.tone === "warning") {
      return undefined;
    }
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    function onKeyDown(event) {
      const key = event.key.toLowerCase();
      const hasCtrl = event.ctrlKey || event.metaKey;
      const typing = isStudioTypingTarget(event.target);

      if (event.key === "/" && !typing && !hasCtrl) {
        event.preventDefault();
        const target =
          tab === "products"
            ? productsSearchRef.current
            : tab === "images"
              ? searchRef.current
              : queueSearchRef.current;
        requestAnimationFrame(() => {
          target?.focus();
          target?.select?.();
        });
        return;
      }

      if (hasCtrl && key === "f") {
        event.preventDefault();
        if (tab === "products") {
          requestAnimationFrame(() => {
            productsSearchRef.current?.focus();
            productsSearchRef.current?.select?.();
          });
          return;
        }

        if (tab === "queue") {
          requestAnimationFrame(() => {
            queueSearchRef.current?.focus();
            queueSearchRef.current?.select?.();
          });
          return;
        }

        requestAnimationFrame(() => {
          searchRef.current?.focus();
          searchRef.current?.select?.();
        });
        return;
      }

      if (
        tab === "queue" &&
        !typing &&
        !document.querySelector(".studioConfirm")
      ) {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          queueApiRef.current?.goPrevious();
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          queueApiRef.current?.goNext();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [tab]);

  return (
    <div className="studioApp">
      <header className="studioHeader">
        <div className="studioHeaderText">
          <h1>Matahari Catalogue Studio</h1>
          <p className="studioSubtitle">Local development tool</p>
        </div>

        <div className="studioStats" aria-live="polite">
          <div className="studioStat">
            <span className="studioStatValue">{stats.total}</span>
            <span className="studioStatLabel">Products</span>
          </div>
          <div className="studioStat">
            <span className="studioStatValue">{stats.completed}</span>
            <span className="studioStatLabel">Completed images</span>
          </div>
          <div className="studioStat">
            <span className="studioStatValue">{stats.missing}</span>
            <span className="studioStatLabel">Missing images</span>
          </div>
        </div>
      </header>

      <div className="studioWarning" role="status">
        LOCAL ONLY — This Studio and its image service bind to 127.0.0.1 and must
        not be publicly deployed as-is. There is no authentication in Version 1.
      </div>

      {notice ? (
        <p
          className={`studioInlineStatus${notice.tone === "warning" ? " is-error" : " is-success"}`}
          role={notice.tone === "warning" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      ) : null}

      <nav className="studioTabs" aria-label="Studio sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`studioTab${tab === item.id ? " is-active" : ""}`}
            onClick={() => {
              setTab(item.id);
              if (item.id === "queue") {
                setSelectedId((current) => {
                  const selected = products.find(
                    (product) => product.id === current
                  );
                  if (selected && !selected.hasImage) {
                    return current;
                  }
                  return (
                    products.find((product) => !product.hasImage)?.id ?? current
                  );
                });
              }
            }}
            aria-current={tab === item.id ? "page" : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <main className="studioMain">
        {tab === "products" ? (
          <StudioProductsTab
            searchRef={productsSearchRef}
            onCatalogueChanged={refresh}
          />
        ) : null}

        {tab !== "products" && loading ? (
          <p className="studioStatus">Loading catalogue…</p>
        ) : null}
        {tab !== "products" && !loading && loadError ? (
          <div className="studioError" role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              className="studioButton studioButton--secondary"
              onClick={handleRetry}
            >
              Retry
            </button>
          </div>
        ) : null}

        {tab !== "products" && !loading && !loadError && tab === "images" ? (
          <StudioImagesTab
            products={products}
            categories={categories}
            recentProductIds={recentProductIds}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onSaved={handleSaved}
            searchRef={searchRef}
          />
        ) : null}

        {tab !== "products" && !loading && !loadError && tab === "queue" ? (
          <StudioQueueTab
            products={products}
            categories={categories}
            recentProductIds={recentProductIds}
            stats={stats}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onSaved={handleSaved}
            searchRef={queueSearchRef}
            apiRef={queueApiRef}
          />
        ) : null}
      </main>
    </div>
  );
}

export default CatalogueStudio;
