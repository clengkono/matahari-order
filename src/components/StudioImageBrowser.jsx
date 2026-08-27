import { useEffect, useMemo, useRef, useState } from "react";
import StudioImagePanel from "./StudioImagePanel";
import {
  STUDIO_IMAGE_PAGE_SIZE,
  filterStudioImageProducts,
  missingNeighbors,
} from "../utils/studioImageSearch";

function StudioImageBrowser({
  products,
  categories = [],
  recentProductIds = [],
  selectedId,
  onSelect,
  onSaved,
  searchRef,
  apiRef,
  defaultStatus = "all",
  heading = "Search products",
  showQueueNav = false,
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(defaultStatus);
  const [category, setCategory] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef(null);

  const filtered = useMemo(
    () =>
      filterStudioImageProducts(products, {
        query,
        status,
        category,
        recentIds: recentProductIds,
      }),
    [products, query, status, category, recentProductIds]
  );

  const results = filtered.slice(0, STUDIO_IMAGE_PAGE_SIZE);
  const hiddenCount = Math.max(0, filtered.length - results.length);
  const safeHighlight =
    results.length === 0 ? 0 : Math.min(highlight, results.length - 1);
  const selected = products.find((product) => product.id === selectedId) ?? null;
  const neighbors = missingNeighbors(products, selectedId);

  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [safeHighlight, results]);

  useEffect(() => {
    if (!apiRef) {
      return undefined;
    }

    apiRef.current = {
      goPrevious() {
        if (neighbors.previousId) {
          onSelect(neighbors.previousId);
        }
      },
      goNext() {
        if (neighbors.nextId) {
          onSelect(neighbors.nextId);
        }
      },
    };

    return () => {
      apiRef.current = null;
    };
  });

  function handleSearchKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) =>
        results.length === 0 ? 0 : Math.min(current + 1, results.length - 1)
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const choice = results[safeHighlight];
      if (choice) {
        onSelect(choice.id);
      }
    }
  }

  function handleSaved(result) {
    if (showQueueNav && result?.productId) {
      const remaining = products.filter(
        (product) => product.id !== result.productId && !product.hasImage
      );
      onSaved?.({
        ...result,
        selectProductId: remaining[0]?.id ?? result.productId,
      });
      return;
    }

    onSaved?.(result);
  }

  return (
    <div className="studioTabLayout">
      <aside className="studioSidebar">
        <label className="studioSearchLabel" htmlFor="studio-image-search">
          {heading}
        </label>
        <input
          id="studio-image-search"
          ref={searchRef}
          className="studioSearch"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder="Name, alias, ID, or POS…"
          autoComplete="off"
        />

        <div className="studioFilterRow">
          <label className="studioFilterLabel" htmlFor="studio-image-status">
            Image
          </label>
          <select
            id="studio-image-status"
            className="studioFilterSelect"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setHighlight(0);
            }}
          >
            <option value="all">All</option>
            <option value="missing">Missing image</option>
            <option value="has">Has image</option>
            {recentProductIds.length > 0 ? (
              <option value="recent">Recently updated</option>
            ) : null}
          </select>
        </div>

        <div className="studioFilterRow">
          <label className="studioFilterLabel" htmlFor="studio-image-category">
            Category
          </label>
          <select
            id="studio-image-category"
            className="studioFilterSelect"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setHighlight(0);
            }}
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <p className="studioFilterCount">
          {filtered.length === 1
            ? "1 product"
            : `${filtered.length} products`}
          {hiddenCount > 0 ? ` · showing first ${results.length}` : ""}
        </p>

        <ul className="studioResultList" ref={listRef} role="listbox" aria-label="Search results">
          {results.length === 0 ? (
            <li className="studioResultEmpty">No matching products.</li>
          ) : (
            results.map((product, index) => {
              const isHighlighted = index === safeHighlight;
              const isSelected = product.id === selectedId;
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-active={isHighlighted ? "true" : "false"}
                    className={`studioResultButton${isSelected ? " is-selected" : ""}${isHighlighted ? " is-highlighted" : ""}`}
                    onClick={() => onSelect(product.id)}
                    onMouseEnter={() => setHighlight(index)}
                  >
                    <span className="studioResultCopy">
                      <span className="studioResultName">{product.name}</span>
                      <span className="studioResultMeta">{product.category}</span>
                    </span>
                    <span
                      className={`studioResultBadge${product.hasImage ? " is-done" : " is-missing"}`}
                    >
                      {product.hasImage ? "Done" : "Missing"}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      <StudioImagePanel
        key={selected?.id ?? "none"}
        product={selected}
        onSaved={handleSaved}
        neighbors={showQueueNav ? neighbors : null}
        onSelectNeighbor={showQueueNav ? onSelect : null}
      />
    </div>
  );
}

export default StudioImageBrowser;
