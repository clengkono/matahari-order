import StudioImageBrowser from "./StudioImageBrowser";

function formatCount(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

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
        <p className="studioQueueProgress">
          {formatCount(stats.completed)} selesai · {formatCount(stats.missing)} belum
          ada gambar
        </p>
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
        showResume
        apiRef={apiRef}
      />
    </div>
  );
}

export default StudioQueueTab;
