# SPEC: EDIT-001 — Product Editor Dashboard

## Status: 🚧 IN PROGRESS

## Overview
A comprehensive browser-based product editor that allows real-time editing of product data, images, specs, and documents. Designed for efficient manual review and enrichment of the H-Moon Hydro catalog.

---

## Problem Statement

### Current Pain Points
1. **Image Review is View-Only** — Can't save changes per-product
2. **No Multi-Image Support** — Products need 2-5 images each
3. **Limited Product Data** — Only images, not descriptions/specs
4. **No Spec Sheet Support** — PDFs, feed charts not trackable
5. **Poor Image Search** — Scripts miss obvious Google results
6. **Batch-Only Export** — Must export all at once, can't save incrementally

### Target State
- **Live Product Editor** in browser
- **Per-item save** with local storage persistence
- **Multi-image management** with drag-to-reorder
- **Editable fields**: Title, Description, Tags, Specs, Images
- **Spec sheet attachments** (PDFs, images)
- **Smart image search** with Google/Bing integration
- **Auto-suggestions** for missing data
- **Progress tracking** per product

---

## Features

### 1. Product Card (Expanded)
```
┌─────────────────────────────────────────────────────────────────────┐
│ ☑️ Approved  [📋 Copy Title] [🔗 Open in Shopify] [💾 Save]        │
├─────────────────────────────────────────────────────────────────────┤
│ Title: [General Hydroponics Flora Series FloraMicro 1 Gallon    ]  │
│ Vendor: [General Hydroponics  ▼]   Handle: flora-micro-gallon      │
├─────────────────────────────────────────────────────────────────────┤
│ IMAGES (drag to reorder)                                            │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                       │
│ │ img1 │ │ img2 │ │ img3 │ │ + Add│ │ 🔍   │                       │
│ │ [X]  │ │ [X]  │ │ [X]  │ │ URL  │ │Search│                       │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                       │
│                                                                     │
│ Quick Search: [Google] [Amazon] [Manufacturer] [HTG] [GrowGen]     │
├─────────────────────────────────────────────────────────────────────┤
│ DESCRIPTION                                                         │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ FloraMicro provides nitrogen, potassium, calcium and trace...  │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ 💡 Suggested: Add NPK ratio, dilution rate, compatible media       │
├─────────────────────────────────────────────────────────────────────┤
│ SPECIFICATIONS                                                      │
│ NPK Ratio:     [5-0-1        ]   Form:      [Liquid    ▼]          │
│ Size:          [1 Gallon     ]   Weight:    [9.5 lbs   ]           │
│ Dilution:      [1 tsp/gal    ]   pH Range:  [5.5-6.5   ]           │
├─────────────────────────────────────────────────────────────────────┤
│ DOCUMENTS                                                           │
│ 📄 Feed Chart: [                    ] [Browse] [🔍 Find Online]    │
│ 📄 SDS Sheet:  [                    ] [Browse] [🔍 Find Online]    │
├─────────────────────────────────────────────────────────────────────┤
│ TAGS  [nutrients] [hydro] [general-hydroponics] [+Add]             │
├─────────────────────────────────────────────────────────────────────┤
│ Status: ✅ Complete (5/5 images, description, specs)                │
└─────────────────────────────────────────────────────────────────────┘
```

### 2. Persistence
- **LocalStorage** — Save state per product in browser
- **Export JSON** — Download all changes as JSON
- **Import JSON** — Resume from previous session
- **Auto-save** — Every 30 seconds

### 3. Smart Suggestions
- Detect missing fields and suggest values
- Auto-extract specs from description text
- Suggest tags based on product type
- Warn about common issues (low-res images, short descriptions)

### 4. Image Search Enhancement
- **Embedded Google Images** iframe/modal
- **Image URL extractor** — Paste page URL, extract images
- **Drag-and-drop** from browser
- **Clipboard paste** — Ctrl+V image

### 5. Batch Operations
- Select multiple products → bulk edit tags
- Copy specs from one product to similar products
- Apply vendor to all filtered products

---

## Technical Implementation

### Data Structure
```typescript
interface EditableProduct {
  handle: string;
  title: string;
  vendor: string;
  description: string;
  descriptionHtml: string;
  
  images: ProductImage[];
  documents: ProductDocument[];
  specs: Record<string, string>;
  tags: string[];
  
  status: 'pending' | 'in-progress' | 'complete' | 'needs-review';
  completeness: number; // 0-100
  lastModified: string;
  notes: string;
}

interface ProductImage {
  url: string;
  source: string;
  position: number;
  altText: string;
  isApproved: boolean;
}

interface ProductDocument {
  type: 'feed-chart' | 'sds' | 'manual' | 'spec-sheet' | 'other';
  url: string;
  filename: string;
}
```

### Storage
```javascript
// Save single product
localStorage.setItem(`product:${handle}`, JSON.stringify(product));

// Get all modified products
const modified = Object.keys(localStorage)
  .filter(k => k.startsWith('product:'))
  .map(k => JSON.parse(localStorage.getItem(k)));
```

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/generate_product_editor.js` | Generate the HTML editor |
| `scripts/apply_editor_changes.js` | Apply exported JSON to Shopify |
| `scripts/smart_image_search.js` | Enhanced image search with multiple sources |

---

## Phases

### Phase 1: Enhanced Image Editor ✅
- Multi-image support
- Per-product save
- Better search links
- LocalStorage persistence

### Phase 2: Full Product Editor
- Editable title, description, specs
- Tag management
- Document attachments

### Phase 3: Smart Suggestions
- Auto-detect missing fields
- Suggest values from similar products
- Quality scoring

### Phase 4: Shopify Sync
- Push changes to Shopify via GraphQL
- Pull latest data from Shopify
- Conflict resolution

---

## Success Metrics
- [ ] Edit and save 100+ products per session
- [ ] Add 3+ images per product on average
- [ ] 90%+ products marked "complete"
- [ ] Export → Import roundtrip works
- [ ] Changes successfully pushed to Shopify
