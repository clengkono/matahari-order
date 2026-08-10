import { useCallback, useMemo, useState } from "react";
import "./App.css";
import products, { aliases, catalogRecommendations } from "./catalog";
import OrderReviewBar from "./components/OrderReviewBar";
import OrderReviewSheet from "./components/OrderReviewSheet";
import ProductCard from "./components/ProductCard";
import ProductBottomSheet from "./components/ProductBottomSheet";
import SearchResultRow from "./components/SearchResultRow";
import { useCart } from "./context/CartContext";
import { findCartLine } from "./utils/cartHelpers";
import {
  normalizeSearchText,
  searchProducts,
} from "./utils/productSearch";
import { getRecommendedProducts } from "./utils/recommendations";
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

  const frequentlyOrderedTogether = useMemo(
    () =>
      getRecommendedProducts({
        cart,
        relationships: catalogRecommendations,
        products,
        limit: 3,
      }),
    [cart]
  );

  const hasOrder = lineCount > 0;

  const normalizedSearch = normalizeSearchText(search);
  const isSearching = normalizedSearch !== "";

  const favoriteProducts = useMemo(
    () => products.filter((product) => product.favorite),
    []
  );

  // Tier 1 name matches, then Tier 2 alias-only matches (no duplicates).
  const { searchResultProducts, hasSearchHits } = useMemo(() => {
    if (!isSearching) {
      return { searchResultProducts: [], hasSearchHits: false };
    }

    const { results } = searchProducts({
      query: normalizedSearch,
      products,
      aliases,
    });

    return {
      searchResultProducts: results,
      hasSearchHits: results.length > 0,
    };
  }, [isSearching, normalizedSearch]);

  const searchRecommendations = useMemo(() => {
    if (!hasSearchHits) {
      return [];
    }

    const searchIds = new Set(searchResultProducts.map((product) => product.id));
    const cartProductIds = new Set(cart.map((line) => line.productId));

    // Whole-cart ranking (Release 0.7/0.9): treat all genuine search hits
    // (name + alias) as recommendation sources; include cart IDs so in-cart
    // items are excluded. Edges come from sales/manual provenance data.
    const recommendationSources = [
      ...searchResultProducts.map((product) => ({ productId: product.id })),
      ...cart.map((line) => ({ productId: line.productId })),
    ];

    return getRecommendedProducts({
      cart: recommendationSources,
      relationships: catalogRecommendations,
      products,
      limit: 3,
    }).filter(
      (product) =>
        !searchIds.has(product.id) && !cartProductIds.has(product.id)
    );
  }, [hasSearchHits, searchResultProducts, cart]);

  const getDefaultUnitQuantity = useCallback(
    (product) => {
      const line = findCartLine(cart, product.id, product.defaultUnit);
      return line?.quantity ?? 0;
    },
    [cart]
  );

  const handleQuickAdd = useCallback(
    (product) => {
      addProductDefaults(addToCart, product);
    },
    [addToCart]
  );

  function handleAddAll() {
    favoriteProducts.forEach((product) => {
      addProductDefaults(addToCart, product);
    });
  }

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

  const handleAddRecommendation = useCallback(
    (product) => {
      addProductDefaults(addToCart, product);
    },
    [addToCart]
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

      {!isSearching && (
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
          ) : null}
        </section>
      )}

      {isSearching && hasSearchHits && (
        <section className="searchResultsSection" aria-label="Hasil pencarian">
          <div className="sectionTitle">Hasil Pencarian</div>
          <div className="searchResultList">
            {searchResultProducts.map((product) => (
              <SearchResultRow
                key={product.id}
                product={product}
                cartQuantity={getDefaultUnitQuantity(product)}
                onOpen={handleOpenSheet}
                onQuickAdd={handleQuickAdd}
                onIncrease={handleIncreaseQuantity}
                onDecrease={handleDecreaseQuantity}
              />
            ))}
          </div>

          {searchRecommendations.length > 0 && (
            <div className="searchRecommendations">
              <h2 className="searchRecommendationsTitle">
                Mungkin Anda juga perlu
              </h2>
              <div className="searchResultList searchResultList--recommendations">
                {searchRecommendations.map((product) => (
                  <SearchResultRow
                    key={product.id}
                    product={product}
                    cartQuantity={getDefaultUnitQuantity(product)}
                    onOpen={handleOpenSheet}
                    onQuickAdd={handleQuickAdd}
                    onIncrease={handleIncreaseQuantity}
                    onDecrease={handleDecreaseQuantity}
                    subordinate
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {isSearching && !hasSearchHits && (
        <p className="emptyState">Produk tidak ditemukan.</p>
      )}

      {!isSearching && (
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
      )}

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
        recommendations={frequentlyOrderedTogether}
        orderNote={orderNote}
        onOrderNoteChange={handleOrderNoteChange}
        onSendWhatsApp={handleSendWhatsApp}
        onIncrease={handleIncreaseQuantity}
        onDecrease={handleDecreaseQuantity}
        onRemove={handleRemoveFromCart}
        onChangeUnit={changeUnit}
        onAddRecommendation={handleAddRecommendation}
      />
    </div>
  );
}
