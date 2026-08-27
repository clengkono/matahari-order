import App from "./App.jsx";
import { CartProvider } from "./context/CartContext";

export default function CustomerRoot() {
  return (
    <CartProvider>
      <App />
    </CartProvider>
  );
}
