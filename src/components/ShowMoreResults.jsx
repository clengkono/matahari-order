/**
 * Progressive result paging: IntersectionObserver sentinel plus a
 * "Tampilkan lainnya" fallback. Both share the parent's visible-limit state.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

function ShowMoreResults({
  visibleCount,
  totalCount,
  pageSize,
  onShowMore,
  resetKey = "",
  paused = false,
}) {
  const remaining = Math.max(0, totalCount - visibleCount);
  const hasMore = remaining > 0;
  const sentinelRef = useRef(null);
  const busyRef = useRef(false);
  const armedRef = useRef(true);
  const onShowMoreRef = useRef(onShowMore);
  const pausedRef = useRef(paused);
  const hasMoreRef = useRef(hasMore);
  const [isRevealing, setIsRevealing] = useState(false);
  const [seenVisibleCount, setSeenVisibleCount] = useState(visibleCount);
  const [seenResetKey, setSeenResetKey] = useState(resetKey);

  if (visibleCount !== seenVisibleCount || resetKey !== seenResetKey) {
    setSeenVisibleCount(visibleCount);
    setSeenResetKey(resetKey);
    setIsRevealing(false);
  }

  useLayoutEffect(() => {
    onShowMoreRef.current = onShowMore;
    pausedRef.current = paused;
    hasMoreRef.current = hasMore;
  }, [onShowMore, paused, hasMore]);

  useLayoutEffect(() => {
    busyRef.current = false;
  }, [visibleCount, resetKey]);

  useLayoutEffect(() => {
    armedRef.current = true;
  }, [resetKey]);

  const requestMore = useCallback(() => {
    if (!hasMoreRef.current || pausedRef.current || busyRef.current) {
      return;
    }

    busyRef.current = true;
    setIsRevealing(true);
    onShowMoreRef.current();
  }, []);

  useEffect(() => {
    if (!hasMore || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const node = sentinelRef.current;
    if (!node) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }

        if (!entry.isIntersecting) {
          armedRef.current = true;
          return;
        }

        if (pausedRef.current || !armedRef.current) {
          return;
        }

        armedRef.current = false;
        requestMore();
      },
      {
        root: null,
        rootMargin: "0px 0px 160px 0px",
        threshold: 0,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, resetKey, requestMore]);

  if (!hasMore) {
    return null;
  }

  const nextBatch = Math.min(pageSize, remaining);
  const hint =
    remaining === 1
      ? `Menampilkan ${visibleCount} dari ${totalCount} produk · 1 lagi`
      : `Menampilkan ${visibleCount} dari ${totalCount} produk · ${remaining} lagi`;

  return (
    <div className="showMoreResults" aria-busy={isRevealing}>
      <div
        ref={sentinelRef}
        className="showMoreResultsSentinel"
        aria-hidden="true"
      />
      <p className="showMoreResultsHint">{hint}</p>
      {isRevealing ? (
        <p className="showMoreResultsStatus" role="status" aria-live="polite">
          Memuat...
        </p>
      ) : null}
      <button
        type="button"
        className="showMoreResultsButton"
        onClick={requestMore}
        disabled={isRevealing}
        aria-label={`Tampilkan ${nextBatch} produk lagi`}
      >
        Tampilkan lainnya
      </button>
    </div>
  );
}

export default ShowMoreResults;
