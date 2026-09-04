import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import products, { aliases, catalogRecommendations } from "./catalog";
import AddFeedbackToast from "./components/AddFeedbackToast";
import CategoryGrid from "./components/CategoryGrid";
import ConfirmReplaceOrderDialog from "./components/ConfirmReplaceOrderDialog";
import OrderReviewBar from "./components/OrderReviewBar";
import OrderReviewSheet from "./components/OrderReviewSheet";
import PersonalRegularsSection from "./components/PersonalRegularsSection";
import PreviousOrdersSection from "./components/PreviousOrdersSection";
import RestoreFeedbackToast from "./components/RestoreFeedbackToast";
import ProductGrid from "./components/ProductGrid";
import ProductInfoView from "./components/ProductInfoView";
import RecommendationCard from "./components/RecommendationCard";
import SearchEmptyState, {
  CategoryDiscoveryCard,
  CategoryMatchState,
} from "./components/SearchEmptyState";
import SearchShortcuts from "./components/SearchShortcuts";
import ShowMoreResults from "./components/ShowMoreResults";
import SubcategoryGrid from "./components/SubcategoryGrid";
import {
  getCategoryPresentation,
  getVisibleCategories,
  matchCategorySearchTerm,
} from "./config/categories";
import { HOMEPAGE_FEATURED_PRODUCT_IDS } from "./config/homepageFeatured";
import { POPULAR_SEARCHES } from "./config/popularSearches";
import { useCart } from "./context/CartContext";
import { findProductLine } from "./utils/cartHelpers";
import {
  buildSubcategoryTiles,
  productMatchesSubcategory,
} from "./utils/classifySubcategory";
import {
  SEARCH_RESULT_PAGE_SIZE,
  initialVisibleLimit,
  nextVisibleLimit,
  remainingItemCount,
  visibleItems,
} from "./utils/resultCap";
import {
  clearStoredOrderNote,
  loadStoredCart,
  loadStoredOrderNote,
  saveStoredOrderNote,
} from "./utils/orderDraftStorage";
import {
  normalizeSearchText,
  searchProducts,
} from "./utils/productSearch";
import {
  getRecommendedProducts,
  recommendationSourcesForCart,
  recommendationSourcesForProductDetail,
  recommendationSourcesForSearch,
} from "./utils/recommendations";
import {
  excludeSimilarFromRecommendations,
  resolveSimilarProducts,
} from "./utils/productFamilies";
import {
  buildSalesPopularity,
  getSeringDipesanProducts,
} from "./utils/salesPopularity";
import {
  clearRecentSearches,
  loadRecentSearches,
  rememberRecentSearch,
} from "./utils/recentSearches";
import {
  loadOrderHistory,
  saveOrderHistorySnapshot,
  touchHistoryLastUsedAt,
} from "./utils/orderHistoryStorage";
import { loadLearningProfile, recordOrderingOccasion } from "./utils/learningProfileStorage";
import {
  derivePersonalRegularProductIds,
  resolvePersonalRegularProducts,
} from "./utils/personalRegularProducts";
import {
  decideRestoreAction,
  formatAllSkippedRestoreMessage,
  formatRestoreNotice,
  getHomepageHistoryOrders,
  restoreOrderFromHistory,
} from "./utils/orderHistoryRestore";
import { openWhatsAppWithOrder } from "./utils/whatsapp";

const productsById = Object.fromEntries(
  products.map((product) => [product.id, product])
);

const salesPopularity = buildSalesPopularity(catalogRecommendations);

const homepageFeaturedProducts = getSeringDipesanProducts({
  products,
  recommendations: catalogRecommendations,
  manualIds: HOMEPAGE_FEATURED_PRODUCT_IDS,
  limit: 9,
});

function addProductDefaults(addToCart, product) {
  addToCart({
    productId: product.id,
    name: product.name,
    unit: product.defaultUnit,
    quantity: product.defaultQuantity,
  });
}

function scrollDocumentToTop() {
  window.scrollTo(0, 0);
  const scrollingElement = document.scrollingElement;
  if (scrollingElement) {
    scrollingElement.scrollTop = 0;
  }
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export default function App() {
  const [search, setSearch] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState(loadRecentSearches);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState("semua");
  const [productStack, setProductStack] = useState([]);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [orderNote, setOrderNote] = useState(() => {
    const storedCart = loadStoredCart(products);
    if (storedCart.length === 0) {
      clearStoredOrderNote();
      return "";
    }

    return loadStoredOrderNote();
  });
  const [whatsAppHandoffStatus, setWhatsAppHandoffStatus] = useState("idle");
  const [orderHistory, setOrderHistory] = useState(loadOrderHistory);
  const [pendingRestoreOrder, setPendingRestoreOrder] = useState(null);
  const [restoreNotice, setRestoreNotice] = useState({
    token: 0,
    message: "",
    alert: false,
  });
  const [addFeedbackToken, setAddFeedbackToken] = useState(0);
  const [visibleLimitState, setVisibleLimitState] = useState({
    resetKey: "",
    limit: SEARCH_RESULT_PAGE_SIZE,
  });
  const searchInputRef = useRef(null);
  const productResultsRef = useRef(null);
  const skipSubcategoryScrollRef = useRef(false);
  const loadMoreLockRef = useRef(false);
  const whatsAppSendLockRef = useRef(false);
  const {
    cart,
    cartCount,
    lineCount,
    productCount,
    addToCart,
    removeProduct,
    updateQuantity,
    changeUnit,
    clearCart,
    replaceCart,
  } = useCart();

  const selectedProduct =
    productStack.length > 0 ? productStack[productStack.length - 1] : null;
  const isProductInfoOpen = selectedProduct != null;
  const isCategoryMode = selectedCategory != null;

  useLayoutEffect(() => {
    if (!selectedCategory) {
      return undefined;
    }

    skipSubcategoryScrollRef.current = true;
    scrollDocumentToTop();

    let innerFrameId = 0;
    const outerFrameId = window.requestAnimationFrame(() => {
      scrollDocumentToTop();
      innerFrameId = window.requestAnimationFrame(() => {
        scrollDocumentToTop();
        skipSubcategoryScrollRef.current = false;
      });
    });

    return () => {
      window.cancelAnimationFrame(outerFrameId);
      window.cancelAnimationFrame(innerFrameId);
    };
  }, [selectedCategory]);

  useLayoutEffect(() => {
    if (skipSubcategoryScrollRef.current) {
      return undefined;
    }

    const resultsNode = productResultsRef.current;
    if (!selectedCategory || !resultsNode) {
      return undefined;
    }

    const stickyOffset = 72;
    const scrollToResults = () => {
      const nextTop = Math.max(
        0,
        resultsNode.getBoundingClientRect().top + window.scrollY - stickyOffset
      );
      window.scrollTo(0, nextTop);
    };

    scrollToResults();
    const frameId = window.requestAnimationFrame(scrollToResults);
    return () => window.cancelAnimationFrame(frameId);
  }, [selectedCategory, selectedSubcategory]);

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

  const subcategoryTiles = useMemo(() => {
    if (!selectedCategory) {
      return [];
    }

    return buildSubcategoryTiles(selectedCategory, categoryProducts);
  }, [selectedCategory, categoryProducts]);

  const browseCategoryProducts = useMemo(() => {
    if (normalizeSearchText(search)) {
      return categoryProducts;
    }

    return categoryProducts.filter((product) =>
      productMatchesSubcategory(product, selectedSubcategory)
    );
  }, [categoryProducts, search, selectedSubcategory]);

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
        cart: recommendationSourcesForCart(cart),
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

    const cartProductIds = new Set(cart.map((line) => line.productId));

    return excludeSimilarFromRecommendations(
      getRecommendedProducts({
        cart: recommendationSourcesForProductDetail(selectedProduct.id),
        relationships: catalogRecommendations,
        products,
        limit: 8,
      }),
      selectedProduct.similarProductIds
    ).filter((product) => !cartProductIds.has(product.id));
  }, [selectedProduct, cart]);

  const similarProducts = useMemo(
    () =>
      resolveSimilarProducts(
        selectedProduct?.similarProductIds,
        productsById
      ),
    [selectedProduct]
  );

  const hasOrder = lineCount > 0;
  const showReviewBar = hasOrder && !isProductInfoOpen;

  useEffect(() => {
    if (!isProductInfoOpen && !isReviewOpen && !pendingRestoreOrder) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isProductInfoOpen, isReviewOpen, pendingRestoreOrder]);

  const normalizedSearch = normalizeSearchText(search);
  const isSearching = normalizedSearch !== "";
  const personalRegularProducts = useMemo(() => {
    void orderHistory;
    const ids = derivePersonalRegularProductIds(loadLearningProfile());
    return resolvePersonalRegularProducts(ids, products);
  }, [orderHistory]);

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
      popularityById: salesPopularity,
    });

    return {
      searchResultProducts: results,
      hasSearchHits: results.length > 0,
    };
  }, [isSearching, normalizedSearch, isCategoryMode, categoryProducts]);

  const categoryResultProducts = isSearching
    ? searchResultProducts
    : browseCategoryProducts;
  const hasCategoryHits = categoryResultProducts.length > 0;
  const resultPageSize = initialVisibleLimit({
    isSearching,
    isCategoryMode,
  });
  const resultResetKey = `${selectedCategory ?? ""}::${selectedSubcategory}::${normalizedSearch}`;
  const visibleLimit =
    visibleLimitState.resetKey === resultResetKey
      ? visibleLimitState.limit
      : resultPageSize;

  const visibleSearchResultProducts = visibleItems(
    searchResultProducts,
    visibleLimit
  );
  const visibleCategoryResultProducts = visibleItems(
    categoryResultProducts,
    visibleLimit
  );
  const hiddenSearchCount = remainingItemCount(
    searchResultProducts.length,
    visibleSearchResultProducts.length
  );
  const hiddenCategoryCount = remainingItemCount(
    categoryResultProducts.length,
    visibleCategoryResultProducts.length
  );

  const handleShowMoreResults = useCallback(() => {
    if (loadMoreLockRef.current) {
      return;
    }

    loadMoreLockRef.current = true;
    setVisibleLimitState((current) => {
      const currentLimit =
        current.resetKey === resultResetKey ? current.limit : resultPageSize;
      return {
        resetKey: resultResetKey,
        limit: nextVisibleLimit(currentLimit, resultPageSize),
      };
    });
  }, [resultPageSize, resultResetKey]);

  useEffect(() => {
    loadMoreLockRef.current = false;
  }, [visibleLimit, resultResetKey]);

  // Cross-category recovery: same pipeline on full catalogue when category miss.
  const hasGlobalHitsOutsideCategory = useMemo(() => {
    if (!isCategoryMode || !isSearching || hasSearchHits) {
      return false;
    }

    const { results } = searchProducts({
      query: normalizedSearch,
      products,
      aliases,
    });

    return results.length > 0;
  }, [isCategoryMode, isSearching, hasSearchHits, normalizedSearch]);

  // Exact category-term discovery for global search (no auto-redirect).
  const matchedCategoryTerm = useMemo(() => {
    if (isCategoryMode || !isSearching) {
      return null;
    }

    return matchCategorySearchTerm(normalizedSearch, visibleCategories);
  }, [isCategoryMode, isSearching, normalizedSearch, visibleCategories]);

  // Search recommendations: global search only (not category mode).
  const searchRecommendations = useMemo(() => {
    if (isCategoryMode || !hasSearchHits) {
      return [];
    }

    const searchIds = new Set(searchResultProducts.map((product) => product.id));
    const cartProductIds = new Set(cart.map((line) => line.productId));

    return getRecommendedProducts({
      cart: recommendationSourcesForSearch(searchResultProducts),
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

  const showAddedFeedback = useCallback(() => {
    setAddFeedbackToken((current) => current + 1);
  }, []);

  const addToCartWithFeedback = useCallback(
    (line) => {
      addToCart(line);
      showAddedFeedback();
    },
    [addToCart, showAddedFeedback]
  );

  const handleQuickAdd = useCallback(
    (product) => {
      if (normalizeSearchText(search)) {
        recordRecentSearch(search);
      }
      addProductDefaults(addToCartWithFeedback, product);
    },
    [addToCartWithFeedback, recordRecentSearch, search]
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
    skipSubcategoryScrollRef.current = true;
    scrollDocumentToTop();
    setSelectedCategory(categoryId);
    setSelectedSubcategory("semua");
    setSearch("");
    setIsSearchFocused(false);
  }, []);

  const handleSelectSubcategory = useCallback((subcategoryId) => {
    setSelectedSubcategory(subcategoryId);
  }, []);

  const handleExitCategory = useCallback(() => {
    setSelectedCategory(null);
    setSelectedSubcategory("semua");
    setSearch("");
    setIsSearchFocused(false);
  }, []);

  const handleSearchAllProducts = useCallback(() => {
    setSelectedCategory(null);
    setSelectedSubcategory("semua");
    setIsSearchFocused(false);
  }, []);

  const handleProductBack = useCallback(() => {
    setProductStack((current) => current.slice(0, -1));
  }, []);

  const handleOpenReview = useCallback(() => {
    setIsReviewOpen(true);
  }, []);

  const handleCloseReview = useCallback(() => {
    if (
      whatsAppHandoffStatus === "opening" ||
      whatsAppHandoffStatus === "opened"
    ) {
      return;
    }

    setIsReviewOpen(false);
  }, [whatsAppHandoffStatus]);

  const handleOrderNoteChange = useCallback((value) => {
    setOrderNote(value);
    saveStoredOrderNote(value);
  }, []);

  const showRestoreNotice = useCallback((message, alert = false) => {
    setRestoreNotice({
      token: Date.now(),
      message,
      alert,
    });
  }, []);

  const applyHistoryRestore = useCallback(
    (order) => {
      const result = restoreOrderFromHistory(order, products);
      if (result.restoredCount < 1) {
        showRestoreNotice(formatAllSkippedRestoreMessage(), true);
        return false;
      }

      replaceCart(result.lines);
      handleOrderNoteChange(result.note);
      touchHistoryLastUsedAt(order.id);
      setOrderHistory(loadOrderHistory());
      setIsReviewOpen(true);
      showRestoreNotice(formatRestoreNotice(result), result.skipped.length > 0);
      return true;
    },
    [handleOrderNoteChange, replaceCart, showRestoreNotice]
  );

  const handlePesanLagi = useCallback(
    (order) => {
      const result = restoreOrderFromHistory(order, products);
      const decision = decideRestoreAction({
        currentLineCount: lineCount,
        restoredCount: result.restoredCount,
      });

      if (decision.action === "blocked") {
        showRestoreNotice(formatAllSkippedRestoreMessage(), true);
        return;
      }

      if (decision.action === "confirm") {
        setPendingRestoreOrder(order);
        return;
      }

      applyHistoryRestore(order);
    },
    [applyHistoryRestore, lineCount, showRestoreNotice]
  );

  const handleConfirmReplaceOrder = useCallback(() => {
    const order = pendingRestoreOrder;
    setPendingRestoreOrder(null);
    if (order) {
      applyHistoryRestore(order);
    }
  }, [applyHistoryRestore, pendingRestoreOrder]);

  const handleCancelReplaceOrder = useCallback(() => {
    setPendingRestoreOrder(null);
  }, []);

  const handleSendWhatsApp = useCallback(() => {
    if (whatsAppSendLockRef.current) {
      return;
    }

    if (whatsAppHandoffStatus !== "idle" && whatsAppHandoffStatus !== "failed") {
      return;
    }

    if (!cart.length) {
      return;
    }

    whatsAppSendLockRef.current = true;
    setWhatsAppHandoffStatus("opening");

    saveOrderHistorySnapshot({ cart, note: orderNote });
    recordOrderingOccasion({ cart });
    setOrderHistory(loadOrderHistory());

    const result = openWhatsAppWithOrder(cart, orderNote);

    if (result.ok) {
      setWhatsAppHandoffStatus("opened");
      return;
    }

    whatsAppSendLockRef.current = false;
    setWhatsAppHandoffStatus("failed");
  }, [cart, orderNote, whatsAppHandoffStatus]);

  const handleReturnFromWhatsAppHandoff = useCallback(() => {
    whatsAppSendLockRef.current = false;
    setWhatsAppHandoffStatus("idle");
  }, []);

  const handleConfirmWhatsAppSent = useCallback(() => {
    whatsAppSendLockRef.current = false;
    setWhatsAppHandoffStatus("idle");
    setOrderNote("");
    clearStoredOrderNote();
    clearCart();
    setIsReviewOpen(false);
  }, [clearCart]);

  const clearDraftIfCartWillEmpty = useCallback((willEmpty) => {
    if (!willEmpty) {
      return;
    }

    setOrderNote("");
    clearStoredOrderNote();
    whatsAppSendLockRef.current = false;
    setWhatsAppHandoffStatus("idle");
  }, []);

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
        clearDraftIfCartWillEmpty(willEmptyCart);
      }
    },
    [cart, clearDraftIfCartWillEmpty, lineCount, updateQuantity]
  );

  const handleRemoveProduct = useCallback(
    (productId) => {
      const willEmptyCart = lineCount === 1;
      removeProduct(productId);
      clearDraftIfCartWillEmpty(willEmptyCart);
    },
    [clearDraftIfCartWillEmpty, lineCount, removeProduct]
  );

  const handleAddRecommendation = useCallback(
    (product) => {
      addProductDefaults(addToCartWithFeedback, product);
    },
    [addToCartWithFeedback]
  );

  const searchPlaceholder = isCategoryMode
    ? `Cari di ${categoryPresentation.label}...`
    : "Cari produk...";
  const searchAriaLabel = isCategoryMode
    ? `Cari di ${categoryPresentation.label}`
    : "Cari produk";
  const categoryResultCountLabel =
    categoryResultProducts.length === 1
      ? "1 produk"
      : `${categoryResultProducts.length} produk`;
  const searchResultCountLabel =
    searchResultProducts.length === 1
      ? "1 produk"
      : `${searchResultProducts.length} produk`;

  return (
    <div
      className={`app${showReviewBar ? " app--hasReviewBar" : ""}${isCategoryMode ? " app--categoryMode" : ""}`}
    >
      <header className="header">
        <div className="headerTop">
          <h1>Matahari Order</h1>
        </div>
        {showHomepage ? (
          <p>Pesan kebutuhan toko dengan cepat.</p>
        ) : null}
      </header>

      <div className="searchSection">
        <div
          className={`searchField${search ? " searchField--hasValue" : ""}`}
        >
          <svg
            className="searchIcon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <circle
              cx="11"
              cy="11"
              r="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M20 20l-3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={searchInputRef}
            className="searchBox"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
            aria-label={searchAriaLabel}
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

      {showHomepage ? (
        <PreviousOrdersSection
          orders={getHomepageHistoryOrders(orderHistory)}
          products={products}
          onPesanLagi={handlePesanLagi}
        />
      ) : null}

      {showHomepage ? (
        <PersonalRegularsSection
          products={personalRegularProducts}
          onOpen={handleOpenProduct}
          onQuickAdd={handleQuickAdd}
          getCartQuantity={getDefaultUnitQuantity}
          onIncrease={handleIncreaseQuantity}
          onDecrease={handleDecreaseQuantity}
        />
      ) : null}

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
                {categoryResultCountLabel}
              </p>
            </div>
          </div>

          {isSearching ? null : (
            <SubcategoryGrid
              tiles={subcategoryTiles}
              selectedId={selectedSubcategory}
              onSelect={handleSelectSubcategory}
            />
          )}

          {hasCategoryHits ? (
            <>
              <div ref={productResultsRef} className="categoryProductResults">
                <ProductGrid
                  products={visibleCategoryResultProducts}
                  onOpen={handleOpenProduct}
                  onQuickAdd={handleQuickAdd}
                  getCartQuantity={getDefaultUnitQuantity}
                  onIncrease={handleIncreaseQuantity}
                  onDecrease={handleDecreaseQuantity}
                />
              </div>
              {hiddenCategoryCount > 0 ? (
                <ShowMoreResults
                  visibleCount={visibleCategoryResultProducts.length}
                  totalCount={categoryResultProducts.length}
                  pageSize={resultPageSize}
                  resetKey={resultResetKey}
                  paused={isProductInfoOpen || isReviewOpen}
                  onShowMore={handleShowMoreResults}
                />
              ) : null}
            </>
          ) : (
            <SearchEmptyState
              query={normalizedSearch}
              categoryLabel={categoryPresentation.label}
              showCrossCategory={hasGlobalHitsOutsideCategory}
              onClearSearch={handleClearSearch}
              onSearchAllProducts={handleSearchAllProducts}
            />
          )}
        </section>
      )}

      {showHomepage && (
        <section className="homeSection" aria-label="Sering Dipesan">
          <div className="sectionTitle">Sering Dipesan</div>

          {homepageFeaturedProducts.length > 0 ? (
            <ProductGrid
              products={homepageFeaturedProducts}
              onOpen={handleOpenProduct}
              onQuickAdd={handleQuickAdd}
            />
          ) : null}
        </section>
      )}

      {!isCategoryMode && isSearching && hasSearchHits && (
        <section className="searchResultsSection" aria-label="Hasil pencarian">
          {matchedCategoryTerm ? (
            <CategoryDiscoveryCard
              category={matchedCategoryTerm}
              onSelectCategory={handleSelectCategory}
            />
          ) : null}
          <div className="resultsHeader">
            <h2 className="resultsTitle">Hasil Pencarian</h2>
            <p className="resultsCount">{searchResultCountLabel}</p>
          </div>
          <div className="productGridWrap">
            <ProductGrid
              products={visibleSearchResultProducts}
              onOpen={handleOpenProduct}
              onQuickAdd={handleQuickAdd}
              getCartQuantity={getDefaultUnitQuantity}
              onIncrease={handleIncreaseQuantity}
              onDecrease={handleDecreaseQuantity}
            />
          </div>
          {hiddenSearchCount > 0 ? (
            <ShowMoreResults
              visibleCount={visibleSearchResultProducts.length}
              totalCount={searchResultProducts.length}
              pageSize={resultPageSize}
              resetKey={resultResetKey}
              paused={isProductInfoOpen || isReviewOpen}
              onShowMore={handleShowMoreResults}
            />
          ) : null}

          {searchRecommendations.length > 0 && (
            <section
              className="orderReviewRecommendations searchRecommendations"
              aria-label="Mungkin Anda juga perlu"
            >
              <div className="orderReviewRecommendationsHeader">
                <h2 className="orderReviewRecommendationsTitle">
                  <span
                    className="orderReviewRecommendationsAccent"
                    aria-hidden="true"
                  >
                    ✦
                  </span>
                  Mungkin Anda juga perlu
                </h2>
                <p className="orderReviewRecommendationsHint">
                  Geser untuk melihat lebih banyak
                </p>
              </div>
              <ul className="orderReviewRecoCarousel">
                {searchRecommendations.map((product) => (
                  <RecommendationCard
                    key={product.id}
                    product={product}
                    onAdd={handleQuickAdd}
                    onOpen={handleOpenProduct}
                  />
                ))}
              </ul>
            </section>
          )}
        </section>
      )}

      {!isCategoryMode && isSearching && !hasSearchHits && matchedCategoryTerm && (
        <CategoryMatchState
          category={matchedCategoryTerm}
          onSelectCategory={handleSelectCategory}
          onClearSearch={handleClearSearch}
        />
      )}

      {!isCategoryMode &&
        isSearching &&
        !hasSearchHits &&
        !matchedCategoryTerm && (
          <SearchEmptyState
            query={normalizedSearch}
            categories={visibleCategories}
            onClearSearch={handleClearSearch}
            onSelectCategory={handleSelectCategory}
          />
        )}

      {showHomepage && (
        <section className="homeSection" aria-label="Semua Kategori">
          <div className="sectionTitle">Semua Kategori</div>
          <CategoryGrid
            categories={visibleCategories}
            onSelect={handleSelectCategory}
          />
        </section>
      )}

      {selectedProduct && (
        <ProductInfoView
          key={selectedProduct.id}
          product={selectedProduct}
          cartLine={findProductLine(cart, selectedProduct.id)}
          cartCount={cartCount}
          productCount={productCount}
          recommendations={productPageRecommendations}
          similarProducts={similarProducts}
          suppressEscape={isReviewOpen}
          onBack={handleProductBack}
          onAddToCart={addToCartWithFeedback}
          onOpenCart={handleOpenReview}
          onOpenRecommendation={handleOpenRecommendationProduct}
          onQuickAddRecommendation={handleAddRecommendation}
        />
      )}

      {showReviewBar && (
        <OrderReviewBar
          cartCount={cartCount}
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
        whatsAppHandoffStatus={whatsAppHandoffStatus}
        onSendWhatsApp={handleSendWhatsApp}
        onConfirmWhatsAppSent={handleConfirmWhatsAppSent}
        onReturnFromWhatsAppHandoff={handleReturnFromWhatsAppHandoff}
        onIncrease={handleIncreaseQuantity}
        onDecrease={handleDecreaseQuantity}
        onRemoveProduct={handleRemoveProduct}
        onChangeUnit={changeUnit}
        onAddRecommendation={handleAddRecommendation}
      />

      <ConfirmReplaceOrderDialog
        isOpen={pendingRestoreOrder != null}
        currentLineCount={lineCount}
        onConfirm={handleConfirmReplaceOrder}
        onCancel={handleCancelReplaceOrder}
      />

      <AddFeedbackToast token={addFeedbackToken} />
      <RestoreFeedbackToast
        token={restoreNotice.token}
        message={restoreNotice.message}
        alert={restoreNotice.alert}
      />
    </div>
  );
}
