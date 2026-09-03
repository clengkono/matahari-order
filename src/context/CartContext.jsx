import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import products from "../catalog";
import {
  addOrMergeLine,
  calculateCartCount,
  changeLineUnit,
  normalizeOneUnitPerProduct,
  removeLine,
  removeProductLines,
  updateLineQuantity,
} from "../utils/cartHelpers";
import { loadStoredCart, saveStoredCart } from "../utils/orderDraftStorage";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => loadStoredCart(products));

  const normalizedCart = useMemo(
    () => normalizeOneUnitPerProduct(cart),
    [cart]
  );

  useEffect(() => {
    saveStoredCart(normalizedCart);
  }, [normalizedCart]);

  const cartCount = useMemo(
    () => calculateCartCount(normalizedCart),
    [normalizedCart]
  );

  const addToCart = useCallback(
    ({ productId, name, unit, quantity, replaceUnit = false }) => {
      if (!productId || !name || !unit || quantity < 1) {
        return;
      }

      setCart((current) =>
        addOrMergeLine(
          current,
          { productId, name, unit, quantity },
          { replaceUnit }
        )
      );
    },
    []
  );

  const removeFromCart = useCallback((productId) => {
    setCart((current) => removeLine(current, productId));
  }, []);

  const removeProduct = useCallback((productId) => {
    setCart((current) => removeProductLines(current, productId));
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    setCart((current) => updateLineQuantity(current, productId, quantity));
  }, []);

  const changeUnit = useCallback((productId, oldUnit, newUnit) => {
    setCart((current) => changeLineUnit(current, productId, oldUnit, newUnit));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const replaceCart = useCallback((lines) => {
    setCart(normalizeOneUnitPerProduct(Array.isArray(lines) ? lines : []));
  }, []);

  const lineCount = normalizedCart.length;
  const productCount = lineCount;

  const value = useMemo(
    () => ({
      cart: normalizedCart,
      cartCount,
      lineCount,
      productCount,
      addToCart,
      removeFromCart,
      removeProduct,
      updateQuantity,
      changeUnit,
      clearCart,
      replaceCart,
    }),
    [
      normalizedCart,
      cartCount,
      lineCount,
      productCount,
      addToCart,
      removeFromCart,
      removeProduct,
      updateQuantity,
      changeUnit,
      clearCart,
      replaceCart,
    ]
  );

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  );
}

// Hook export alongside provider — standard context pattern
// eslint-disable-next-line react-refresh/only-export-components
export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }

  return context;
}
