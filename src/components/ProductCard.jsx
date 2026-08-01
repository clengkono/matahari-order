function ProductCard({ product, onOpen }) {
    const handleButtonClick = (e) => {
      e.stopPropagation();
      onOpen(product);
    };
  
    return (
      <div className="productCard" onClick={() => onOpen(product)}>
        <div className="imagePlaceholder">
          PRODUCT PHOTO
        </div>
  
        <div className="productName">
          {product.name}
        </div>
  
        <button
          className="addButton"
          onClick={handleButtonClick}
        >
          Tambah
        </button>
      </div>
    );
  }
  
  export default ProductCard;