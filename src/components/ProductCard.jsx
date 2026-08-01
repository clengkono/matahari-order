function ProductCard({ product, onOpen, onQuickAdd }) {
  const defaultOrder = `${product.defaultQuantity} ${product.defaultUnit}`;

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
      <div className="imagePlaceholder">
        PRODUCT PHOTO
      </div>

      <div className="productName">
        {product.name}
      </div>

      <div className="productDefaultOrder">
        {defaultOrder}
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
