# MATAHARI ORDER
## Master Project Specification

Version: 1.0
Status: Active
Author: ChatGPT (Technical Lead)
Product Owner: Cliff Lengkono

---

# 1. Purpose

Matahari Order is a mobile-first ordering application for Matahari Wholesale.

The application is designed to let existing customers place orders faster than WhatsApp typing while requiring almost no training.

This is NOT an e-commerce application.

It is an ordering tool.

---

# 2. Core Principles

Every design decision must satisfy these priorities:

1. Speed
2. Simplicity
3. Familiarity
4. Reliability

Never sacrifice speed for visual effects.

---

# 3. Target Users

Primary users:

• Existing wholesale customers
• Returning customers
• Customers already familiar with Matahari products

The application is NOT designed for first-time online shoppers.

---

# 4. Design Philosophy

Inspired by:

• Alfagift

Not inspired by:

• Shopee
• Tokopedia
• Lazada

Reason:

Customers already know what they want.

The app should help them order quickly, not browse endlessly.

---

# 5. UI Principles

Keep interfaces clean.

Avoid clutter.

Every screen should have one obvious action.

Large readable text.

Large touch targets.

Minimal scrolling.

Blue is the primary accent colour.

Rounded corners.

Soft shadows.

Modern but conservative.

---

# 6. Coding Standards

React + Vite.

Plain CSS only.

No Tailwind.

No Bootstrap.

No unnecessary dependencies.

Component-based architecture.

Reusable components.

Readable code.

No inline styles unless technically unavoidable.

Animations belong in CSS.

---

# 7. Naming Standards

Components:

PascalCase

Examples:

ProductCard

ShoppingCart

BottomSheet

CSS:

kebab-case

Example:

product-card

bottom-sheet

Variables:

camelCase

---

# 8. Product Card Rules

Display:

• Image
• Product name
• Compact "+ Keranjang" button

Do NOT display:

• Price
• Category
• Unit

Cards should remain visually lightweight.

---

# 9. Bottom Sheet Rules

Displays:

• Image
• Product name
• Unit selector
• Quantity selector
• Add to Cart button

May display price if Product Owner later enables it.

Closes when:

• Backdrop tapped

Must animate smoothly.

---

# 10. Shopping Cart Rules

Products are unique by:

Product ID

+

Selected Unit

Changing quantity updates existing entry.

Cart badge shows total quantity.

---

# 11. WhatsApp Export

Orders are exported in a clean human-readable format.

Example:

2 Dus Glory

3 Bungkus Masako

1 Pcs Coca-Cola

No emojis.

No markdown.

Easy to read.

---

# 12. Search

Search must prioritise:

Product name

Future:

Brand

Barcode

SKU

---

# 13. Performance

Fast startup.

Fast scrolling.

Minimal re-rendering.

Avoid unnecessary state.

No premature optimisation.

---

# 14. Roadmap

Release 1

Customer Ordering

Release 2

Customer Experience

Release 3

Admin Features

Release 4

Inventory

Release 5

Analytics

---

# 15. Rule for Future Development

When implementing features:

Do not redesign existing UI unless requested.

Preserve architecture.

Preserve naming.

Prefer extending existing components over replacing them.

When uncertain,

choose the simplest implementation.