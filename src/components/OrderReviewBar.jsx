function CartIcon() {
  return (
    <svg
      className="orderReviewBarGlyph"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="9" cy="20" r="1.4" fill="currentColor" />
      <circle cx="18" cy="20" r="1.4" fill="currentColor" />
      <path
        d="M4 5h1.6l1.9 10.2a1.6 1.6 0 0 0 1.6 1.3h8.1a1.6 1.6 0 0 0 1.6-1.3L21 8H7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OrderReviewBar({ cartCount, onOpenReview }) {
  const countLabel = cartCount === 1 ? "1 barang" : `${cartCount} barang`;

  return (
    <button
      type="button"
      className="orderReviewBar"
      onClick={onOpenReview}
      aria-label={`Lihat pesanan, ${countLabel}`}
    >
      <span className="orderReviewBarIcon" aria-hidden="true">
        <CartIcon />
      </span>
      <span className="orderReviewBarLabel">Lihat Pesanan</span>
      <span className="orderReviewBarCount" aria-live="polite">
        {countLabel}
      </span>
    </button>
  );
}

export default OrderReviewBar;
