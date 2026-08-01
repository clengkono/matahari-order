import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  addOrMergeLine,
  calculateCartCount,
  removeLine,
  updateLineQuantity,
} from "../utils/cartHelpers";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);

  const cartCount = useMemo(() => calculateCartCount(cart), [cart]);

  const addToCart = useCallback(({ productId, name, unit, quantity }) => {
    if (!productId || !name || !unit || quantity < 1) {
      return;
    }

    setCart((current) =>
      addOrMergeLine(current, { productId, name, unit, quantity })
    );
  }, []);

  const removeFromCart = useCallback((productId, unit) => {
    setCart((current) => removeLine(current, productId, unit));
  }, []);

  const updateQuantity = useCallback((productId, unit, quantity) => {
    setCart((current) =>
      updateLineQuantity(current, productId, unit, quantity)
    );
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const value = useMemo(
    () => ({
      cart,
      cartCount,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
    }),
    [cart, cartCount, addToCart, removeFromCart, updateQuantity, clearCart]
  );

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }

  return context;
}
