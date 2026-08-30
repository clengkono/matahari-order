import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearStudioDefaultUnit,
  fetchStudioDefaults,
  setStudioDefaultUnit,
} from "../utils/studioApi";
import {
  DEFAULT_PARTIAL_WARNING,
  STUDIO_DEFAULTS_PAGE_SIZE,
  availableUnitChoices,
  categoriesFromStudioDefaults,
  customerCatalogPartialWarning,
  filterStudioDefaults,
  ownerFacingStudioLoadError,
  isCustomerCatalogPartial,
  isSingleUnitProduct,
  mergeStudioDefaultRow,
  studioDefaultStats,
} from "../utils/studioCatalogUi";

function ownerFacingDefaultError(error) {
  if (error?.code === "BUSY" || error?.status === 409) {
    return "Another catalogue save is already running. Try again.";
  }
  return error?.message || "Could not save the default unit.";
}

function DefaultRow({
  row,
  saving,
  message,
  onConfirm,
  onChangeUnit,
  onReset,
}) {
  const units = availableUnitChoices(row);
  const single = isSingleUnitProduct(row);
  const current = row.currentDefaultUnit || units[0] || "";
  const configured = Boolean(row.ownerConfigured);

  return (
    <article
      className={`studioDefaultRow${configured ? " is-configured" : ""}${saving ? " is-saving" : ""}`}
    >
      <div className="studioDefaultCopy">
        <h3 className="studioDefaultName">{row.name}</h3>
        <p className="studioDefaultMeta">{row.category || "No category"}</p>
        <p className="studioDefaultUnits">
          Units: {units.length > 0 ? units.join(" · ") : "None"}
        </p>
      </div>

      <div className="studioDefaultControls">
        {single ? (
          <p className="studioDefaultCurrentUnit">{current}</p>
        ) : (
          <label className="studioDefaultSelectLabel">
            <span className="studioVisuallyHidden">
              Default unit for {row.name}
            </span>
            <select
              className="studioField studioDefaultSelect"
              value={current}
              disabled={saving || units.length === 0}
              onChange={(event) => onChangeUnit(row, event.target.value)}
            >
              {units.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
        )}

        {!configured ? (
          <button
            type="button"
            className="studioButton"
            disabled={saving || !current}
            onClick={() => onConfirm(row, current)}
          >
            {saving ? "Saving…" : "Confirm"}
          </button>
        ) : (
          <button
            type="button"
            className="studioButton studioButton--quiet"
            disabled={saving}
            onClick={() => onReset(row)}
          >
            Use automatic default
          </button>
        )}
      </div>

      <div className="studioDefaultStatus">
        <span
          className={`studioResultBadge${configured ? " is-done" : " is-missing"}`}
        >
          {configured ? "Confirmed" : "Needs review"}
        </span>
        {message ? (
          <p
            className={`studioDefaultMessage is-${message.type}`}
            role={message.type === "error" || message.type === "warning" ? "alert" : "status"}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function StudioDefaultsTab({ searchRef }) {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("review");
  const [category, setCategory] = useState("");
  const [visibleCount, setVisibleCount] = useState(STUDIO_DEFAULTS_PAGE_SIZE);
  const [pinnedIds, setPinnedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [messages, setMessages] = useState({});
  const [banner, setBanner] = useState(null);
  const savingRef = useRef(new Set());

  const load = useCallback(async () => {
    const data = await fetchStudioDefaults();
    setRows(data.defaults || []);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchStudioDefaults()
      .then((data) => {
        if (cancelled) {
          return;
        }
        setRows(data.defaults || []);
        setLoadError("");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setLoadError(
          ownerFacingStudioLoadError(
            error,
            "Could not reach the local catalogue service. Start Matahari Studio (or npm run studio)."
          )
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

  const categories = useMemo(() => categoriesFromStudioDefaults(rows), [rows]);
  const stats = useMemo(() => studioDefaultStats(rows), [rows]);
  const filtered = useMemo(
    () =>
      filterStudioDefaults(rows, {
        query,
        status,
        category,
        pinnedIds,
      }),
    [rows, query, status, category, pinnedIds]
  );
  const visible = filtered.slice(0, visibleCount);
  const hiddenCount = Math.max(0, filtered.length - visible.length);

  function resetPaging() {
    setVisibleCount(STUDIO_DEFAULTS_PAGE_SIZE);
    setPinnedIds([]);
  }

  function setRowMessage(productId, message) {
    setMessages((current) => {
      const next = { ...current };
      if (message) {
        next[productId] = message;
      } else {
        delete next[productId];
      }
      return next;
    });
  }

  async function saveUnit(row, unitName) {
    if (!unitName || savingRef.current.has(row.productId)) {
      return;
    }

    savingRef.current.add(row.productId);
    setSavingId(row.productId);
    setRowMessage(row.productId, { type: "saving", text: "Saving…" });
    setBanner(null);

    try {
      const result = await setStudioDefaultUnit(row.productId, unitName);
      if (result.default) {
        setRows((current) => mergeStudioDefaultRow(current, result.default));
      }
      setPinnedIds((current) =>
        current.includes(row.productId) ? current : [...current, row.productId]
      );

      if (isCustomerCatalogPartial(result)) {
        const warning =
          customerCatalogPartialWarning(result, DEFAULT_PARTIAL_WARNING) ||
          DEFAULT_PARTIAL_WARNING;
        setRowMessage(row.productId, { type: "warning", text: warning });
        setBanner({ type: "warning", text: warning });
      } else {
        setRowMessage(row.productId, { type: "success", text: "Confirmed." });
      }
    } catch (error) {
      setRowMessage(row.productId, {
        type: "error",
        text: ownerFacingDefaultError(error),
      });
    } finally {
      savingRef.current.delete(row.productId);
      setSavingId((current) => (current === row.productId ? null : current));
    }
  }

  async function handleReset(row) {
    if (savingRef.current.has(row.productId)) {
      return;
    }

    savingRef.current.add(row.productId);
    setSavingId(row.productId);
    setRowMessage(row.productId, { type: "saving", text: "Saving…" });
    setBanner(null);

    try {
      const result = await clearStudioDefaultUnit(row.productId);
      if (result.default) {
        setRows((current) => mergeStudioDefaultRow(current, result.default));
      }
      setPinnedIds((current) =>
        current.includes(row.productId) ? current : [...current, row.productId]
      );

      if (isCustomerCatalogPartial(result)) {
        const warning =
          customerCatalogPartialWarning(result, DEFAULT_PARTIAL_WARNING) ||
          DEFAULT_PARTIAL_WARNING;
        setRowMessage(row.productId, { type: "warning", text: warning });
        setBanner({ type: "warning", text: warning });
      } else {
        setRowMessage(row.productId, {
          type: "success",
          text: "Using automatic default.",
        });
      }
    } catch (error) {
      setRowMessage(row.productId, {
        type: "error",
        text: ownerFacingDefaultError(error),
      });
    } finally {
      savingRef.current.delete(row.productId);
      setSavingId((current) => (current === row.productId ? null : current));
    }
  }

  function handleRetry() {
    setLoading(true);
    setLoadError("");
    load()
      .then(() => setLoadError(""))
      .catch((error) => {
        setLoadError(
          ownerFacingStudioLoadError(
            error,
            "Could not reach the local catalogue service. Start Matahari Studio (or npm run studio)."
          )
        );
      })
      .finally(() => setLoading(false));
  }

  if (loading) {
    return <p className="studioStatus">Loading default units…</p>;
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
    <div className="studioDefaults">
      <div className="studioDefaultsHeader">
        <div>
          <h2 className="studioQueueProgress">Default units</h2>
          <p className="studioMuted" aria-live="polite">
            {stats.configured} configured · {stats.needsReview} needs review
          </p>
        </div>
      </div>

      {banner ? (
        <p
          className={`studioInlineStatus${banner.type === "warning" ? " is-error" : " is-success"}`}
          role="alert"
        >
          {banner.text}
        </p>
      ) : null}

      <div className="studioDefaultsToolbar">
        <div className="studioChipRow" role="group" aria-label="Review filter">
          {[
            { id: "all", label: "All" },
            { id: "review", label: "Needs review" },
            { id: "configured", label: "Configured" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`studioChip${status === item.id ? " is-active" : ""}`}
              onClick={() => {
                setStatus(item.id);
                resetPaging();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <label className="studioFilterRow studioDefaultsCategory">
          <span className="studioFilterLabel">Category</span>
          <select
            className="studioFilterSelect"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              resetPaging();
            }}
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="studioSearchLabel" htmlFor="studio-defaults-search">
        Search defaults
      </label>
      <input
        id="studio-defaults-search"
        ref={searchRef}
        className="studioSearch"
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          resetPaging();
        }}
        placeholder="Name, alias, POS name, POS code, or product ID…"
        autoComplete="off"
      />
      <p className="studioMuted">
        Showing {visible.length} of {filtered.length} products
        {filtered.length !== rows.length ? ` (filtered from ${rows.length})` : ""}
      </p>

      {visible.length === 0 ? (
        <p className="studioResultEmpty">No matching products.</p>
      ) : (
        <div className="studioDefaultList">
          {visible.map((row) => (
            <DefaultRow
              key={row.productId}
              row={row}
              saving={savingId === row.productId}
              message={messages[row.productId]}
              onConfirm={saveUnit}
              onChangeUnit={saveUnit}
              onReset={handleReset}
            />
          ))}
        </div>
      )}

      {hiddenCount > 0 ? (
        <button
          type="button"
          className="studioButton studioButton--secondary studioMoreButton"
          onClick={() =>
            setVisibleCount((current) => current + STUDIO_DEFAULTS_PAGE_SIZE)
          }
        >
          Show {Math.min(STUDIO_DEFAULTS_PAGE_SIZE, hiddenCount)} more
        </button>
      ) : null}
    </div>
  );
}

export default StudioDefaultsTab;
