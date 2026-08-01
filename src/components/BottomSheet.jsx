import { useEffect } from "react";

function BottomSheet({ isOpen, onClose, title, children }) {

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
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="bottomSheetOverlay" onClick={onClose}>
      <div
        className="bottomSheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bottomSheetHandle" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

export default BottomSheet;
