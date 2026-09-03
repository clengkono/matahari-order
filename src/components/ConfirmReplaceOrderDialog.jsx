import BottomSheet from "./BottomSheet";
import { formatReplaceCartBody } from "../utils/orderHistoryRestore";

function ConfirmReplaceOrderDialog({
  isOpen,
  currentLineCount,
  onConfirm,
  onCancel,
}) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onCancel}
      title="Ganti pesanan saat ini?"
      dismissible
      footer={
        <div className="confirmReplaceActions">
          <button
            type="button"
            className="orderReviewWhatsAppButton"
            onClick={onConfirm}
          >
            Ganti pesanan
          </button>
          <button
            type="button"
            className="orderReviewContinueButton"
            onClick={onCancel}
          >
            Batal
          </button>
        </div>
      }
    >
      <h2 className="confirmReplaceTitle">Ganti pesanan saat ini?</h2>
      <p className="confirmReplaceBody">{formatReplaceCartBody(currentLineCount)}</p>
    </BottomSheet>
  );
}

export default ConfirmReplaceOrderDialog;
