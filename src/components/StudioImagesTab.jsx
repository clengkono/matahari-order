import { useEffect, useMemo, useRef, useState } from "react";
import StudioImagePanel from "./StudioImagePanel";

const MAX_RESULTS = 40;

function StudioImagesTab({
  products,
  selectedId,
  onSelect,
  onSaved,
  searchRef,
}) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef(null);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return products.slice(0, MAX_RESULTS);
    }
    return products
      .filter((product) => product.name.toLowerCase().includes(normalized))
      .slice(0, MAX_RESULTS);
  }, [products, query]);

  const safeHighlight =
    results.length === 0 ? 0 : Math.min(highlight, results.length - 1);

  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [safeHighlight, results]);

  const selected = products.find((product) => product.id === selectedId) ?? null;

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

  return (
    <div className="studioTabLayout">
      <aside className="studioSidebar">
        <label className="studioSearchLabel" htmlFor="studio-product-search">
          Search cigarette products
        </label>
        <input
          id="studio-product-search"
          ref={searchRef}
          className="studioSearch"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder="Type a product name…"
          autoComplete="off"
        />

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
                    <span className="studioResultName">{product.name}</span>
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
        onSaved={onSaved}
      />
    </div>
  );
}

export default StudioImagesTab;
