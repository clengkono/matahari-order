/**
 * Secondary "Tampilkan lainnya" control for capped search/category lists.
 * Must not visually compete with Tambah or Lihat Pesanan.
 */

function ShowMoreResults({
  visibleCount,
  totalCount,
  pageSize,
  onShowMore,
}) {
  const remaining = Math.max(0, totalCount - visibleCount);

  if (remaining <= 0) {
    return null;
  }

  const nextBatch = Math.min(pageSize, remaining);
  const hint =
    remaining === 1
      ? `Menampilkan ${visibleCount} dari ${totalCount} produk · 1 lagi`
      : `Menampilkan ${visibleCount} dari ${totalCount} produk · ${remaining} lagi`;

  return (
    <div className="showMoreResults">
      <p className="showMoreResultsHint">{hint}</p>
      <button
        type="button"
        className="showMoreResultsButton"
        onClick={onShowMore}
        aria-label={`Tampilkan ${nextBatch} produk lagi`}
      >
        Tampilkan lainnya
      </button>
    </div>
  );
}

export default ShowMoreResults;
