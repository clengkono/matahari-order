import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { fetchStudioProducts, updateStudioProduct } from "../utils/studioApi";

const CIGARETTE_CATEGORY = "Rokok";

function matchesQuery(product, query) {
  if (!query) {
    return true;
  }

  if (product.name.toLowerCase().includes(query)) {
    return true;
  }

  return product.aliases.some((alias) => alias.toLowerCase().includes(query));
}

function saveStatusText(result) {
  if (result.categoryChanged) {
    return `Saved. Category: ${result.previousCategory} → ${result.category}.`;
  }
  return "Saved.";
}

function ownerFacingSaveError(error) {
  if (error?.code === "BUSY" || error?.status === 409) {
    return "Another catalogue save is already running. Try again.";
  }
  return error?.message || "Could not save the product.";
}

function StudioProductDetail({ product, categories, saving, onSave, onStatus }) {
  const nameId = useId();
  const categoryId = useId();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(product.name);
  const [draftCategory, setDraftCategory] = useState(product.category);
  const saveLockRef = useRef(false);

  const cardSrc = product.image?.card || null;
  const leavingCigaretteList =
    editing &&
    product.category === CIGARETTE_CATEGORY &&
    draftCategory !== CIGARETTE_CATEGORY;

  function handleCancel() {
    setDraftName(product.name);
    setDraftCategory(product.category);
    setEditing(false);
    onStatus?.(null);
  }

  async function handleSave(event) {
    event.preventDefault();
    if (saving || saveLockRef.current) {
      return;
    }

    const name = draftName.trim();
    const category = draftCategory.trim();
    if (!name) {
      onStatus?.({ type: "error", text: "Enter a product name." });
      return;
    }
    if (!category) {
      onStatus?.({ type: "error", text: "Choose a category." });
      return;
    }

    saveLockRef.current = true;
    try {
      const saved = await onSave({ name, category });
      if (saved) {
        setEditing(false);
      }
    } finally {
      saveLockRef.current = false;
    }
  }

  return (
    <div className="studioPanel">
      <div className="studioPanelHeader">
        <h2 className="studioProductTitle">{product.name}</h2>
        <p className="studioProductCategory">{product.category}</p>
      </div>

      <div className="studioCurrentImage">
        {cardSrc ? (
          <img
            src={cardSrc}
            alt={`Photo of ${product.name}`}
            className="studioCurrentImagePhoto"
          />
        ) : (
          <div className="studioMissingImage" role="status">
            No photo
          </div>
        )}
      </div>

      {editing ? (
        <form className="studioProductForm" onSubmit={handleSave}>
          <div className="studioFieldGroup">
            <label className="studioFieldLabel" htmlFor={nameId}>
              Customer-facing name
            </label>
            <input
              id={nameId}
              className="studioField"
              type="text"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              autoComplete="off"
              disabled={saving}
            />
          </div>

          <div className="studioFieldGroup">
            <label className="studioFieldLabel" htmlFor={categoryId}>
              Category
            </label>
            <select
              id={categoryId}
              className="studioField"
              value={draftCategory}
              onChange={(event) => setDraftCategory(event.target.value)}
              disabled={saving}
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            {leavingCigaretteList ? (
              <p className="studioCategoryWarning" role="status">
                Changing category does not move or delete image files. Paths stay
                tied to the product ID.
              </p>
            ) : null}
          </div>

          <div className="studioProductActions">
            <button
              type="submit"
              className="studioButton"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="studioButton studioButton--secondary"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="studioMetaList">
          <div className="studioMetaRow">
            <dt>Customer-facing name</dt>
            <dd>{product.name}</dd>
          </div>
          <div className="studioMetaRow">
            <dt>Category</dt>
            <dd>{product.category}</dd>
          </div>
        </dl>
      )}

      <div className="studioMetaSection">
        <h3 className="studioMetaHeading">Customer aliases</h3>
        {product.aliases.length > 0 ? (
          <ul className="studioAliasList">
            {product.aliases.map((alias) => (
              <li key={alias} className="studioAliasChip">
                {alias}
              </li>
            ))}
          </ul>
        ) : (
          <p className="studioMuted">No customer aliases</p>
        )}
      </div>

      <dl className="studioMetaList">
        <div className="studioMetaRow">
          <dt>Product ID</dt>
          <dd className="studioMono">{product.id}</dd>
        </div>
        <div className="studioMetaRow">
          <dt>Variant ID</dt>
          <dd className="studioMono">{product.variantId || "None"}</dd>
        </div>
      </dl>

      <div className="studioPosBox">
        <h3 className="studioMetaHeading">POS record</h3>
        <p className="studioPosNote">
          Changing the customer-facing name does not rename the POS product.
        </p>
        <dl className="studioMetaList">
          <div className="studioMetaRow">
            <dt>POS name</dt>
            <dd>{product.posName || "No POS name"}</dd>
          </div>
          <div className="studioMetaRow">
            <dt>POS code</dt>
            <dd className="studioMono">{product.posCode || "No POS code"}</dd>
          </div>
        </dl>
      </div>

      {!editing ? (
        <div className="studioProductActions">
          <button
            type="button"
            className="studioButton"
            onClick={() => {
              onStatus?.(null);
              setDraftName(product.name);
              setDraftCategory(product.category);
              setEditing(true);
            }}
          >
            Edit
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StudioProductsTab({ searchRef, onCatalogueChanged }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const listRef = useRef(null);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    const data = await fetchStudioProducts();
    const nextProducts = data.products || [];
    setProducts(nextProducts);
    setCategories(data.categories || []);
    setSelectedId((current) => {
      if (current && nextProducts.some((product) => product.id === current)) {
        return current;
      }
      return nextProducts[0]?.id ?? null;
    });
    return nextProducts;
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchStudioProducts()
      .then((data) => {
        if (cancelled) {
          return;
        }
        const nextProducts = data.products || [];
        setProducts(nextProducts);
        setCategories(data.categories || []);
        setSelectedId((current) => {
          if (current && nextProducts.some((product) => product.id === current)) {
            return current;
          }
          return nextProducts[0]?.id ?? null;
        });
        setLoadError("");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setLoadError(
          error.message ||
            "Could not reach the local image service. Start Matahari Studio (or npm run studio)."
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
  }, []);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return products.filter((product) => matchesQuery(product, normalized));
  }, [products, query]);

  const safeHighlight =
    results.length === 0 ? 0 : Math.min(highlight, results.length - 1);
  const selected =
    products.find((product) => product.id === selectedId) ?? null;

  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [safeHighlight, results]);

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
        setSelectedId(choice.id);
        setStatus(null);
      }
    }
  }

  async function handleSave(payload) {
    if (!selected || savingRef.current) {
      return false;
    }

    savingRef.current = true;
    setSaving(true);
    setStatus(null);

    try {
      const result = await updateStudioProduct(selected.id, payload);
      await load();
      setSelectedId(result.product?.id ?? selected.id);
      setStatus({ type: "success", text: saveStatusText(result) });
      try {
        await onCatalogueChanged?.();
      } catch {
        // Cigarette list refresh is best-effort after a successful product save.
      }
      return true;
    } catch (error) {
      setStatus({ type: "error", text: ownerFacingSaveError(error) });
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleRetry() {
    setLoading(true);
    setLoadError("");
    fetchStudioProducts()
      .then((data) => {
        const nextProducts = data.products || [];
        setProducts(nextProducts);
        setCategories(data.categories || []);
        setSelectedId((current) => {
          if (current && nextProducts.some((product) => product.id === current)) {
            return current;
          }
          return nextProducts[0]?.id ?? null;
        });
        setLoadError("");
      })
      .catch((error) => {
        setLoadError(
          error.message ||
            "Could not reach the local image service. Start Matahari Studio (or npm run studio)."
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }

  if (loading) {
    return <p className="studioStatus">Loading products…</p>;
  }

  if (loadError) {
    return (
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
    );
  }

  return (
    <div className="studioTabLayout">
      <aside className="studioSidebar">
        <label className="studioSearchLabel" htmlFor="studio-catalogue-product-search">
          Search products
        </label>
        <input
          id="studio-catalogue-product-search"
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
        <p className="studioMuted">
          {results.length} of {products.length} products
        </p>

        <ul
          className="studioResultList studioResultList--catalogue"
          ref={listRef}
          role="listbox"
          aria-label="Catalogue products"
        >
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
                    onClick={() => {
                      setSelectedId(product.id);
                      setStatus(null);
                    }}
                    onMouseEnter={() => setHighlight(index)}
                    disabled={saving}
                  >
                    <span className="studioResultCopy">
                      <span className="studioResultName">{product.name}</span>
                      <span className="studioResultMeta">{product.category}</span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      <div className="studioProductDetail">
        {status ? (
          <p
            className={`studioInlineStatus${status.type === "error" ? " is-error" : " is-success"}`}
            role={status.type === "error" ? "alert" : "status"}
          >
            {status.text}
          </p>
        ) : null}
        {selected ? (
          <StudioProductDetail
            key={selected.id}
            product={selected}
            categories={categories}
            saving={saving}
            onSave={handleSave}
            onStatus={setStatus}
          />
        ) : (
          <div className="studioPanel studioPanel--empty">
            <p>Select a product to review its details.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudioProductsTab;
