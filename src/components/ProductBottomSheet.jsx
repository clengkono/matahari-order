import { useState } from "react";
import BottomSheet from "./BottomSheet";

function ProductBottomSheet({ product, onClose, onAddToCart, initialUnit }) {
  const startingUnit =
    initialUnit && product.availableUnits.includes(initialUnit)
      ? initialUnit
      : product.defaultUnit;
  const [selectedUnit, setSelectedUnit] = useState(startingUnit);
  const [quantity, setQuantity] = useState(product.defaultQuantity);
  const [imageFailed, setImageFailed] = useState(false);
  const detailImage = product.image?.detail;
  const showImage = Boolean(detailImage) && !imageFailed;

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
    onClose();
  };

  return (
    <BottomSheet
      isOpen
      onClose={onClose}
      title={product.name}
    >
      {showImage ? (
        <img
          className="bottomSheetPhoto"
          src={detailImage}
          alt={product.name}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="bottomSheetImage">
          PRODUCT PHOTO
        </div>
      )}

      <h2 className="bottomSheetTitle">{product.name}</h2>

      <fieldset className="unitSelector">
        <legend className="unitSelectorLabel">Satuan</legend>
        <div className="unitOptions">
          {product.availableUnits.map((unit) => (
            <button
              key={unit}
              type="button"
              className={`unitOption${selectedUnit === unit ? " unitOption--selected" : ""}`}
              aria-pressed={selectedUnit === unit}
              onClick={() => setSelectedUnit(unit)}
            >
              {unit}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="quantityControl">
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

      <button
        type="button"
        className="bottomSheetAddButton"
        onClick={handleAdd}
      >
        Tambah ke Keranjang
      </button>
    </BottomSheet>
  );
}

export default ProductBottomSheet;
