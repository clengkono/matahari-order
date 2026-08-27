import StudioImageBrowser from "./StudioImageBrowser";

function StudioQueueTab({
  products,
  categories,
  recentProductIds,
  stats,
  selectedId,
  onSelect,
  onSaved,
  searchRef,
  apiRef,
}) {
  return (
    <div className="studioQueue">
      <div className="studioQueueStats" aria-live="polite">
        <div className="studioStat">
          <span className="studioStatValue">{stats.completed}</span>
          <span className="studioStatLabel">Completed</span>
        </div>
        <div className="studioStat">
          <span className="studioStatValue">{stats.total}</span>
          <span className="studioStatLabel">Total</span>
        </div>
        <div className="studioStat">
          <span className="studioStatValue">{stats.missing}</span>
          <span className="studioStatLabel">Missing</span>
        </div>
      </div>

      <StudioImageBrowser
        products={products}
        categories={categories}
        recentProductIds={recentProductIds}
        selectedId={selectedId}
        onSelect={onSelect}
        onSaved={onSaved}
        searchRef={searchRef}
        defaultStatus="missing"
        heading="Search missing images"
        showQueueNav
        apiRef={apiRef}
      />
    </div>
  );
}

export default StudioQueueTab;
