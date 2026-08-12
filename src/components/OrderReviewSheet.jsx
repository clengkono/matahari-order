import { useState } from "react";
import BottomSheet from "./BottomSheet";
import OrderReviewRow from "./OrderReviewRow";

function RecommendationCard({ product, onAdd }) {
  const [imageFailed, setImageFailed] = useState(false);
  const defaultOrder = `${product.defaultQuantity} ${product.defaultUnit}`;
  const cardImage = product.image?.card;
  const showImage = Boolean(cardImage) && !imageFailed;

  return (
    <li className="orderReviewRecoCard">
      <div className="orderReviewRecoCardMedia">
        {showImage ? (
          <img
            className="orderReviewRecoCardImage"
            src={cardImage}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div
            className="orderReviewRecoCardImage orderReviewRecoCardImage--placeholder"
            aria-hidden="true"
          >
            PHOTO
          </div>
        )}
        <button
          type="button"
          className="orderReviewRecoCardAdd"
          aria-label={`Tambah ${defaultOrder} ${product.name}`}
          onClick={() => onAdd(product)}
        >
          +
        </button>
      </div>
      <span className="orderReviewRecoCardName">{product.name}</span>
      <span className="orderReviewRecoCardDefault">{defaultOrder}</span>
    </li>
  );
}

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
