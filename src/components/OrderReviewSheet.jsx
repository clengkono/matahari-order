import { useLayoutEffect, useRef } from "react";
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
  whatsAppHandoffStatus = "idle",
  onSendWhatsApp,
  onConfirmWhatsAppSent,
  onReturnFromWhatsAppHandoff,
  onIncrease,
  onDecrease,
  onRemoveProduct,
  onChangeUnit,
  onAddRecommendation,
}) {
  const scrollRef = useRef(null);
  const showHandoff = whatsAppHandoffStatus === "opened";
  const lockSheetDismiss =
    whatsAppHandoffStatus === "opening" ||
    whatsAppHandoffStatus === "opened";
  const showRecommendations =
    !showHandoff && cart.length > 0 && recommendations.length > 0;
  const isSendDisabled =
    cart.length === 0 ||
    whatsAppHandoffStatus === "opening" ||
    whatsAppHandoffStatus === "opened";

  useLayoutEffect(() => {
    if (!isOpen || !showHandoff) {
      return;
    }

    const scroller = scrollRef.current;
    if (scroller) {
      scroller.scrollTop = 0;
    }
  }, [isOpen, showHandoff]);

  const sendFooter = showHandoff ? null : (
    <div className="orderReviewSheetFooter">
      {whatsAppHandoffStatus === "failed" ? (
        <p className="orderReviewHandoffError" role="alert">
          WhatsApp tidak dapat dibuka.
          <br />
          Coba lagi.
        </p>
      ) : null}
      <button
        type="button"
        className="orderReviewWhatsAppButton"
        disabled={isSendDisabled}
        aria-disabled={isSendDisabled}
        onClick={onSendWhatsApp}
      >
        Kirim via WhatsApp
      </button>
    </div>
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Pesanan Saya"
      scrollRef={scrollRef}
      footer={sendFooter}
      dismissible={!lockSheetDismiss}
    >
      <h2 className="orderReviewSheetTitle">Pesanan Saya</h2>

      {showHandoff ? (
        <div className="orderReviewHandoff" aria-live="polite" aria-atomic="true">
          <h3 className="orderReviewHandoffTitle">WhatsApp dibuka</h3>
          <p className="orderReviewHandoffBody">
            Periksa pesan di WhatsApp lalu tekan Kirim.
          </p>
          <p className="orderReviewHandoffClearHint">
            Pesanan di aplikasi akan dihapus setelah Anda memilih “Saya sudah kirim”.
          </p>
          <div className="orderReviewSheetActions">
            <button
              type="button"
              className="orderReviewWhatsAppButton"
              onClick={onConfirmWhatsAppSent}
              aria-label="Saya sudah kirim di WhatsApp. Pesanan di aplikasi akan dihapus."
            >
              Saya sudah kirim
            </button>
            <button
              type="button"
              className="orderReviewContinueButton"
              onClick={onReturnFromWhatsAppHandoff}
              aria-label="Belum kirim. Kembali ke pesanan"
            >
              Belum, kembali
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="orderReviewSheetSummary" aria-live="polite">
            {cartCount} Barang • {productCount} Produk
          </p>

          {cart.length === 0 ? (
            <p className="orderReviewSheetEmpty">
              Belum ada produk dalam pesanan.
            </p>
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
          </div>
        </>
      )}
    </BottomSheet>
  );
}

export default OrderReviewSheet;
