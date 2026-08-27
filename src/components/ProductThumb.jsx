import { useState } from "react";

function EmptyGlyph() {
  return (
    <svg
      className="productThumbGlyphSvg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="5"
        y="8"
        width="14"
        height="11"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M9 8V7.4a3 3 0 0 1 6 0V8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProductThumb({ product, variant = "row", alt = "" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const src =
    variant === "detail"
      ? product?.image?.detail || product?.image?.card
      : product?.image?.card;
  const showImage = Boolean(src) && !imageFailed;

  if (showImage) {
    return (
      <img
        className={`productThumb productThumb--${variant}`}
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div
      className={`productThumb productThumb--${variant} productThumb--empty`}
      aria-hidden="true"
    >
      <EmptyGlyph />
    </div>
  );
}

export default ProductThumb;
