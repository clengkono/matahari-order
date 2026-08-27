import { useEffect, useId, useRef, useState } from "react";
import {
  assignProductImage,
  inspectClipboardImages,
  fileToBase64,
  mimeFromFile,
  previewProductImage,
  regenerateProductImage,
  removeProductImage,
  validateImageFile,
} from "../utils/studioApi";
import {
  isStudioTypingTarget,
  pickFirstImageFile,
} from "../utils/studioImageSearch";

function cacheBust(src, version) {
  if (!src) {
    return null;
  }
  return `${src}${src.includes("?") ? "&" : "?"}v=${version}`;
}

function extraFileNotice(extraCount) {
  if (extraCount < 1) {
    return "";
  }
  return extraCount === 1
    ? "Using the first image only. Extra file ignored."
    : `Using the first image only. ${extraCount} extra files ignored.`;
}

function StudioImagePanel({
  product,
  onSaved,
  neighbors = null,
  onSelectNeighbor,
  queueMode = false,
}) {
  const inputId = useId();
  const fileInputRef = useRef(null);
  const dropzoneRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("idle"); // idle | assign | replace | remove
  const [dragOver, setDragOver] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [generatedPreview, setGeneratedPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [catalogWarning, setCatalogWarning] = useState("");

  const draftRef = useRef(null);
  const stepRef = useRef("idle");
  const busyRef = useRef(false);
  const productRef = useRef(product);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    productRef.current = product;
  }, [product]);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    if (!product || product.hasImage || step !== "idle") {
      return undefined;
    }
    const node = dropzoneRef.current;
    if (!node) {
      return undefined;
    }
    const active = document.activeElement;
    if (isStudioTypingTarget(active)) {
      return undefined;
    }
    node.focus();
    return undefined;
  }, [product, step]);

  async function acceptFile(file, extraCount = 0) {
    setError(extraFileNotice(extraCount));
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      setDraft((previous) => {
        if (previous?.previewUrl) {
          URL.revokeObjectURL(previous.previewUrl);
        }
        return null;
      });
      setStep("idle");
      return;
    }

    const mimeType = mimeFromFile(file);
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      setError("Unsupported file type. Use JPEG, PNG, or WebP.");
      setDraft((previous) => {
        if (previous?.previewUrl) {
          URL.revokeObjectURL(previous.previewUrl);
        }
        return null;
      });
      setStep("idle");
      return;
    }

    try {
      const base64Data = await fileToBase64(file);
      const previewUrl = URL.createObjectURL(file);
      setDraft((previous) => {
        if (previous?.previewUrl) {
          URL.revokeObjectURL(previous.previewUrl);
        }
        return {
          file,
          mimeType,
          base64Data,
          previewUrl,
        };
      });
      setGeneratedPreview(null);
      setStep("assign");
      setPreviewBusy(true);
      try {
        const generated = await previewProductImage({
          mimeType,
          base64Data,
        });
        setGeneratedPreview(generated);
      } catch {
        setGeneratedPreview(null);
      } finally {
        setPreviewBusy(false);
      }
    } catch {
      setError("Could not read the selected file.");
      setDraft((previous) => {
        if (previous?.previewUrl) {
          URL.revokeObjectURL(previous.previewUrl);
        }
        return null;
      });
      setStep("idle");
    }
  }

  function acceptFromList(fileList) {
    const picked = pickFirstImageFile(fileList);
    if (!picked.file) {
      setError("Drop a JPEG, PNG, or WebP image.");
      return;
    }
    void acceptFile(picked.file, picked.extraCount);
  }

  function clearDraft() {
    setDraft((previous) => {
      if (previous?.previewUrl) {
        URL.revokeObjectURL(previous.previewUrl);
      }
      return null;
    });
    setStep("idle");
    setError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function saveImage(replaceConfirmed) {
    const currentDraft = draftRef.current;
    const currentProduct = productRef.current;
    if (!currentDraft || !currentProduct || busyRef.current) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await assignProductImage({
        productId: currentProduct.id,
        mimeType: currentDraft.mimeType,
        base64Data: currentDraft.base64Data,
        replaceConfirmed,
      });
      clearDraft();
      setPreviewVersion(Date.now());
      const rebuildFailed = result.customerCatalog && result.customerCatalog.ok === false;
      if (rebuildFailed) {
        setCatalogWarning(
          result.customerCatalog.warning ||
            "Saved the image, but the customer catalogue is stale. Run npm run catalog:customer-build."
        );
      } else {
        setCatalogWarning("");
      }
      onSavedRef.current?.({
        ...result,
        notice: rebuildFailed
          ? result.customerCatalog.warning ||
            "Saved, but the customer catalogue is stale."
          : `✓ ${currentProduct.name} image saved`,
        noticeTone: rebuildFailed ? "warning" : "success",
      });
    } catch (err) {
      setError(err.message || "Save failed.");
      if (err.code === "REPLACE_CONFIRMATION_REQUIRED") {
        setStep("replace");
      } else {
        setStep("assign");
      }
    } finally {
      setBusy(false);
    }
  }

  function handleConfirmAssign() {
    const currentProduct = productRef.current;
    if (!draftRef.current || !currentProduct || busyRef.current) {
      return;
    }
    if (currentProduct.hasImage) {
      setStep("replace");
      return;
    }
    void saveImage(false);
  }

  function handleConfirmReplace() {
    void saveImage(true);
  }

  async function handleRegenerate() {
    const currentProduct = productRef.current;
    if (!currentProduct?.hasImage || busyRef.current || stepRef.current !== "idle") {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await regenerateProductImage(currentProduct.id);
      setPreviewVersion(Date.now());
      onSavedRef.current?.({
        ...result,
        regenerated: true,
        notice: `✓ ${currentProduct.name} regenerated`,
        noticeTone: "success",
      });
    } catch (err) {
      setError(err.message || "Regenerate failed.");
    } finally {
      setBusy(false);
    }
  }

  function handleAskRemove() {
    if (!productRef.current?.hasImage || busyRef.current || stepRef.current !== "idle") {
      return;
    }
    setError("");
    setStep("remove");
  }

  function handleCancelRemove() {
    setStep("idle");
  }

  async function handleConfirmRemove() {
    const currentProduct = productRef.current;
    if (!currentProduct?.hasImage || busyRef.current || stepRef.current !== "remove") {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await removeProductImage(currentProduct.id);
      setStep("idle");
      setPreviewVersion(Date.now());
      const rebuildFailed = result.customerCatalog && result.customerCatalog.ok === false;
      if (rebuildFailed) {
        setCatalogWarning(
          result.customerCatalog.warning ||
            "Removed the image, but the customer catalogue is stale. Run npm run catalog:customer-build."
        );
      } else {
        setCatalogWarning("");
      }
      onSavedRef.current?.({
        ...result,
        removed: true,
        notice: rebuildFailed
          ? result.customerCatalog.warning ||
            "Removed, but the customer catalogue is stale."
          : `✓ Image removed from ${currentProduct.name}`,
        noticeTone: rebuildFailed ? "warning" : "success",
      });
    } catch (err) {
      setError(err.message || "Remove failed.");
      setStep("remove");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!product) {
      return undefined;
    }

    function onKeyDown(event) {
      const currentStep = stepRef.current;
      if (
        currentStep !== "assign" &&
        currentStep !== "replace" &&
        currentStep !== "remove"
      ) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        if (currentStep === "remove") {
          handleCancelRemove();
        } else {
          clearDraft();
        }
        return;
      }

      if (event.key !== "Enter") {
        return;
      }

      if (isStudioTypingTarget(event.target)) {
        return;
      }
      if (event.target instanceof HTMLButtonElement) {
        return;
      }
      if (currentStep === "remove") {
        return;
      }

      event.preventDefault();
      if (currentStep === "assign") {
        handleConfirmAssign();
      } else if (currentStep === "replace") {
        handleConfirmReplace();
      }
    }

    function onPaste(event) {
      if (!productRef.current) {
        return;
      }
      if (stepRef.current === "remove") {
        return;
      }
      if (
        isStudioTypingTarget(event.target) &&
        event.target !== dropzoneRef.current
      ) {
        return;
      }

      const inspected = inspectClipboardImages(event.clipboardData);
      if (!inspected.file) {
        return;
      }
      event.preventDefault();
      void acceptFile(inspected.file, inspected.extraCount);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
    };
    // Panel remounts per product via key=; handlers use refs for live state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  useEffect(() => {
    return () => {
      if (draftRef.current?.previewUrl) {
        URL.revokeObjectURL(draftRef.current.previewUrl);
      }
    };
  }, []);

  if (!product) {
    return (
      <div className="studioPanel studioPanel--empty">
        <p>Select a product to manage its image.</p>
      </div>
    );
  }

  const currentCard = product.image?.card;
  const currentDetail = product.image?.detail;
  const cardSrc = cacheBust(currentCard, previewVersion);
  const detailSrc = cacheBust(currentDetail, previewVersion);
  const originalStored = Boolean(product.originalStored || product.image?.original);
  const showCurrentImages = product.hasImage && step !== "assign";
  const showDropzone = step === "idle" || step === "assign";
  const previewReady = step === "assign" && Boolean(draft);

  const dropzone = (
    <div
      ref={dropzoneRef}
      tabIndex={0}
      className={`studioDropzone${dragOver ? " studioDropzone--active" : ""}${!product.hasImage && !previewReady ? " studioDropzone--hero" : ""}`}
      aria-label={`Paste or drop an image for ${product.name}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        acceptFromList(event.dataTransfer?.files);
      }}
    >
      <p className="studioDropzoneTitle">
        {previewReady ? "Choose a different image" : "Paste image here"}
      </p>
      <p className="studioDropzoneHint">
        Ctrl+V · drop · or choose a JPEG, PNG, or WebP · max 15 MB
      </p>
      <div className="studioDropzoneActions">
        <label className="studioButton studioButton--secondary" htmlFor={inputId}>
          Choose file
        </label>
        <input
          id={inputId}
          ref={fileInputRef}
          className="studioFileInput"
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          onChange={(event) => {
            acceptFromList(event.target.files);
          }}
        />
      </div>
    </div>
  );

  const assignConfirm = previewReady ? (
    <div
      className="studioConfirm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-assign-title"
    >
      <h3 id="studio-assign-title" className="studioConfirmTitle">
        Confirm &amp; Save · {product.name}
      </h3>
      <div className="studioPreviewGrid">
        <figure className="studioPreviewFigure">
          <img
            src={draft.previewUrl}
            alt={`Source for ${product.name}`}
            className="studioConfirmPreview"
          />
          <figcaption>Source</figcaption>
        </figure>
        <figure className="studioPreviewFigure">
          {generatedPreview?.card?.dataUrl ? (
            <img
              src={generatedPreview.card.dataUrl}
              alt={`Generated card for ${product.name}`}
              className="studioConfirmPreview"
            />
          ) : (
            <div className="studioMissingImage studioMissingImage--small">
              {previewBusy ? "Generating…" : "Card preview unavailable"}
            </div>
          )}
          <figcaption>Generated card</figcaption>
        </figure>
        <figure className="studioPreviewFigure">
          {generatedPreview?.detail?.dataUrl ? (
            <img
              src={generatedPreview.detail.dataUrl}
              alt={`Generated detail for ${product.name}`}
              className="studioConfirmPreview"
            />
          ) : (
            <div className="studioMissingImage studioMissingImage--small">
              {previewBusy ? "Generating…" : "Detail preview unavailable"}
            </div>
          )}
          <figcaption>Generated detail</figcaption>
        </figure>
      </div>
      <p className="studioConfirmBody">
        Watermark: Matahari Langowan on card and detail. Original stays clean.
      </p>
      <div className="studioConfirmActions">
        <button
          type="button"
          className="studioButton studioButton--ghost"
          onClick={clearDraft}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="studioButton"
          onClick={handleConfirmAssign}
          disabled={busy}
        >
          {busy ? "Saving…" : "Confirm & Save"}
        </button>
      </div>
      <p className="studioConfirmHint">
        Not saved yet. Enter confirms · Escape cancels. Replace still needs a
        second confirmation.
      </p>
    </div>
  ) : null;

  return (
    <div className={`studioPanel${queueMode ? " studioPanel--queue" : ""}`}>
      <div className="studioPanelHeader">
        <h2 className="studioProductTitle">{product.name}</h2>
        <p className="studioProductMeta">
          {product.category ? `${product.category} · ` : ""}
          {product.id}
        </p>
      </div>

      {neighbors ? (
        <div className="studioQueueNav">
          <button
            type="button"
            className="studioButton studioButton--secondary"
            onClick={() => onSelectNeighbor?.(neighbors.previousId)}
            disabled={!neighbors.previousId}
          >
            Previous missing
          </button>
          <p className="studioQueuePosition">
            {neighbors.position
              ? `${neighbors.position} of ${neighbors.remaining}`
              : `${neighbors.remaining} in this list`}
          </p>
          <button
            type="button"
            className="studioButton studioButton--secondary"
            onClick={() => onSelectNeighbor?.(neighbors.nextId)}
            disabled={!neighbors.nextId}
          >
            Next missing
          </button>
        </div>
      ) : null}

      {showCurrentImages ? (
        <div className="studioImageStatusGrid">
          <div className="studioCurrentImage">
            <p className="studioImageCaption">Current image</p>
            {cardSrc ? (
              <img
                src={cardSrc}
                alt={`Current card image for ${product.name}`}
                className="studioCurrentImagePhoto"
              />
            ) : (
              <div className="studioMissingImage" role="status">
                Missing image
              </div>
            )}
          </div>
          <div className="studioCurrentImage">
            <p className="studioImageCaption">Detail image</p>
            {detailSrc ? (
              <img
                src={detailSrc}
                alt={`Current detail image for ${product.name}`}
                className="studioCurrentImagePhoto"
              />
            ) : (
              <div className="studioMissingImage studioMissingImage--small" role="status">
                No detail
              </div>
            )}
          </div>
        </div>
      ) : null}

      {product.hasImage && step === "idle" ? (
        <ul className="studioImageFacts">
          <li>Original stored: {originalStored ? "Yes" : "No"}</li>
          <li>Watermark: Matahari Langowan</li>
        </ul>
      ) : null}

      {product.hasImage && step === "idle" ? (
        <div className="studioImageActions">
          <button
            type="button"
            className="studioButton studioButton--secondary"
            onClick={() => {
              void handleRegenerate();
            }}
            disabled={busy}
          >
            {busy ? "Regenerating…" : "Regenerate"}
          </button>
          <button
            type="button"
            className="studioButton studioButton--ghost"
            onClick={handleAskRemove}
            disabled={busy}
          >
            Remove image
          </button>
        </div>
      ) : null}

      {previewReady ? assignConfirm : null}

      {showDropzone ? dropzone : null}

      {error ? (
        <p className="studioError" role="alert">
          {error}
        </p>
      ) : null}

      {step === "replace" && draft ? (
        <div
          className="studioConfirm studioConfirm--replace"
          role="dialog"
          aria-modal="true"
          aria-labelledby="studio-replace-title"
        >
          <h3 id="studio-replace-title" className="studioConfirmTitle">
            Replace existing image for {product.name}?
          </h3>
          <p className="studioConfirmBody">
            This will replace the current image. Confirm to overwrite card, detail,
            and original. A catalogue backup is created first.
          </p>
          <div className="studioPreviewGrid">
            <figure className="studioPreviewFigure">
              {cardSrc ? (
                <img
                  src={cardSrc}
                  alt={`Current image for ${product.name}`}
                  className="studioConfirmPreview"
                />
              ) : (
                <div className="studioMissingImage studioMissingImage--small">
                  No current image
                </div>
              )}
              <figcaption>Current image</figcaption>
            </figure>
            <figure className="studioPreviewFigure">
              <img
                src={generatedPreview?.card?.dataUrl || draft.previewUrl}
                alt={`Replacement for ${product.name}`}
                className="studioConfirmPreview"
              />
              <figcaption>Replace image</figcaption>
            </figure>
          </div>
          <div className="studioConfirmActions">
            <button
              type="button"
              className="studioButton studioButton--ghost"
              onClick={clearDraft}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="studioButton studioButton--danger"
              onClick={handleConfirmReplace}
              disabled={busy}
            >
              {busy ? "Saving…" : "Confirm Replace & Save"}
            </button>
          </div>
          <p className="studioConfirmHint">
            Extra confirmation required. Enter confirms replace · Escape cancels
          </p>
        </div>
      ) : null}

      {step === "remove" && product.hasImage ? (
        <div
          className="studioConfirm studioConfirm--replace"
          role="dialog"
          aria-modal="true"
          aria-labelledby="studio-remove-title"
        >
          <h3 id="studio-remove-title" className="studioConfirmTitle">
            Remove image from {product.name}?
          </h3>
          <p className="studioConfirmBody">
            The product stays in the catalogue. Only its assigned image is
            removed. The customer app will show the no-image fallback until a new
            photo is assigned.
          </p>
          <div className="studioConfirmActions">
            <button
              type="button"
              className="studioButton studioButton--ghost"
              onClick={handleCancelRemove}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="studioButton studioButton--danger"
              onClick={() => {
                void handleConfirmRemove();
              }}
              disabled={busy}
            >
              {busy ? "Removing…" : "Remove image"}
            </button>
          </div>
          <p className="studioConfirmHint">
            This does not delete the product. Click Remove image to confirm.
            Escape cancels. There is no keyboard shortcut to remove.
          </p>
        </div>
      ) : null}

      {catalogWarning ? (
        <p className="studioError" role="status">
          {catalogWarning}
        </p>
      ) : null}

      {step === "idle" ? (
        <p className="studioIdleHint">
          {product.hasImage
            ? "Replace still needs the extra confirmation."
            : "Paste, drop, or choose a file — then Confirm & Save."}
        </p>
      ) : null}

      {product.hasImage && step === "idle" ? (
        <details className="studioTechDetails">
          <summary>Technical paths</summary>
          <dl className="studioMetaList">
            <div className="studioMetaRow">
              <dt>Card</dt>
              <dd className="studioMono">{product.image?.card || "None"}</dd>
            </div>
            <div className="studioMetaRow">
              <dt>Detail</dt>
              <dd className="studioMono">{product.image?.detail || "None"}</dd>
            </div>
            <div className="studioMetaRow">
              <dt>Original</dt>
              <dd className="studioMono">{product.image?.original || "None"}</dd>
            </div>
          </dl>
        </details>
      ) : null}
    </div>
  );
}

export default StudioImagePanel;
