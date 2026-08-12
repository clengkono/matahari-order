import { useCallback, useMemo, useRef, useState } from "react";
import "./App.css";
import products, { aliases, catalogRecommendations } from "./catalog";
import OrderReviewBar from "./components/OrderReviewBar";
import OrderReviewSheet from "./components/OrderReviewSheet";
import ProductCard from "./components/ProductCard";
import ProductBottomSheet from "./components/ProductBottomSheet";
import SearchResultRow from "./components/SearchResultRow";
import SearchShortcuts from "./components/SearchShortcuts";
import { HOMEPAGE_FEATURED_PRODUCT_IDS } from "./config/homepageFeatured";
import { POPULAR_SEARCHES } from "./config/popularSearches";
import { useCart } from "./context/CartContext";
import { findProductLine } from "./utils/cartHelpers";
import {
  normalizeSearchText,
  searchProducts,
} from "./utils/productSearch";
import { getRecommendedProducts } from "./utils/recommendations";
import {
  clearRecentSearches,
  loadRecentSearches,
  rememberRecentSearch,
} from "./utils/recentSearches";
import { openWhatsAppWithOrder } from "./utils/whatsapp";

const categories = [
  "🚬 Rokok",
  "🥤 Minuman",
  "🍳 Bahan & Bumbu Masak",
  "🧼 Perawatan",
  "🧹 Kebersihan",
];

const productsById = Object.fromEntries(
  products.map((product) => [product.id, product])
);

const homepageFeaturedProducts = HOMEPAGE_FEATURED_PRODUCT_IDS.map(
  (productId) => productsById[productId]
).filter(Boolean);

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
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState(loadRecentSearches);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [orderNote, setOrderNote] = useState("");
  const searchInputRef = useRef(null);
  const {
    cart,
    cartCount,
    lineCount,
    productCount,
    addToCart,
    removeProduct,
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
        limit: 8,
      }),
    [cart]
  );

  const hasOrder = lineCount > 0;

  const normalizedSearch = normalizeSearchText(search);
  const isSearching = normalizedSearch !== "";
  const showSearchShortcuts = isSearchFocused && !isSearching;

  const recordRecentSearch = useCallback((query) => {
    setRecentSearches((current) => rememberRecentSearch(query, current));
  }, []);

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
      const line = findProductLine(cart, product.id);
      return line?.quantity ?? 0;
    },
    [cart]
  );

  const handleQuickAdd = useCallback(
    (product) => {
      if (normalizeSearchText(search)) {
        recordRecentSearch(search);
      }
      addProductDefaults(addToCart, product);
    },
    [addToCart, recordRecentSearch, search]
  );

  const handleOpenSheet = useCallback(
    (product) => {
      if (normalizeSearchText(search)) {
        recordRecentSearch(search);
      }
      setSelectedProduct(product);
    },
    [recordRecentSearch, search]
  );

  const handleSelectSearchShortcut = useCallback(
    (term) => {
      setSearch(term);
      recordRecentSearch(term);
    },
    [recordRecentSearch]
  );

  const handleClearRecentSearches = useCallback(() => {
    setRecentSearches(clearRecentSearches());
  }, []);

  const handleSearchFocus = useCallback(() => {
    setIsSearchFocused(true);
  }, []);

  const handleSearchBlur = useCallback(() => {
    setIsSearchFocused(false);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearch("");
    searchInputRef.current?.focus();
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
    (productId) => {
      const line = findProductLine(cart, productId);
      if (line) {
        updateQuantity(productId, line.quantity + 1);
      }
    },
    [cart, updateQuantity]
  );

  const handleDecreaseQuantity = useCallback(
    (productId) => {
      const line = findProductLine(cart, productId);
      if (line) {
        const willEmptyCart = lineCount === 1 && line.quantity === 1;
        updateQuantity(productId, line.quantity - 1);
        if (willEmptyCart) {
          setOrderNote("");
        }
      }
    },
    [cart, lineCount, updateQuantity]
  );

  const handleRemoveProduct = useCallback(
    (productId) => {
      const remainingLines = cart.filter((line) => line.productId !== productId);
      removeProduct(productId);
      if (remainingLines.length === 0) {
        setOrderNote("");
      }
    },
    [cart, removeProduct]
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
        <div
          className={`searchField${search ? " searchField--hasValue" : ""}`}
        >
          <input
            ref={searchInputRef}
            className="searchBox"
            placeholder="Cari produk..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
            aria-label="Cari produk"
          />
          {search ? (
            <button
              type="button"
              className="searchClearButton"
              aria-label="Hapus pencarian"
              onMouseDown={(event) => {
                // Keep focus on the input; avoid blur flicker before clear.
                event.preventDefault();
              }}
              onClick={handleClearSearch}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
      </div>

      {showSearchShortcuts && (
        <SearchShortcuts
          recentSearches={recentSearches}
          popularSearches={POPULAR_SEARCHES}
          onSelect={handleSelectSearchShortcut}
          onClearRecent={handleClearRecentSearches}
        />
      )}

      {!isSearching && (
        <section>
          <div className="sectionTitle">
            ⭐ Sering Dipesan
          </div>

          {homepageFeaturedProducts.length > 0 ? (
            <div className="productGrid">
              {homepageFeaturedProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onOpen={handleOpenSheet}
                  onQuickAdd={handleQuickAdd}
                />
              ))}
            </div>
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
          initialUnit={findProductLine(cart, selectedProduct.id)?.unit}
          onClose={handleCloseSheet}
          onAddToCart={addToCart}
        />
      )}

      {hasOrder && (
        <OrderReviewBar
          cartCount={cartCount}
          productCount={productCount}
          onOpenReview={handleOpenReview}
        />
      )}

      <OrderReviewSheet
        isOpen={isReviewOpen}
        onClose={handleCloseReview}
        cart={cart}
        cartCount={cartCount}
        productCount={productCount}
        productUnitsById={productUnitsById}
        productsById={productsById}
        recommendations={frequentlyOrderedTogether}
        orderNote={orderNote}
        onOrderNoteChange={handleOrderNoteChange}
        onSendWhatsApp={handleSendWhatsApp}
        onIncrease={handleIncreaseQuantity}
        onDecrease={handleDecreaseQuantity}
        onRemoveProduct={handleRemoveProduct}
        onChangeUnit={changeUnit}
        onAddRecommendation={handleAddRecommendation}
      />
    </div>
  );
}
