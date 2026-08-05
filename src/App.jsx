import { useCallback, useMemo, useState } from "react";
import "./App.css";
import products from "./catalog";
import OrderReviewBar from "./components/OrderReviewBar";
import OrderReviewSheet from "./components/OrderReviewSheet";
import ProductCard from "./components/ProductCard";
import ProductBottomSheet from "./components/ProductBottomSheet";
import { useCart } from "./context/CartContext";
import { findCartLine } from "./utils/cartHelpers";
import { openWhatsAppWithOrder } from "./utils/whatsapp";

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
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [orderNote, setOrderNote] = useState("");
  const {
    cart,
    cartCount,
    lineCount,
    addToCart,
    removeFromCart,
    updateQuantity,
    changeUnit,
  } = useCart();

  const productUnitsById = useMemo(
    () =>
      Object.fromEntries(
        products.map((product) => [product.id, product.availableUnits])
      ),
    []
  );

  const hasOrder = lineCount > 0;

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

  const handleOpenReview = useCallback(() => {
    setIsReviewOpen(true);
  }, []);

  const handleCloseReview = useCallback(() => {
    setIsReviewOpen(false);
  }, []);

  const handleOrderNoteChange = useCallback((value) => {
    setOrderNote(value);
  }, []);

  const handleSendWhatsApp = useCallback(() => {
    openWhatsAppWithOrder(cart, orderNote);
  }, [cart, orderNote]);

  const handleIncreaseQuantity = useCallback(
    (productId, unit) => {
      const line = findCartLine(cart, productId, unit);
      if (line) {
        updateQuantity(productId, unit, line.quantity + 1);
      }
    },
    [cart, updateQuantity]
  );

  const handleDecreaseQuantity = useCallback(
    (productId, unit) => {
      const line = findCartLine(cart, productId, unit);
      if (line) {
        const willEmptyCart = lineCount === 1 && line.quantity === 1;
        updateQuantity(productId, unit, line.quantity - 1);
        if (willEmptyCart) {
          setOrderNote("");
        }
      }
    },
    [cart, lineCount, updateQuantity]
  );

  const handleRemoveFromCart = useCallback(
    (productId, unit) => {
      removeFromCart(productId, unit);
      if (lineCount === 1) {
        setOrderNote("");
      }
    },
    [lineCount, removeFromCart]
  );

  return (
    <div className={`app${hasOrder ? " app--hasReviewBar" : ""}`}>
      <header className="header">
        <div className="headerTop">
          <h1>Matahari Order</h1>
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

      {hasOrder && (
        <OrderReviewBar
          cartCount={cartCount}
          lineCount={lineCount}
          onOpenReview={handleOpenReview}
        />
      )}

      <OrderReviewSheet
        isOpen={isReviewOpen}
        onClose={handleCloseReview}
        cart={cart}
        cartCount={cartCount}
        lineCount={lineCount}
        productUnitsById={productUnitsById}
        orderNote={orderNote}
        onOrderNoteChange={handleOrderNoteChange}
        onSendWhatsApp={handleSendWhatsApp}
        onIncrease={handleIncreaseQuantity}
        onDecrease={handleDecreaseQuantity}
        onRemove={handleRemoveFromCart}
        onChangeUnit={changeUnit}
      />
    </div>
  );
}
