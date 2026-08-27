import ProductCard from "./ProductCard";

function ProductGrid({
  products,
  onOpen,
  onQuickAdd,
  getCartQuantity,
  onIncrease,
  onDecrease,
}) {
  return (
    <div className="productGrid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onOpen={onOpen}
          onQuickAdd={onQuickAdd}
          cartQuantity={getCartQuantity?.(product) ?? 0}
          onIncrease={onIncrease}
          onDecrease={onDecrease}
        />
      ))}
    </div>
  );
}

export default ProductGrid;
