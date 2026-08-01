import { useCallback, useState } from "react";
import "./App.css";
import products from "./data/products";
import ProductCard from "./components/ProductCard";
import ProductBottomSheet from "./components/ProductBottomSheet";
import { useCart } from "./context/CartContext";

const categories = [
  "🚬 Rokok",
  "🥤 Minuman",
  "🍳 Bahan & Bumbu Masak",
  "🧼 Perawatan",
  "🧹 Kebersihan",
];

function addProductDefaults(addToCart, product) {
  addToCart({
    productId: product.id,
    name: product.name,
    unit: product.defaultUnit,
    quantity: product.defaultQuantity,
  });
}

export default function App() {
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const { cartCount, addToCart } = useCart();

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  );

  const favoriteProducts = filteredProducts.filter(
    (product) => product.favorite
  );

  const handleQuickAdd = useCallback(
    (product) => {
      addProductDefaults(addToCart, product);
    },
    [addToCart]
  );

  const handleAddAll = useCallback(() => {
    favoriteProducts.forEach((product) => {
      addProductDefaults(addToCart, product);
    });
  }, [favoriteProducts, addToCart]);

  const handleOpenSheet = useCallback((product) => {
    setSelectedProduct(product);
  }, []);

  const handleCloseSheet = useCallback(() => {
    setSelectedProduct(null);
  }, []);

  return (
    <div className="app">
      <header className="header">
        <div className="headerTop">
          <h1>Matahari Order</h1>
          {cartCount > 0 && (
            <span
              className="cartBadge"
              aria-label={`${cartCount} item di keranjang`}
            >
              {cartCount}
            </span>
          )}
        </div>
        <p>Pesan kebutuhan toko dengan cepat.</p>
      </header>

      <div className="searchSection">
        <input
          className="searchBox"
          placeholder="Cari nama produk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Cari nama produk"
        />
      </div>

      <section>
        <div className="sectionTitle">
          ⭐ Sering Dipesan
        </div>

        {favoriteProducts.length > 0 ? (
          <>
            <div className="productGrid">
              {favoriteProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onOpen={handleOpenSheet}
                  onQuickAdd={handleQuickAdd}
                />
              ))}
            </div>

            <div className="addAllSection">
              <button
                type="button"
                className="addAllButton"
                onClick={handleAddAll}
              >
                Tambahkan Semua
              </button>
            </div>
          </>
        ) : (
          search.trim() !== "" && (
            <p className="emptyState">Produk tidak ditemukan.</p>
          )
        )}
      </section>

      <section>
        <div className="sectionTitle">
          Kategori
        </div>

        <div className="categoryGrid">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className="categoryButton"
            >
              {category}
            </button>
          ))}
        </div>
      </section>

      {selectedProduct && (
        <ProductBottomSheet
          key={selectedProduct.id}
          product={selectedProduct}
          onClose={handleCloseSheet}
          onAddToCart={addToCart}
        />
      )}
    </div>
  );
}
