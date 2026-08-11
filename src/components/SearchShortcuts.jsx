/**
 * One-tap search shortcuts shown when the search field is focused and empty.
 */

function SearchShortcuts({
  recentSearches = [],
  popularSearches = [],
  onSelect,
  onClearRecent,
}) {
  const hasRecent = recentSearches.length > 0;

  return (
    <section className="searchShortcuts" aria-label="Pintasan pencarian">
      {hasRecent ? (
        <div className="searchShortcutsGroup">
          <div className="searchShortcutsHeader">
            <h2 className="searchShortcutsTitle">Terakhir Dicari</h2>
            <button
              type="button"
              className="searchShortcutsClear"
              aria-label="Hapus riwayat pencarian"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onClearRecent}
            >
              Hapus
            </button>
          </div>
          <div className="searchShortcutChips">
            {recentSearches.map((term) => (
              <button
                key={term}
                type="button"
                className="searchShortcutChip searchShortcutChip--recent"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelect(term)}
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {popularSearches.length > 0 ? (
        <div className="searchShortcutsGroup">
          <h2 className="searchShortcutsTitle">Pencarian Populer</h2>
          <div className="searchShortcutChips">
            {popularSearches.map((term) => (
              <button
                key={term}
                type="button"
                className="searchShortcutChip searchShortcutChip--popular"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelect(term)}
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default SearchShortcuts;
