function OrderReviewRow({
  line,
  availableUnits,
  onIncrease,
  onDecrease,
  onRemove,
  onChangeUnit,
}) {
  const handleDecrease = () => {
    onDecrease(line.productId, line.unit);
  };

  const handleIncrease = () => {
    onIncrease(line.productId, line.unit);
  };

  const handleRemove = () => {
    onRemove(line.productId, line.unit);
  };

  return (
    <li className="orderReviewRow">
      <div className="orderReviewRowHeader">
        <span className="orderReviewRowName">{line.name}</span>
        <button
          type="button"
          className="orderReviewRowRemove"
          aria-label={`Hapus ${line.name} ${line.quantity} ${line.unit}`}
          onClick={handleRemove}
        >
          Hapus
        </button>
      </div>

      <fieldset className="orderReviewRowUnits">
        <legend className="visuallyHidden">Satuan untuk {line.name}</legend>
        <div className="orderReviewRowUnitOptions">
          {availableUnits.map((unit) => (
            <button
              key={unit}
              type="button"
              className={`orderReviewRowUnit${line.unit === unit ? " orderReviewRowUnit--selected" : ""}`}
              aria-pressed={line.unit === unit}
              onClick={() => onChangeUnit(line.productId, line.unit, unit)}
            >
              {unit}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="orderReviewRowQuantity">
        <span className="orderReviewRowQuantityLabel">Jumlah</span>
        <div className="quantityStepper">
          <button
            type="button"
            className="quantityButton"
            aria-label={`Kurangi jumlah ${line.name}`}
            onClick={handleDecrease}
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
            aria-label={`Tambah jumlah ${line.name}`}
            onClick={handleIncrease}
          >
            +
          </button>
        </div>
      </div>
    </li>
  );
}

export default OrderReviewRow;
