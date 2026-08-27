function SubcategoryGrid({ tiles, selectedId, onSelect }) {
  if (!tiles || tiles.length === 0) {
    return null;
  }

  return (
    <div className="subcategoryGrid" role="list">
      {tiles.map((tile) => {
        const selected = tile.id === selectedId;
        return (
          <button
            key={tile.id}
            type="button"
            className={`subcategoryTile${selected ? " subcategoryTile--selected" : ""}`}
            onClick={() => onSelect(tile.id)}
            aria-pressed={selected}
            aria-label={`${tile.label}, ${tile.count} produk`}
          >
            {tile.icon ? (
              <span className="subcategoryTileIcon" aria-hidden="true">
                {tile.icon}
              </span>
            ) : null}
            <span className="subcategoryTileLabel">{tile.label}</span>
            <span className="subcategoryTileCount">{tile.count} produk</span>
          </button>
        );
      })}
    </div>
  );
}

export default SubcategoryGrid;
