import { formatUnitQuantity } from "../utils/unitDisplay";
import ProductThumb from "./ProductThumb";

function ProductCard({
  product,
  onOpen,
  onQuickAdd,
  cartQuantity = 0,
  onIncrease,
  onDecrease,
}) {
  const defaultOrder = formatUnitQuantity(
    product.defaultQuantity,
    product.defaultUnit
  );
  const inCart = cartQuantity > 0;
  const canStep = inCart && typeof onIncrease === "function";

  const handleCardClick = () => {
    onOpen(product);
  };

  const handleQuickAdd = (e) => {
    e.stopPropagation();
    onQuickAdd(product);
  };

  const handleIncrease = (e) => {
    e.stopPropagation();
    onIncrease(product.id);
  };

  const handleDecrease = (e) => {
    e.stopPropagation();
    onDecrease(product.id);
  };

  return (
    <article className="productCard">
      <button
        type="button"
        className="productCardMain"
        onClick={handleCardClick}
        aria-label={`${product.name}, pesanan default ${defaultOrder}`}
      >
        <ProductThumb product={product} variant="card" />

        <span className="productCardBody">
          <span className="productName">{product.name}</span>
          <span className="productDefaultOrder">{defaultOrder}</span>
        </span>
      </button>

      {canStep ? (
        <div className="productCardStepper">
          <div className="quantityStepper quantityStepper--compact">
            <button
              type="button"
              className="quantityButton"
              aria-label={`Kurangi ${product.name}`}
              onClick={handleDecrease}
            >
              −
            </button>
            <span className="quantityValue" aria-live="polite">
              {cartQuantity}
            </span>
            <button
              type="button"
              className="quantityButton"
              aria-label={`Tambah ${product.name}`}
              onClick={handleIncrease}
            >
              +
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="addButton"
          aria-label={`Tambah ${defaultOrder} ${product.name}`}
          onClick={handleQuickAdd}
        >
          Tambah
        </button>
      )}
    </article>
  );
}

export default ProductCard;
