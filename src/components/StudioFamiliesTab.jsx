import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createStudioFamily,
  deleteStudioFamily,
  fetchStudioFamilies,
  fetchStudioProducts,
  updateStudioFamily,
} from "../utils/studioApi";
import {
  FAMILY_PARTIAL_WARNING,
  STUDIO_DEFAULTS_PAGE_SIZE,
  STUDIO_NEW_FAMILY_ID,
  canSaveFamilyDraft,
  customerCatalogPartialWarning,
  emptyFamilyDraft,
  familyDraftFromFamily,
  familyPickerState,
  filterStudioFamilies,
  filterStudioPickerProducts,
  isCustomerCatalogPartial,
  isFamilyDraftDirty,
  ownerFacingStudioLoadError,
  productFamilyOwnership,
  toFamilyMemberFromProduct,
} from "../utils/studioCatalogUi";

function draftForSelection(nextId, familyList = []) {
  if (nextId === STUDIO_NEW_FAMILY_ID) {
    return emptyFamilyDraft();
  }
  const family = familyList.find((entry) => entry.id === nextId);
  return family ? familyDraftFromFamily(family) : null;
}

function ownerFacingFamilyError(error) {
  if (error?.code === "BUSY" || error?.status === 409) {
    return "Another catalogue save is already running. Try again.";
  }
  return error?.message || "Could not save the family.";
}

function FamilyThumb({ name, image }) {
  const cardSrc = image?.card || null;
  if (cardSrc) {
    return (
      <img
        src={cardSrc}
        alt=""
        className="studioFamilyThumb"
      />
    );
  }
  return (
    <div className="studioFamilyThumb studioFamilyThumb--empty" aria-hidden="true">
      {name?.slice(0, 1) || "?"}
    </div>
  );
}

function ProductPicker({
  products,
  draftMemberIds,
  ownership,
  onAdd,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(STUDIO_DEFAULTS_PAGE_SIZE);
  const searchId = "studio-family-picker-search";
  const filtered = useMemo(
    () => filterStudioPickerProducts(products, query),
    [products, query]
  );
  const visible = filtered.slice(0, visibleCount);
  const hiddenCount = Math.max(0, filtered.length - visible.length);

  return (
    <div className="studioConfirm studioPicker" role="dialog" aria-labelledby="studio-family-picker-title">
      <div className="studioPickerHeader">
        <h3 id="studio-family-picker-title" className="studioConfirmTitle">
          Add product
        </h3>
        <button
          type="button"
          className="studioButton studioButton--ghost"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <label className="studioSearchLabel" htmlFor={searchId}>
        Search products
      </label>
      <input
        id={searchId}
        className="studioSearch"
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setVisibleCount(STUDIO_DEFAULTS_PAGE_SIZE);
        }}
        placeholder="Name, alias, POS name, POS code, or product ID…"
        autoComplete="off"
      />
      <ul className="studioResultList studioPickerList" aria-label="Products to add">
        {visible.length === 0 ? (
          <li className="studioResultEmpty">No matching products.</li>
        ) : (
          visible.map((product) => {
            const state = familyPickerState(
              product.id,
              draftMemberIds,
              ownership
            );
            return (
              <li key={product.id} className="studioPickerItem">
                <FamilyThumb name={product.name} image={product.image} />
                <div className="studioResultCopy">
                  <span className="studioResultName">{product.name}</span>
                  <span className="studioResultMeta">{product.category}</span>
                  {state.kind === "conflict" ? (
                    <span className="studioPickerConflict">
                      Already in “{state.familyName}”
                    </span>
                  ) : null}
                </div>
                {state.kind === "added" ? (
                  <span className="studioResultBadge is-done">Added</span>
                ) : (
                  <button
                    type="button"
                    className="studioButton studioButton--secondary"
                    disabled={state.kind !== "available"}
                    onClick={() => onAdd(product)}
                  >
                    Add
                  </button>
                )}
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
            setVisibleCount((current) => current + STUDIO_DEFAULTS_PAGE_SIZE)
          }
        >
          Show {Math.min(STUDIO_DEFAULTS_PAGE_SIZE, hiddenCount)} more
        </button>
      ) : null}
    </div>
  );
}

function StudioFamiliesTab({ searchRef }) {
  const [families, setFamilies] = useState([]);
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingSelectId, setPendingSelectId] = useState(null);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    const [familyData, productData] = await Promise.all([
      fetchStudioFamilies(),
      fetchStudioProducts(),
    ]);
    const nextFamilies = familyData.families || [];
    setFamilies(nextFamilies);
    setProducts(productData.products || []);
    return nextFamilies;
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchStudioFamilies(), fetchStudioProducts()])
      .then(([familyData, productData]) => {
        if (cancelled) {
          return;
        }
        const nextFamilies = familyData.families || [];
        const nextId = nextFamilies[0]?.id ?? null;
        const nextDraft = draftForSelection(nextId, nextFamilies);
        setFamilies(nextFamilies);
        setProducts(productData.products || []);
        setSelectedId(nextId);
        setDraft(nextDraft);
        setBaseline(nextDraft);
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

  const selectedFamily = useMemo(
    () => families.find((family) => family.id === selectedId) ?? null,
    [families, selectedId]
  );

  function openFamily(nextId, familyList = families) {
    const nextDraft = draftForSelection(nextId, familyList);
    setStatus(null);
    setConfirmDelete(false);
    setPickerOpen(false);
    setDraft(nextDraft);
    setBaseline(nextDraft);
    setSelectedId(nextId);
  }

  const listed = useMemo(
    () => filterStudioFamilies(families, query),
    [families, query]
  );
  const dirty = isFamilyDraftDirty(baseline, draft);
  const canSave = canSaveFamilyDraft(draft);
  const draftMemberIds = useMemo(
    () => new Set((draft?.members ?? []).map((member) => member.productId)),
    [draft]
  );
  const ownership = useMemo(
    () =>
      productFamilyOwnership(
        families,
        selectedId === STUDIO_NEW_FAMILY_ID ? null : selectedId
      ),
    [families, selectedId]
  );

  function applyFamilyResult(result) {
    if (!result.family) {
      return;
    }
    setFamilies((current) => {
      const index = current.findIndex(
        (family) => family.id === result.family.id
      );
      if (index === -1) {
        return [...current, result.family];
      }
      const next = current.slice();
      next[index] = result.family;
      return next;
    });
    const next = familyDraftFromFamily(result.family);
    setDraft(next);
    setBaseline(next);
    setSelectedId(result.family.id);
  }

  function requestSelect(nextId) {
    if (nextId === selectedId) {
      return;
    }
    if (dirty) {
      setPendingSelectId(nextId);
      return;
    }
    openFamily(nextId);
  }

  function discardPending() {
    const nextId = pendingSelectId;
    setPendingSelectId(null);
    openFamily(nextId);
  }

  async function handleSave() {
    if (!canSave || savingRef.current || !draft) {
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setStatus(null);

    const payload = {
      name: draft.name.trim(),
      members: draft.members.map((member) => member.productId),
    };

    try {
      const result =
        selectedId === STUDIO_NEW_FAMILY_ID
          ? await createStudioFamily(payload)
          : await updateStudioFamily(selectedId, payload);
      applyFamilyResult(result);
      if (isCustomerCatalogPartial(result)) {
        const warning =
          customerCatalogPartialWarning(result, FAMILY_PARTIAL_WARNING) ||
          FAMILY_PARTIAL_WARNING;
        setStatus({ type: "warning", text: warning });
      } else {
        setStatus({ type: "success", text: "Family saved." });
      }
    } catch (error) {
      setStatus({ type: "error", text: ownerFacingFamilyError(error) });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedFamily || savingRef.current) {
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setStatus(null);
    try {
      const result = await deleteStudioFamily(selectedFamily.id);
      setFamilies((current) =>
        current.filter((family) => family.id !== selectedFamily.id)
      );
      setSelectedId(null);
      setDraft(null);
      setBaseline(null);
      setConfirmDelete(false);
      if (isCustomerCatalogPartial(result)) {
        setStatus({
          type: "warning",
          text:
            customerCatalogPartialWarning(result, FAMILY_PARTIAL_WARNING) ||
            FAMILY_PARTIAL_WARNING,
        });
      } else {
        setStatus({ type: "success", text: "Family deleted." });
      }
    } catch (error) {
      setStatus({ type: "error", text: ownerFacingFamilyError(error) });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleRetry() {
    setLoading(true);
    setLoadError("");
    load()
      .then((nextFamilies) => {
        const keepCurrent =
          selectedId === STUDIO_NEW_FAMILY_ID ||
          (selectedId &&
            nextFamilies.some((family) => family.id === selectedId));
        const nextId = keepCurrent ? selectedId : nextFamilies[0]?.id ?? null;
        if (!keepCurrent || !draft) {
          openFamily(nextId, nextFamilies);
        }
        setLoadError("");
      })
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
    return <p className="studioStatus">Loading families…</p>;
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
        <button
          type="button"
          className="studioButton studioMoreButton"
          onClick={() => requestSelect(STUDIO_NEW_FAMILY_ID)}
        >
          Create family
        </button>
        <label className="studioSearchLabel" htmlFor="studio-families-search">
          Search families
        </label>
        <input
          id="studio-families-search"
          ref={searchRef}
          className="studioSearch"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Family name…"
          autoComplete="off"
        />
        <p className="studioMuted">
          {listed.length} of {families.length} families
        </p>
        <ul className="studioResultList" role="listbox" aria-label="Product families">
          {listed.length === 0 ? (
            <li className="studioResultEmpty">No matching families.</li>
          ) : (
            listed.map((family) => (
              <li key={family.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={family.id === selectedId}
                  className={`studioResultButton${family.id === selectedId ? " is-selected" : ""}`}
                  onClick={() => requestSelect(family.id)}
                  disabled={saving}
                >
                  <span className="studioResultCopy">
                    <span className="studioResultName">{family.name}</span>
                    <span className="studioResultMeta">
                      {family.members.length} products
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </aside>

      <div className="studioProductDetail">
        {status ? (
          <p
            className={`studioInlineStatus${status.type === "success" ? " is-success" : " is-error"}`}
            role={status.type === "success" ? "status" : "alert"}
          >
            {status.text}
          </p>
        ) : null}

        {pendingSelectId !== null ? (
          <div className="studioConfirm" role="alertdialog" aria-labelledby="studio-family-discard-title">
            <h3 id="studio-family-discard-title" className="studioConfirmTitle">
              Discard unsaved family changes?
            </h3>
            <p className="studioConfirmBody">
              This draft has not been saved. Products will not be changed.
            </p>
            <div className="studioConfirmActions">
              <button
                type="button"
                className="studioButton studioButton--ghost"
                onClick={() => setPendingSelectId(null)}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="studioButton"
                onClick={discardPending}
              >
                Discard
              </button>
            </div>
          </div>
        ) : null}

        {draft ? (
          <div className="studioPanel">
            <div className="studioPanelHeader">
              <h2 className="studioProductTitle">
                {selectedId === STUDIO_NEW_FAMILY_ID
                  ? "New family"
                  : draft.name || selectedFamily?.name}
              </h2>
              <p className="studioProductCategory">
                {draft.members.length} products · Produk Serupa
              </p>
            </div>

            <div className="studioFieldGroup">
              <label className="studioFieldLabel" htmlFor="studio-family-name">
                Family name
              </label>
              <input
                id="studio-family-name"
                className="studioField"
                type="text"
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                disabled={saving}
                autoComplete="off"
              />
            </div>

            <div className="studioFamilyMembers">
              <h3 className="studioMetaHeading">Members</h3>
              {draft.members.length === 0 ? (
                <p className="studioMuted">Add at least 2 products.</p>
              ) : (
                <ul className="studioFamilyMemberList">
                  {draft.members.map((member) => (
                    <li key={member.productId} className="studioFamilyMember">
                      <FamilyThumb name={member.name} image={member.image} />
                      <div className="studioResultCopy">
                        <span className="studioResultName">{member.name}</span>
                        <span className="studioResultMeta">{member.category}</span>
                      </div>
                      <button
                        type="button"
                        className="studioButton studioButton--quiet"
                        disabled={saving}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            members: current.members.filter(
                              (entry) => entry.productId !== member.productId
                            ),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="studioButton studioButton--secondary"
                onClick={() => setPickerOpen(true)}
                disabled={saving}
              >
                Add product
              </button>
            </div>

            {pickerOpen ? (
              <ProductPicker
                products={products}
                draftMemberIds={draftMemberIds}
                ownership={ownership}
                onAdd={(product) => {
                  const state = familyPickerState(
                    product.id,
                    draftMemberIds,
                    ownership
                  );
                  if (state.kind !== "available") {
                    return;
                  }
                  setDraft((current) => ({
                    ...current,
                    members: [
                      ...current.members,
                      toFamilyMemberFromProduct(product),
                    ],
                  }));
                }}
                onClose={() => setPickerOpen(false)}
              />
            ) : null}

            <div className="studioProductActions">
              <button
                type="button"
                className="studioButton"
                disabled={saving || !canSave || !dirty}
                onClick={handleSave}
              >
                {saving
                  ? "Saving…"
                  : selectedId === STUDIO_NEW_FAMILY_ID
                    ? "Create family"
                    : "Save changes"}
              </button>
              {!canSave ? (
                <p className="studioMuted">
                  Enter a name and at least 2 products before saving.
                </p>
              ) : null}
            </div>

            {selectedId !== STUDIO_NEW_FAMILY_ID ? (
              confirmDelete ? (
                <div className="studioConfirm studioConfirm--replace">
                  <h3 className="studioConfirmTitle">
                    Delete family “{draft.name || selectedFamily?.name}”?
                  </h3>
                  <p className="studioConfirmBody">
                    Products will not be deleted. Only the Produk Serupa
                    relationship will be removed.
                  </p>
                  <div className="studioConfirmActions">
                    <button
                      type="button"
                      className="studioButton studioButton--ghost"
                      onClick={() => setConfirmDelete(false)}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="studioButton studioButton--danger"
                      onClick={handleDelete}
                      disabled={saving}
                    >
                      {saving ? "Deleting…" : "Delete family"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="studioButton studioButton--quiet"
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving}
                >
                  Delete family
                </button>
              )
            ) : null}
          </div>
        ) : (
          <div className="studioPanel studioPanel--empty">
            <p>Select a family or create a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default StudioFamiliesTab;
