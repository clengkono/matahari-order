import { useEffect, useId, useRef, useState } from "react";
import {
  assignProductImage,
  clipboardImageFile,
  fileToBase64,
  mimeFromFile,
  validateImageFile,
} from "../utils/studioApi";

function StudioImagePanel({ product, onSaved }) {
  const inputId = useId();
  const fileInputRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("idle"); // idle | assign | replace
  const [dragOver, setDragOver] = useState(false);

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

  async function acceptFile(file) {
    setError("");
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
      setStep("assign");
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
      onSavedRef.current?.(result);
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

  useEffect(() => {
    if (!product) {
      return undefined;
    }

    function onKeyDown(event) {
      const currentStep = stepRef.current;
      if (currentStep !== "assign" && currentStep !== "replace") {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        clearDraft();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (currentStep === "assign") {
          handleConfirmAssign();
        } else {
          handleConfirmReplace();
        }
      }
    }

    async function onPaste(event) {
      if (!productRef.current) {
        return;
      }
      const file = await clipboardImageFile(event.clipboardData);
      if (!file) {
        return;
      }
      event.preventDefault();
      void acceptFile(file);
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

  return (
    <div className="studioPanel">
      <div className="studioPanelHeader">
        <h2 className="studioProductTitle">{product.name}</h2>
        <p className="studioProductMeta">{product.id}</p>
      </div>

      <div className="studioCurrentImage">
        {currentCard ? (
          <img
            src={currentCard}
            alt={`Current card image for ${product.name}`}
            className="studioCurrentImagePhoto"
          />
        ) : (
          <div className="studioMissingImage" role="status">
            Missing Image
          </div>
        )}
      </div>

      <div
        className={`studioDropzone${dragOver ? " studioDropzone--active" : ""}`}
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
          const file = event.dataTransfer?.files?.[0];
          if (file) {
            void acceptFile(file);
          } else {
            setError("Drop a JPEG, PNG, or WebP image.");
          }
        }}
      >
        <p className="studioDropzoneTitle">Drop image here</p>
        <p className="studioDropzoneHint">
          JPEG, PNG, or WebP · max 15 MB · or Ctrl+V to paste
        </p>
        <div className="studioDropzoneActions">
          <label className="studioButton studioButton--secondary" htmlFor={inputId}>
            Choose File
          </label>
          <input
            id={inputId}
            ref={fileInputRef}
            className="studioFileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void acceptFile(file);
              }
            }}
          />
        </div>
      </div>

      {error ? (
        <p className="studioError" role="alert">
          {error}
        </p>
      ) : null}

      {step === "assign" && draft ? (
        <div
          className="studioConfirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="studio-assign-title"
        >
          <h3 id="studio-assign-title" className="studioConfirmTitle">
            Assign this image to: {product.name}
          </h3>
          <img
            src={draft.previewUrl}
            alt={`Preview for ${product.name}`}
            className="studioConfirmPreview"
          />
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
            Press Enter to confirm · Escape to cancel
          </p>
        </div>
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
            The current card, detail, and original files for this product will be
            overwritten. A catalogue backup will be created first.
          </p>
          <img
            src={draft.previewUrl}
            alt={`Replacement preview for ${product.name}`}
            className="studioConfirmPreview"
          />
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
            Press Enter to confirm replace · Escape to cancel
          </p>
        </div>
      ) : null}

      {step === "idle" ? (
        <p className="studioIdleHint">
          {product.hasImage
            ? "Ready to replace the image when you choose a file."
            : "Choose or paste an image, then confirm to save."}
        </p>
      ) : null}
    </div>
  );
}

export default StudioImagePanel;
