import PreviousOrderCard from "./PreviousOrderCard";

function PreviousOrdersSection({ orders, products, onPesanLagi }) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return null;
  }

  return (
    <section className="homeSection previousOrdersSection" aria-label="Pesanan sebelumnya">
      <div className="sectionTitle">Pesanan sebelumnya</div>
      <ul className="previousOrdersList">
        {orders.map((order) => (
          <PreviousOrderCard
            key={order.id}
            order={order}
            products={products}
            onPesanLagi={onPesanLagi}
          />
        ))}
      </ul>
    </section>
  );
}

export default PreviousOrdersSection;
