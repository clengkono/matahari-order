function OrderReviewBar({ cartCount, lineCount, onOpenReview }) {
  return (
    <div className="orderReviewBar" role="region" aria-label="Ringkasan pesanan">
      <p className="orderReviewBarSummary" aria-live="polite">
        <span aria-hidden="true">🛒 </span>
        {cartCount} Barang • {lineCount} Produk
      </p>
      <button
        type="button"
        className="orderReviewBarButton"
        onClick={onOpenReview}
      >
        Lihat Pesanan
      </button>
    </div>
  );
}

export default OrderReviewBar;
