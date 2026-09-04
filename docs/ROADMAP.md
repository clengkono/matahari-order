# Matahari Order — Development Roadmap

This roadmap defines the planned evolution of Matahari Order.

The goal is to complete one release at a time, keeping every release stable before moving to the next.

## Current stage

Order history (Pesan Lagi occasion log) is shipped.
7C.1 local learning foundation is shipped.

Current: 7C.2 Sering Anda Pesan — personal convenience shortcuts from this device's recent prepared-for-WhatsApp ordering occasions.

Deferred real-world QA: when Sering Anda Pesan naturally contains approximately 4–8 genuine learned products, re-check horizontal swipe, next-card peek, all cards reachable, narrow-phone layout, no whole-page horizontal overflow, and that the cart-aware stepper does not cause rail jump. This is deferred scale/rail QA, not a known bug.

- 7C.3–7C.6 remain future

---

# Release 0.3 — Smart Ordering Foundation

Status: In Progress

Goal:

Build the core ordering workflow.

Features:

- ProductCard component
- ProductBottomSheet
- BottomSheet animation
- CartContext integration
- Quick Add
- Default quantity
- Default unit
- Add to Cart
- Cart count
- Empty search state

Completion checklist:

- [ ] ProductCard extracted
- [ ] BottomSheet works
- [ ] ProductBottomSheet works
- [ ] Quick Add works
- [ ] CartContext connected
- [ ] Cart count updates
- [ ] Build passes
- [ ] Lint passes

---

# Release 0.4 — Cart Review

Status: Planned

Goal:

Allow customers to review and edit their order.

Features:

- Cart Drawer
- Edit quantity
- Change unit
- Remove item
- Clear cart
- Empty cart state

Completion checklist:

- [ ] Cart drawer
- [ ] Quantity editing
- [ ] Remove item
- [ ] Clear cart
- [ ] Build passes

---

# Release 0.5 — WhatsApp Ordering

Status: Planned

Goal:

Generate a clean WhatsApp order.

Features:

- Order summary
- WhatsApp formatting
- Open WhatsApp

Completion checklist:

- [ ] Order summary
- [ ] WhatsApp message
- [ ] URL encoding
- [ ] Manual testing

---

# Release 0.6 — Smart Ordering

Status: Planned

Goal:

Help customers order more quickly.

Possible features:

- Tambahkan Semua
- Recently Ordered
- Suggested Products
- Frequently Bought Together

These features should remain lightweight and not distract from fast ordering.

---

# Release 1.0 — Production Release

Status: Planned

Requirements:

- Stable UI
- Responsive layout
- Error-free build
- Accessible controls
- Customer testing
- Production deployment

---

# Future Ideas

Ideas are recorded here but are **not** committed features.

Possible future improvements:

- Customer login
- Order history (shipped)
- Favorites by customer
- Seasonal suggestions
- Offline support
- Backend integration

Only move an idea into a release after explicit approval.