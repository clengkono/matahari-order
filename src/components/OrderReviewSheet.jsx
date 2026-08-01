import BottomSheet from "./BottomSheet";
import OrderReviewRow from "./OrderReviewRow";

function OrderReviewSheet({
  isOpen,
  onClose,
  cart,
  cartCount,
  lineCount,
  productUnitsById,
  onIncrease,
  onDecrease,
  onRemove,
  onChangeUnit,
}) {
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
          disabled
          aria-disabled="true"
        >
          Kirim via WhatsApp
        </button>
      </div>
    </BottomSheet>
  );
}

export default OrderReviewSheet;
