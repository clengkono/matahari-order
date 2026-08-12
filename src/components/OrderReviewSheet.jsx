import BottomSheet from "./BottomSheet";
import OrderReviewRow from "./OrderReviewRow";
import RecommendationCard from "./RecommendationCard";

function OrderReviewSheet({
  isOpen,
  onClose,
  cart,
  cartCount,
  productCount,
  productUnitsById,
  productsById = {},
  recommendations = [],
  orderNote,
  onOrderNoteChange,
  onSendWhatsApp,
  onIncrease,
  onDecrease,
  onRemoveProduct,
  onChangeUnit,
  onAddRecommendation,
}) {
  const showRecommendations =
    cart.length > 0 && recommendations.length > 0;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Pesanan Saya">
      <h2 className="orderReviewSheetTitle">Pesanan Saya</h2>

      <p className="orderReviewSheetSummary" aria-live="polite">
        {cartCount} Barang • {productCount} Produk
      </p>

      {cart.length === 0 ? (
        <p className="orderReviewSheetEmpty">Belum ada produk dalam pesanan.</p>
      ) : (
        <ul className="orderReviewList">
          {cart.map((line) => (
            <OrderReviewRow
              key={line.productId}
              line={line}
              imageCard={productsById[line.productId]?.image?.card}
              availableUnits={
                productUnitsById[line.productId] ?? [line.unit]
              }
              onIncrease={onIncrease}
              onDecrease={onDecrease}
              onRemoveProduct={onRemoveProduct}
              onChangeUnit={onChangeUnit}
            />
          ))}
        </ul>
      )}

      {showRecommendations && (
        <section
          className="orderReviewRecommendations"
          aria-label="Sering Dipesan Bersama"
        >
          <div className="orderReviewRecommendationsHeader">
            <h3 className="orderReviewRecommendationsTitle">
              <span
                className="orderReviewRecommendationsAccent"
                aria-hidden="true"
              >
                ✦
              </span>
              Sering Dipesan Bersama
            </h3>
            <p className="orderReviewRecommendationsHint">
              Geser untuk melihat lebih banyak
            </p>
          </div>
          <ul className="orderReviewRecoCarousel">
            {recommendations.map((product) => (
              <RecommendationCard
                key={product.id}
                product={product}
                onAdd={onAddRecommendation}
              />
            ))}
          </ul>
        </section>
      )}

      {cart.length > 0 && (
        <div className="orderReviewNoteField">
          <label className="orderReviewNoteLabel" htmlFor="orderReviewNote">
            Catatan
          </label>
          <textarea
            id="orderReviewNote"
            className="orderReviewNoteInput"
            value={orderNote}
            onChange={(event) => onOrderNoteChange(event.target.value)}
            placeholder="Tambahkan catatan untuk toko..."
            rows={3}
          />
        </div>
      )}

      <div className="orderReviewSheetActions">
        <button
          type="button"
          className="orderReviewContinueButton"
          onClick={onClose}
        >
          Tambah Produk
        </button>
        <button
          type="button"
          className="orderReviewWhatsAppButton"
          disabled={cart.length === 0}
          aria-disabled={cart.length === 0}
          onClick={onSendWhatsApp}
        >
          Kirim via WhatsApp
        </button>
      </div>
    </BottomSheet>
  );
}

export default OrderReviewSheet;
