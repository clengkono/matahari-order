import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import products, { aliases, catalogRecommendations } from "./catalog";
import OrderReviewBar from "./components/OrderReviewBar";
import OrderReviewSheet from "./components/OrderReviewSheet";
import ProductCard from "./components/ProductCard";
import ProductInfoView from "./components/ProductInfoView";
import SearchResultRow from "./components/SearchResultRow";
import SearchShortcuts from "./components/SearchShortcuts";
import {
  getCategoryPresentation,
  getVisibleCategories,
} from "./config/categories";
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
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [productStack, setProductStack] = useState([]);
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

  const selectedProduct =
    productStack.length > 0 ? productStack[productStack.length - 1] : null;
  const isProductInfoOpen = selectedProduct != null;
  const isCategoryMode = selectedCategory != null;

  const visibleCategories = useMemo(
    () => getVisibleCategories(products),
    []
  );

  const categoryPresentation = useMemo(
    () => getCategoryPresentation(selectedCategory),
    [selectedCategory]
  );

  const categoryProducts = useMemo(() => {
    if (!selectedCategory) {
      return [];
    }

    return products.filter(
      (product) => product.category === selectedCategory
    );
  }, [selectedCategory]);

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

  const productPageRecommendations = useMemo(() => {
    if (!selectedProduct) {
      return [];
    }

    const recommendationSources = [
      { productId: selectedProduct.id },
      ...cart.map((line) => ({ productId: line.productId })),
    ];

    return getRecommendedProducts({
      cart: recommendationSources,
      relationships: catalogRecommendations,
      products,
      limit: 8,
    });
  }, [selectedProduct, cart]);

  const hasOrder = lineCount > 0;
  const showReviewBar = hasOrder && !isProductInfoOpen;

  useEffect(() => {
    if (!isProductInfoOpen && !isReviewOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isProductInfoOpen, isReviewOpen]);

  const normalizedSearch = normalizeSearchText(search);
  const isSearching = normalizedSearch !== "";
  const showHomepage = !isCategoryMode && !isSearching;
  // Shortcuts stay homepage/global only — never in category mode (Stage 2A).
  const showSearchShortcuts =
    !isCategoryMode && isSearchFocused && !isSearching;

  const recordRecentSearch = useCallback((query) => {
    setRecentSearches((current) => rememberRecentSearch(query, current));
  }, []);

  // Global search: full catalogue. Category search: categoryProducts only.
  const { searchResultProducts, hasSearchHits } = useMemo(() => {
    if (!isSearching) {
      return { searchResultProducts: [], hasSearchHits: false };
    }

    const searchPool = isCategoryMode ? categoryProducts : products;
    const { results } = searchProducts({
      query: normalizedSearch,
      products: searchPool,
      aliases,
    });

    return {
      searchResultProducts: results,
      hasSearchHits: results.length > 0,
    };
  }, [isSearching, normalizedSearch, isCategoryMode, categoryProducts]);

  const categoryResultProducts = isSearching
    ? searchResultProducts
    : categoryProducts;
  const hasCategoryHits = categoryResultProducts.length > 0;

  // Search recommendations: global search only (not category mode).
  const searchRecommendations = useMemo(() => {
    if (isCategoryMode || !hasSearchHits) {
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
  }, [isCategoryMode, hasSearchHits, searchResultProducts, cart]);

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

  const handleOpenProduct = useCallback(
    (product) => {
      if (normalizeSearchText(search)) {
        recordRecentSearch(search);
      }
      setProductStack([product]);
    },
    [recordRecentSearch, search]
  );

  const handleOpenRecommendationProduct = useCallback((product) => {
    setProductStack((current) => [...current, product]);
  }, []);

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

  const handleSelectCategory = useCallback((categoryId) => {
    setSelectedCategory(categoryId);
    setSearch("");
    setIsSearchFocused(false);
  }, []);

  const handleExitCategory = useCallback(() => {
    setSelectedCategory(null);
    setSearch("");
    setIsSearchFocused(false);
  }, []);

  const handleProductBack = useCallback(() => {
    setProductStack((current) => current.slice(0, -1));
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
    <div className={`app${showReviewBar ? " app--hasReviewBar" : ""}`}>
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

      {isCategoryMode && (
        <section
          className="categoryResultsSection"
          aria-label={`Kategori ${categoryPresentation.label}`}
        >
          <div className="categoryResultsHeader">
            <button
              type="button"
              className="categoryResultsBack"
              aria-label="Kembali ke beranda"
              onClick={handleExitCategory}
            >
              <span aria-hidden="true">←</span> Kembali
            </button>
            <div className="categoryResultsIdentity">
              <h2 className="categoryResultsTitle">
                {categoryPresentation.icon ? (
                  <span className="categoryResultsIcon" aria-hidden="true">
                    {categoryPresentation.icon}{" "}
                  </span>
                ) : null}
                {categoryPresentation.label}
              </h2>
              <p className="categoryResultsCount">
                {categoryProducts.length} Produk
              </p>
            </div>
          </div>

          {hasCategoryHits ? (
            <div className="searchResultList">
              {categoryResultProducts.map((product) => (
                <SearchResultRow
                  key={product.id}
                  product={product}
                  cartQuantity={getDefaultUnitQuantity(product)}
                  onOpen={handleOpenProduct}
                  onQuickAdd={handleQuickAdd}
                  onIncrease={handleIncreaseQuantity}
                  onDecrease={handleDecreaseQuantity}
                />
              ))}
            </div>
          ) : (
            <p className="emptyState">Produk tidak ditemukan.</p>
          )}
        </section>
      )}

      {showHomepage && (
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
                  onOpen={handleOpenProduct}
                  onQuickAdd={handleQuickAdd}
                />
              ))}
            </div>
          ) : null}
        </section>
      )}

      {!isCategoryMode && isSearching && hasSearchHits && (
        <section className="searchResultsSection" aria-label="Hasil pencarian">
          <div className="sectionTitle">Hasil Pencarian</div>
          <div className="searchResultList">
            {searchResultProducts.map((product) => (
              <SearchResultRow
                key={product.id}
                product={product}
                cartQuantity={getDefaultUnitQuantity(product)}
                onOpen={handleOpenProduct}
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
                    onOpen={handleOpenProduct}
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

      {!isCategoryMode && isSearching && !hasSearchHits && (
        <p className="emptyState">Produk tidak ditemukan.</p>
      )}

      {showHomepage && (
        <section>
          <div className="sectionTitle">
            Kategori
          </div>

          <div className="categoryGrid">
            {visibleCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="categoryButton"
                onClick={() => handleSelectCategory(category.id)}
              >
                {category.icon ? `${category.icon} ` : ""}
                {category.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {selectedProduct && (
        <ProductInfoView
          key={selectedProduct.id}
          product={selectedProduct}
          initialUnit={findProductLine(cart, selectedProduct.id)?.unit}
          cartCount={cartCount}
          productCount={productCount}
          recommendations={productPageRecommendations}
          suppressEscape={isReviewOpen}
          onBack={handleProductBack}
          onAddToCart={addToCart}
          onOpenCart={handleOpenReview}
          onOpenRecommendation={handleOpenRecommendationProduct}
          onQuickAddRecommendation={handleAddRecommendation}
        />
      )}

      {showReviewBar && (
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
