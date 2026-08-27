import { useEffect, useMemo, useRef, useState } from "react";
import StudioImagePanel from "./StudioImagePanel";
import {
  STUDIO_IMAGE_PAGE_SIZE,
  continueWhereLeftOff,
  filterStudioImageProducts,
  nextProductAfterSave,
  queueNeighbors,
  selectionForFilter,
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
  showResume = false,
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(defaultStatus);
  const [category, setCategory] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [visibleCount, setVisibleCount] = useState(STUDIO_IMAGE_PAGE_SIZE);
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

  const results = filtered.slice(0, visibleCount);
  const hiddenCount = Math.max(0, filtered.length - results.length);
  const safeHighlight =
    results.length === 0 ? 0 : Math.min(highlight, results.length - 1);
  const selected = products.find((product) => product.id === selectedId) ?? null;
  const neighbors = queueNeighbors(filtered, selectedId);
  const selectedHiddenByFilter =
    Boolean(selectedId) &&
    filtered.length > 0 &&
    !filtered.some((product) => product.id === selectedId);

  useEffect(() => {
    const next = selectionForFilter(filtered, selectedId);
    if (next.id && next.id !== selectedId && filtered.length > 0) {
      onSelect(next.id);
    }
    // Snap only when the owner changes search/filters, not after a catalogue refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category, query]);

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
    const canAdvance =
      showQueueNav &&
      result?.productId &&
      result.removed !== true &&
      result.regenerated !== true &&
      result.customerCatalog?.ok !== false;

    if (!canAdvance) {
      onSaved?.(result);
      return;
    }

    const nextInFilter = nextProductAfterSave(filtered, result.productId);
    if (nextInFilter) {
      onSaved?.({
        ...result,
        selectProductId: nextInFilter,
        focusDropzone: true,
      });
      return;
    }

    const withoutQuery = filterStudioImageProducts(products, {
      query: "",
      status,
      category,
      recentIds: recentProductIds,
    });
    const nextWider = nextProductAfterSave(withoutQuery, result.productId);
    if (query) {
      setQuery("");
      setHighlight(0);
      setVisibleCount(STUDIO_IMAGE_PAGE_SIZE);
    }
    onSaved?.({
      ...result,
      selectProductId: nextWider ?? result.productId,
      focusDropzone: true,
    });
  }

  function handleResume() {
    const nextId = continueWhereLeftOff(products, recentProductIds);
    if (nextId) {
      setStatus("missing");
      setQuery("");
      setCategory("");
      setHighlight(0);
      setVisibleCount(STUDIO_IMAGE_PAGE_SIZE);
      onSelect(nextId);
    }
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
            setVisibleCount(STUDIO_IMAGE_PAGE_SIZE);
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
              setVisibleCount(STUDIO_IMAGE_PAGE_SIZE);
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
              setVisibleCount(STUDIO_IMAGE_PAGE_SIZE);
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

        {showResume && recentProductIds.length > 0 ? (
          <button
            type="button"
            className="studioButton studioButton--ghost studioResumeButton"
            onClick={handleResume}
          >
            Continue where I left off
          </button>
        ) : null}

        <p className="studioFilterCount">
          {filtered.length === 1
            ? "1 product"
            : `${filtered.length} products`}
          {hiddenCount > 0 ? ` · showing ${results.length}` : ""}
        </p>
        <p className="studioShortcutHint">
          / search · ← → next missing · Ctrl+V paste
        </p>

        {selectedHiddenByFilter ? (
          <p className="studioFilterStale" role="status">
            Selected product is outside this filter. Showing the first match.
          </p>
        ) : null}
        {filtered.length === 0 && selected ? (
          <p className="studioFilterStale" role="status">
            No matches in this filter. The selected product is still open.
          </p>
        ) : null}

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
        {hiddenCount > 0 ? (
          <button
            type="button"
            className="studioButton studioButton--secondary studioMoreButton"
            onClick={() =>
              setVisibleCount((current) => current + STUDIO_IMAGE_PAGE_SIZE)
            }
          >
            Show {Math.min(STUDIO_IMAGE_PAGE_SIZE, hiddenCount)} more
          </button>
        ) : null}
      </aside>

      <StudioImagePanel
        key={selected?.id ?? "none"}
        product={selected}
        onSaved={handleSaved}
        neighbors={showQueueNav ? neighbors : null}
        onSelectNeighbor={showQueueNav ? onSelect : null}
        queueMode={showQueueNav}
      />
    </div>
  );
}

export default StudioImageBrowser;
