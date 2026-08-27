import StudioImageBrowser from "./StudioImageBrowser";

function StudioImagesTab({
  products,
  categories,
  recentProductIds,
  selectedId,
  onSelect,
  onSaved,
  searchRef,
}) {
  return (
    <StudioImageBrowser
      products={products}
      categories={categories}
      recentProductIds={recentProductIds}
      selectedId={selectedId}
      onSelect={onSelect}
      onSaved={onSaved}
      searchRef={searchRef}
      defaultStatus="all"
      heading="Search products"
    />
  );
}

export default StudioImagesTab;
