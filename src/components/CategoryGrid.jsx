/**
 * Top-level category tiles for the customer homepage.
 * Classification stays on CATEGORY_CONFIG — this is presentation only.
 */

function CategoryGrid({ categories, onSelect }) {
  return (
    <div className="categoryGrid">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className="categoryTile"
          onClick={() => onSelect(category.id)}
          aria-label={`${category.label}, ${category.count} produk`}
        >
          {category.icon ? (
            <span className="categoryTileIcon" aria-hidden="true">
              {category.icon}
            </span>
          ) : null}
          <span className="categoryTileLabel">{category.label}</span>
          <span className="categoryTileCount">{category.count} produk</span>
        </button>
      ))}
    </div>
  );
}

export default CategoryGrid;
