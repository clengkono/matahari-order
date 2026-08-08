import BottomSheet from "./BottomSheet";
import OrderReviewRow from "./OrderReviewRow";

function OrderReviewSheet({
  isOpen,
  onClose,
  cart,
  cartCount,
  lineCount,
  productUnitsById,
  recommendations = [],
  orderNote,
  onOrderNoteChange,
  onSendWhatsApp,
  onIncrease,
  onDecrease,
  onRemove,
  onChangeUnit,
  onAddRecommendation,
}) {
  const showRecommendations =
    cart.length > 0 && recommendations.length > 0;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Pesanan Saya">
      <h2 className="orderReviewSheetTitle">Pesanan Saya</h2>

      <p className="orderReviewSheetSummary" aria-live="polite">
        {cartCount} Barang • {lineCount} Produk
      </p>

      {cart.length === 0 ? (
        <p className="orderReviewSheetEmpty">Belum ada produk dalam pesanan.</p>
      ) : (
        <ul className="orderReviewList">
          {cart.map((line) => (
            <OrderReviewRow
              key={`${line.productId}::${line.unit}`}
              line={line}
              availableUnits={
                productUnitsById[line.productId] ?? [line.unit]
              }
              onIncrease={onIncrease}
              onDecrease={onDecrease}
              onRemove={onRemove}
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
              Mungkin Anda juga perlu
            </p>
          </div>
          <ul className="orderReviewRecommendationsList">
            {recommendations.map((product) => {
              const defaultOrder = `${product.defaultQuantity} ${product.defaultUnit}`;

              return (
                <li key={product.id} className="orderReviewRecommendationRow">
                  <div className="orderReviewRecommendationInfo">
                    <span className="orderReviewRecommendationName">
                      {product.name}
                    </span>
                    <span className="orderReviewRecommendationDefault">
                      {defaultOrder}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="orderReviewRecommendationAdd"
                    aria-label={`Tambah ${defaultOrder} ${product.name}`}
                    onClick={() => onAddRecommendation(product)}
                  >
                    Tambah
                  </button>
                </li>
              );
            })}
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
