import { useState } from "react";

function RecommendationCard({ product, onAdd, onOpen }) {
  const [imageFailed, setImageFailed] = useState(false);
  const defaultOrder = `${product.defaultQuantity} ${product.defaultUnit}`;
  const cardImage = product.image?.card;
  const showImage = Boolean(cardImage) && !imageFailed;
  const isOpenable = typeof onOpen === "function";

  const handleCardActivate = () => {
    if (isOpenable) {
      onOpen(product);
    }
  };

  const handleKeyDown = (event) => {
    if (!isOpenable) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(product);
    }
  };

  const handleAdd = (event) => {
    event.stopPropagation();
    onAdd(product);
  };

  return (
    <li className="orderReviewRecoCard">
      <div
        className={`orderReviewRecoCardInner${isOpenable ? " orderReviewRecoCardInner--openable" : ""}`}
        role={isOpenable ? "button" : undefined}
        tabIndex={isOpenable ? 0 : undefined}
        aria-label={
          isOpenable
            ? `Lihat ${product.name}`
            : undefined
        }
        onClick={isOpenable ? handleCardActivate : undefined}
        onKeyDown={isOpenable ? handleKeyDown : undefined}
      >
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
            onClick={handleAdd}
          >
            +
          </button>
        </div>
        <span className="orderReviewRecoCardName">{product.name}</span>
        <span className="orderReviewRecoCardDefault">{defaultOrder}</span>
      </div>
    </li>
  );
}

export default RecommendationCard;
