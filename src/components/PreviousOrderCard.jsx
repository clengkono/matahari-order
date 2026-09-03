import {
  formatHistoryCardDate,
  getHistoryCardPreview,
} from "../utils/orderHistoryRestore";

function PreviousOrderCard({ order, products, onPesanLagi }) {
  const preview = getHistoryCardPreview(order, products);
  const dateLabel = formatHistoryCardDate(order.createdAt);
  const countLabel =
    preview.productCount === 1
      ? "1 produk"
      : `${preview.productCount} produk`;
  const namesLabel = preview.names.join(", ");
  const extraLabel =
    preview.extraCount > 0 ? `+${preview.extraCount} lagi` : "";

  return (
    <li className="previousOrderCard">
      <article className="previousOrderCardInner">
        {dateLabel ? (
          <p className="previousOrderCardDate">{dateLabel}</p>
        ) : null}
        <p className="previousOrderCardCount">{countLabel}</p>
        {namesLabel ? (
          <p className="previousOrderCardNames">
            {namesLabel}
            {extraLabel ? (
              <span className="previousOrderCardExtra"> {extraLabel}</span>
            ) : null}
          </p>
        ) : null}
        <button
          type="button"
          className="previousOrderCardButton"
          onClick={() => onPesanLagi(order)}
        >
          Pesan Lagi
        </button>
      </article>
    </li>
  );
}

export default PreviousOrderCard;
