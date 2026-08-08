import { useState } from "react";

function ProductCard({ product, onOpen, onQuickAdd }) {
  const [imageFailed, setImageFailed] = useState(false);
  const defaultOrder = `${product.defaultQuantity} ${product.defaultUnit}`;
  const cardImage = product.image?.card;
  const showImage = Boolean(cardImage) && !imageFailed;

  const handleCardClick = () => {
    onOpen(product);
  };

  const handleQuickAdd = (e) => {
    e.stopPropagation();
    onQuickAdd(product);
  };

  return (
    <article
      className="productCard"
      onClick={handleCardClick}
      aria-label={`${product.name}, pesanan default ${defaultOrder}`}
    >
      {showImage ? (
        <img
          className="productCardImage"
          src={cardImage}
          alt={product.name}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="imagePlaceholder">
          PRODUCT PHOTO
        </div>
      )}

      <div className="productCardBody">
        <div className="productName">
          {product.name}
        </div>

        <span className="productDefaultOrder">
          {defaultOrder}
        </span>
      </div>

      <button
        type="button"
        className="addButton"
        aria-label={`Tambah ${defaultOrder} ${product.name}`}
        onClick={handleQuickAdd}
      >
        Tambah
      </button>
    </article>
  );
}

export default ProductCard;
