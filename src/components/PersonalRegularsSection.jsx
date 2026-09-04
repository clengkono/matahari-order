import ProductCard from "./ProductCard";

function PersonalRegularsSection({
  products,
  onOpen,
  onQuickAdd,
  getCartQuantity,
  onIncrease,
  onDecrease,
}) {
  if (!Array.isArray(products) || products.length === 0) {
    return null;
  }

  return (
    <section
      className="homeSection personalRegularsSection"
      aria-label="Sering Anda Pesan"
    >
      <div className="sectionTitle">Sering Anda Pesan</div>
      <ul className="personalRegularsRail">
        {products.slice(0, 8).map((product) => (
          <li key={product.id} className="personalRegularsRailItem">
            <ProductCard
              product={product}
              onOpen={onOpen}
              onQuickAdd={onQuickAdd}
              cartQuantity={getCartQuantity?.(product) ?? 0}
              onIncrease={onIncrease}
              onDecrease={onDecrease}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default PersonalRegularsSection;
