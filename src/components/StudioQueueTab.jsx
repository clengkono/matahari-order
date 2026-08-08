import { useEffect, useMemo, useState } from "react";
import StudioImagePanel from "./StudioImagePanel";

function StudioQueueTab({
  products,
  stats,
  onSaved,
  apiRef,
}) {
  const missingProducts = useMemo(
    () => products.filter((product) => !product.hasImage),
    [products]
  );

  const [browseAll, setBrowseAll] = useState(false);
  const [index, setIndex] = useState(0);

  const queue = browseAll ? products : missingProducts;
  const safeIndex = queue.length === 0 ? 0 : Math.min(index, queue.length - 1);
  const current = queue[safeIndex] ?? null;
  const positionLabel =
    queue.length === 0 ? "0 / 0" : `${safeIndex + 1} / ${queue.length}`;

  function goPrevious() {
    setIndex((currentIndex) => {
      const bounded =
        queue.length === 0 ? 0 : Math.min(currentIndex, queue.length - 1);
      return Math.max(0, bounded - 1);
    });
  }

  function goNext() {
    setIndex((currentIndex) => {
      if (queue.length === 0) {
        return 0;
      }
      const bounded = Math.min(currentIndex, queue.length - 1);
      return Math.min(queue.length - 1, bounded + 1);
    });
  }

  function goSkip() {
    if (queue.length === 0) {
      return;
    }
    setIndex((currentIndex) => {
      const bounded = Math.min(currentIndex, queue.length - 1);
      if (bounded >= queue.length - 1) {
        return 0;
      }
      return bounded + 1;
    });
  }

  useEffect(() => {
    if (!apiRef) {
      return undefined;
    }
    apiRef.current = {
      goPrevious,
      goNext,
    };
    return () => {
      apiRef.current = null;
    };
  });

  function handleSaved(result) {
    onSaved?.(result);

    if (browseAll) {
      const nextMissing = products.find(
        (product) => product.id !== result.productId && !product.hasImage
      );
      if (nextMissing) {
        const nextIndex = products.findIndex(
          (product) => product.id === nextMissing.id
        );
        if (nextIndex >= 0) {
          setIndex(nextIndex);
        }
      }
    }
  }

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

      <div className="studioQueueToolbar">
        <label className="studioCheckboxLabel">
          <input
            type="checkbox"
            checked={browseAll}
            onChange={(event) => {
              setBrowseAll(event.target.checked);
              setIndex(0);
            }}
          />
          Browse all cigarette products
        </label>
        <p className="studioQueuePosition">
          {browseAll ? "All products" : "Missing images"} · {positionLabel}
        </p>
      </div>

      {current ? (
        <>
          <p className="studioQueueCurrent">
            Current: <strong>{current.name}</strong>
          </p>
          <div className="studioQueueNav">
            <button
              type="button"
              className="studioButton studioButton--secondary"
              onClick={goPrevious}
              disabled={safeIndex <= 0}
            >
              Previous
            </button>
            <button
              type="button"
              className="studioButton studioButton--secondary"
              onClick={goSkip}
              disabled={queue.length === 0}
            >
              Skip
            </button>
            <button
              type="button"
              className="studioButton studioButton--secondary"
              onClick={goNext}
              disabled={safeIndex >= queue.length - 1}
            >
              Next
            </button>
          </div>
          <StudioImagePanel
            key={current.id}
            product={current}
            onSaved={handleSaved}
          />
        </>
      ) : (
        <div className="studioPanel studioPanel--empty">
          <p>
            {browseAll
              ? "No cigarette products found."
              : "All cigarette products have images. Enable “Browse all” to review them."}
          </p>
        </div>
      )}
    </div>
  );
}

export default StudioQueueTab;
