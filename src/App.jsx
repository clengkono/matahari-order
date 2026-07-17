import { useState } from "react";
import "./App.css";
import products from "./data/products";

const categories = [
  "🚬 Rokok",
  "🥤 Minuman",
  "🍳 Bahan & Bumbu Masak",
  "🧼 Perawatan",
  "🧹 Kebersihan",
];

export default function App() {

  const [search, setSearch] = useState("");

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(search.toLowerCase())
  );

  const favoriteProducts = filteredProducts.filter(
    product => product.favorite
  );

  return (
    <div className="app">

      <header className="header">
        <h1>Matahari Order</h1>
        <p>Pesan kebutuhan toko dengan cepat.</p>
      </header>

      <div className="searchSection">

        <input
          className="searchBox"
          placeholder="Cari nama produk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

      </div>

      <section>

        <div className="sectionTitle">

          ⭐ Sering Dipesan

        </div>

        <div className="productRow">

          {favoriteProducts.map(product => (

            <div className="productCard" key={product.id}>

              <div className="imagePlaceholder">
                Product Photo
              </div>

              <div className="productName">
                {product.name}
              </div>

              <button className="addButton">
                Tambah
              </button>

            </div>

          ))}

        </div>

      </section>

      <section>

        <div className="sectionTitle">

          Kategori

        </div>

        <div className="categoryGrid">

          {categories.map(category => (

            <button
              key={category}
              className="categoryButton"
            >
              {category}
            </button>

          ))}

        </div>

      </section>

    </div>
  );
}