import { useEffect } from "react";

function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  footer = null,
  scrollRef,
}) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const hasFooter = Boolean(footer);

  return (
    <div className="bottomSheetOverlay" onClick={onClose}>
      <div
        className={`bottomSheet${hasFooter ? " bottomSheet--hasFooter" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bottomSheetHandle" aria-hidden="true" />
        <div className="bottomSheetScroll" ref={scrollRef}>
          {children}
        </div>
        {hasFooter ? (
          <div className="bottomSheetFooter">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export default BottomSheet;
