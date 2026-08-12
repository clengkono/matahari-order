/**
 * Search recovery and category-discovery UI (Stage 2B).
 */

/**
 * Compact category suggestion card (also used above product hits).
 */
export function CategoryDiscoveryCard({
  category,
  onSelectCategory,
  label = "Kategori",
}) {
  if (!category) {
    return null;
  }

  return (
    <div className="searchEmptyCategorySuggestion">
      {label ? (
        <p className="searchEmptyCategorySuggestionLabel">{label}</p>
      ) : null}
      <div className="searchEmptyCategorySuggestionCard">
        <div className="searchEmptyCategorySuggestionText">
          <span className="searchEmptyCategorySuggestionName">
            {category.icon ? `${category.icon} ` : ""}
            {category.label}
          </span>
          <span className="searchEmptyCategorySuggestionCount">
            {category.count} Produk
          </span>
        </div>
        <button
          type="button"
          className="searchEmptyCategorySuggestionButton"
          onClick={() => onSelectCategory?.(category.id)}
        >
          Lihat kategori
        </button>
      </div>
    </div>
  );
}

/**
 * Successful exact category-term match in global search (not a failure).
 * Example: query "rokok" with no product rows.
 */
export function CategoryMatchState({
  category,
  onSelectCategory,
  onClearSearch,
}) {
  if (!category) {
    return null;
  }

  return (
    <section
      className="categoryMatchState"
      aria-label="Kategori ditemukan"
    >
      <CategoryDiscoveryCard
        category={category}
        onSelectCategory={onSelectCategory}
        label="Kategori ditemukan"
      />
      {onClearSearch ? (
        <button
          type="button"
          className="categoryMatchStateClear"
          onClick={onClearSearch}
        >
          Hapus pencarian
        </button>
      ) : null}
    </section>
  );
}

/**
 * Generic / category-scoped zero-result recovery.
 * Not used for exact category-term matches (see CategoryMatchState).
 */
function SearchEmptyState({
  query,
  categoryLabel = null,
  categories = [],
  showCrossCategory = false,
  onClearSearch,
  onSelectCategory,
  onSearchAllProducts,
}) {
  const isCategoryScoped = Boolean(categoryLabel);
  const echo = isCategoryScoped
    ? `Tidak ada hasil untuk “${query}” di ${categoryLabel}.`
    : `Tidak ada hasil untuk “${query}”.`;

  return (
    <section className="searchEmptyState" aria-label="Hasil pencarian kosong">
      <h2 className="searchEmptyStateTitle">Produk tidak ditemukan</h2>
      <p className="searchEmptyStateEcho">{echo}</p>

      {!isCategoryScoped ? (
        <p className="searchEmptyStateHint">
          Coba kata lain atau ejaan yang lebih pendek.
        </p>
      ) : null}

      {isCategoryScoped && showCrossCategory ? (
        <p className="searchEmptyStateHint">
          Produk ini mungkin ada di kategori lain.
        </p>
      ) : null}

      <div className="searchEmptyStateActions">
        <button
          type="button"
          className="searchEmptyStatePrimary"
          onClick={onClearSearch}
        >
          Hapus pencarian
        </button>

        {isCategoryScoped && showCrossCategory && onSearchAllProducts ? (
          <button
            type="button"
            className="searchEmptyStateSecondary"
            onClick={onSearchAllProducts}
          >
            Cari di semua produk
          </button>
        ) : null}
      </div>

      {!isCategoryScoped && categories.length > 0 ? (
        <div className="searchEmptyCategories">
          <h3 className="searchEmptyCategoriesTitle">
            Lihat berdasarkan kategori
          </h3>
          <div className="searchEmptyCategoryChips">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="searchEmptyCategoryChip"
                onClick={() => onSelectCategory?.(category.id)}
              >
                {category.icon ? `${category.icon} ` : ""}
                {category.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default SearchEmptyState;
