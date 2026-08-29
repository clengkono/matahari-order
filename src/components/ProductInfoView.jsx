import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ProductThumb from "./ProductThumb";
import RecommendationCard from "./RecommendationCard";
import { getCartUnitDisplayLabel } from "../utils/unitDisplay";

function RelatedProductRow({ title, products, onAdd, onOpen }) {
  if (!Array.isArray(products) || products.length === 0) {
    return null;
  }

  return (
    <section
      className="orderReviewRecommendations productInfoRecommendations"
      aria-label={title}
    >
      <div className="orderReviewRecommendationsHeader">
        <h3 className="orderReviewRecommendationsTitle">
          <span
            className="orderReviewRecommendationsAccent"
            aria-hidden="true"
          >
            ✦
          </span>
          {title}
        </h3>
        <p className="orderReviewRecommendationsHint">
          Geser untuk melihat lebih banyak
        </p>
      </div>
      <ul className="orderReviewRecoCarousel">
        {products.map((related) => (
          <RecommendationCard
            key={related.id}
            product={related}
            onAdd={onAdd}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  );
}

function ProductInfoView({
  product,
  cartLine,
  cartCount,
  productCount,
  recommendations = [],
  similarProducts = [],
  suppressEscape = false,
  onBack,
  onAddToCart,
  onOpenCart,
  onOpenRecommendation,
  onQuickAddRecommendation,
}) {
  const startingUnit =
    cartLine?.unit && product.availableUnits.includes(cartLine.unit)
      ? cartLine.unit
      : product.defaultUnit;
  const [selectedUnit, setSelectedUnit] = useState(startingUnit);
  const [quantity, setQuantity] = useState(product.defaultQuantity);
  const scrollRef = useRef(null);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return undefined;
    }

    node.scrollTop = 0;
    const frameId = window.requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [product.id]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !suppressEscape) {
        onBack();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onBack, suppressEscape]);

  const hints = product.customerUnitHints ?? [];
  const isInCart = Boolean(cartLine && cartLine.quantity >= 1);
  const selectedUnitLabel = getCartUnitDisplayLabel(selectedUnit);
  const addButtonLabel = isInCart
    ? `Tambah ${quantity} ${selectedUnitLabel}`
    : "+ Tambah ke Pesanan";
  const addAriaLabel = `Tambah ${quantity} ${selectedUnitLabel} ke pesanan`;

  const cartSummary = useMemo(() => {
    if (cartCount < 1) {
      return "Pesanan kosong";
    }
    return `${cartCount} Barang • ${productCount} Produk`;
  }, [cartCount, productCount]);

  const handleDecrease = () => {
    setQuantity((current) => Math.max(1, current - 1));
  };

  const handleIncrease = () => {
    setQuantity((current) => current + 1);
  };

  const handleAdd = () => {
    onAddToCart({
      productId: product.id,
      name: product.name,
      unit: selectedUnit,
      quantity,
      replaceUnit: true,
    });
  };

  return (
    <div
      className="productInfoOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <div className="productInfoPage">
        <header className="productInfoHeader">
          <button
            type="button"
            className="productInfoBackButton"
            aria-label="Kembali"
            onClick={onBack}
          >
            ←
          </button>
          <span className="productInfoHeaderTitle">Detail Produk</span>
        </header>

        <div className="productInfoScroll" ref={scrollRef}>
          <div className="productInfoIdentity">
            <ProductThumb product={product} variant="detail" alt={product.name} />
            <div className="productInfoIdentityText">
              <h2 className="productInfoName">{product.name}</h2>
              {product.category ? (
                <p className="productInfoCategory">{product.category}</p>
              ) : null}
            </div>
          </div>

          {isInCart ? (
            <div className="productInfoCartStatus">
              <p className="productInfoCartStatusCopy">
                <span className="productInfoCartStatusLabel">
                  Sudah di pesanan:
                </span>
                <span className="productInfoCartStatusValue" aria-live="polite">
                  {cartLine.quantity} {getCartUnitDisplayLabel(cartLine.unit)}
                </span>
              </p>
              <button
                type="button"
                className="productInfoEditInCart"
                onClick={onOpenCart}
              >
                Ubah di Pesanan Saya
              </button>
            </div>
          ) : null}

          <fieldset className="unitSelector productInfoUnitSelector">
            <legend className="unitSelectorLabel">Satuan Tersedia</legend>
            <div className="unitOptions">
              {product.availableUnits.map((unit) => (
                <button
                  key={unit}
                  type="button"
                  className={`unitOption${selectedUnit === unit ? " unitOption--selected" : ""}`}
                  aria-pressed={selectedUnit === unit}
                  onClick={() => setSelectedUnit(unit)}
                >
                  {getCartUnitDisplayLabel(unit)}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="quantityControl productInfoQuantity">
            <span className="quantityLabel">Jumlah</span>
            <div className="quantityStepper">
              <button
                type="button"
                className="quantityButton"
                aria-label="Kurangi jumlah"
                onClick={handleDecrease}
                disabled={quantity <= 1}
              >
                −
              </button>
              <span className="quantityValue" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                className="quantityButton"
                aria-label="Tambah jumlah"
                onClick={handleIncrease}
              >
                +
              </button>
            </div>
          </div>

          {hints.length > 0 ? (
            <ul className="productInfoHints" aria-label="Petunjuk satuan">
              {hints.map((hint) => (
                <li
                  key={`${hint.fromUnit}-${hint.toUnit}-${hint.quantity}`}
                  className="productInfoHint"
                >
                  1 {getCartUnitDisplayLabel(hint.fromUnit)} = {hint.quantity}{" "}
                  {getCartUnitDisplayLabel(hint.toUnit)}
                </li>
              ))}
            </ul>
          ) : null}

          <RelatedProductRow
            title="Produk Serupa"
            products={similarProducts}
            onAdd={onQuickAddRecommendation}
            onOpen={onOpenRecommendation}
          />
          <RelatedProductRow
            title="Sering Dipesan Bersama"
            products={recommendations}
            onAdd={onQuickAddRecommendation}
            onOpen={onOpenRecommendation}
          />
        </div>

        <div className="productInfoActions">
          <button
            type="button"
            className="productInfoCartButton"
            onClick={onOpenCart}
            aria-label={`Pesanan Saya, ${cartSummary}`}
          >
            <span className="productInfoCartIcon" aria-hidden="true">
              🛒
            </span>
            <span className="productInfoCartCount">{cartCount}</span>
          </button>
          <button
            type="button"
            className="productInfoAddButton"
            onClick={handleAdd}
            aria-label={addAriaLabel}
          >
            {addButtonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductInfoView;
