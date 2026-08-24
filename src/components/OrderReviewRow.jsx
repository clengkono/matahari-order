import { useState } from "react";
import { getCartUnitDisplayLabel } from "../utils/unitDisplay";

function OrderReviewRow({
  line,
  imageCard,
  availableUnits,
  onIncrease,
  onDecrease,
  onRemoveProduct,
  onChangeUnit,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(imageCard) && !imageFailed;
  const units =
    availableUnits.length > 0 ? availableUnits : [line.unit].filter(Boolean);

  const handleRemove = () => {
    onRemoveProduct(line.productId);
  };

  const handleSelectUnit = (newUnit) => {
    if (newUnit !== line.unit) {
      onChangeUnit(line.productId, line.unit, newUnit);
    }
  };

  return (
    <li className="orderReviewRow">
      <div className="orderReviewRowMain">
        {showImage ? (
          <img
            className="orderReviewRowThumb"
            src={imageCard}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div
            className="orderReviewRowThumb orderReviewRowThumb--placeholder"
            aria-hidden="true"
          >
            PRODUCT PHOTO
          </div>
        )}

        <div className="orderReviewRowBody">
          <div className="orderReviewRowHeader">
            <span className="orderReviewRowName">{line.name}</span>
            <button
              type="button"
              className="orderReviewRowRemove"
              aria-label={`Hapus ${line.name} dari pesanan`}
              onClick={handleRemove}
            >
              Hapus
            </button>
          </div>

          <div className="orderReviewUnitLine">
            <fieldset className="orderReviewUnitOptions">
              <legend className="visuallyHidden">
                Satuan untuk {line.name}
              </legend>
              {units.map((unit) => (
                <button
                  key={unit}
                  type="button"
                  className={`orderReviewUnitPill${line.unit === unit ? " orderReviewUnitPill--selected" : ""}`}
                  aria-pressed={line.unit === unit}
                  aria-label={getCartUnitDisplayLabel(unit)}
                  onClick={() => handleSelectUnit(unit)}
                >
                  {getCartUnitDisplayLabel(unit)}
                </button>
              ))}
            </fieldset>

            <div className="quantityStepper quantityStepper--compact">
              <button
                type="button"
                className="quantityButton"
                aria-label={`Kurangi ${line.name} ${getCartUnitDisplayLabel(line.unit)}`}
                onClick={() => onDecrease(line.productId)}
                disabled={line.quantity <= 1}
              >
                −
              </button>
              <span className="quantityValue" aria-live="polite">
                {line.quantity}
              </span>
              <button
                type="button"
                className="quantityButton"
                aria-label={`Tambah ${line.name} ${getCartUnitDisplayLabel(line.unit)}`}
                onClick={() => onIncrease(line.productId)}
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export default OrderReviewRow;
