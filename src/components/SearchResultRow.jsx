import { useState } from "react";
import { formatUnitQuantity } from "../utils/unitDisplay";

function SearchResultRow({
  product,
  cartQuantity = 0,
  onOpen,
  onQuickAdd,
  onIncrease,
  onDecrease,
  subordinate = false,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const defaultOrder = formatUnitQuantity(
    product.defaultQuantity,
    product.defaultUnit
  );
  const cardImage = product.image?.card;
  const showImage = Boolean(cardImage) && !imageFailed;
  const inCart = cartQuantity > 0;

  const handleOpen = () => {
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
    <article
      className={`searchResultRow${subordinate ? " searchResultRow--subordinate" : ""}`}
    >
      <button
        type="button"
        className="searchResultRowMain"
        onClick={handleOpen}
        aria-label={`${product.name}, buka detail. Default ${defaultOrder}`}
      >
        {showImage ? (
          <img
            className="searchResultThumb"
            src={cardImage}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="searchResultThumb searchResultThumb--placeholder" aria-hidden="true">
            PRODUCT PHOTO
          </div>
        )}

        <span className="searchResultText">
          <span className="searchResultName">{product.name}</span>
          <span className="searchResultDefault">{defaultOrder}</span>
        </span>
      </button>

      {inCart ? (
        <div className="searchResultStepper">
          <div className="quantityStepper">
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
          className="searchResultAdd"
          aria-label={`Tambah ${defaultOrder} ${product.name}`}
          onClick={handleQuickAdd}
        >
          Tambah
        </button>
      )}
    </article>
  );
}

export default SearchResultRow;
