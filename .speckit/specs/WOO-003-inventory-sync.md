# SPEC: WOO-003 — POS-WooCommerce Inventory Sync

## Status: 📋 SPECIFICATION COMPLETE

## Overview
A bi-directional inventory synchronization system between the **POS system** and **WooCommerce**. Ensures accurate stock levels across in-store and online sales, prevents overselling, and maintains pricing consistency.

---

## Problem Statement

### Current State
- **Manual inventory updates** — staff manually adjusts WooCommerce after in-store sales
- **Stock discrepancies** — online shows available, in-store is sold out
- **Overselling risk** — same item sold online and in-store simultaneously
- **Price drift** — POS and WooCommerce prices diverge over time
- **No audit trail** — can't trace inventory changes to source

### Target State
- **Near real-time sync** — POS sales reflected in WooCommerce within 5 minutes
- **Bi-directional** — online orders reduce POS inventory
- **Conflict resolution** — handle simultaneous sales gracefully
- **Price sync** — single source of truth for pricing
- **Full audit log** — every change tracked with timestamp and source

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    INVENTORY SYNC ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────┐              ┌───────────────┐                  │
│  │      POS      │              │  WooCommerce  │                  │
│  │    System     │              │     Store     │                  │
│  └───────┬───────┘              └───────┬───────┘                  │
│          │                              │                          │
│          │  Export CSV                  │  Webhook                 │
│          │  (Hourly)                    │  (Real-time)             │
│          ▼                              ▼                          │
│  ┌────────────────────────────────────────────────────┐           │
│  │                  SYNC ENGINE                        │           │
│  │                                                     │           │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │           │
│  │  │  Inventory  │  │   Price     │  │  Conflict   │ │           │
│  │  │   Matcher   │  │   Sync      │  │  Resolver   │ │           │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │           │
│  │                                                     │           │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │           │
│  │  │   Audit     │  │   Alert     │  │   Queue     │ │           │
│  │  │    Log      │  │   System    │  │   Manager   │ │           │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │           │
│  │                                                     │           │
│  └────────────────────────────────────────────────────┘           │
│          │                              │                          │
│          ▼                              ▼                          │
│  ┌───────────────┐              ┌───────────────┐                  │
│  │   POS API     │              │   WooCommerce │                  │
│  │   (Update)    │              │   REST API    │                  │
│  └───────────────┘              └───────────────┘                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### SKU Alignment Table

Uses existing `outputs/inventory/pos_shopify_alignment.csv`:

| POS SKU | WooCommerce SKU | Match Type | Confidence |
|---------|-----------------|------------|------------|
| BIG-BUD-1L | AN-BIGBUD-1L | fuzzy | 0.95 |
| FF-OCEAN-1.5 | FF-OCEAN-1-5-CUFT | exact | 1.0 |
| GH-FLORA-GRO | GH-FLORA-GRO-1QT | auto-high | 0.98 |

### Sync State Table (SQLite)

```sql
CREATE TABLE inventory_sync (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pos_sku TEXT NOT NULL,
    woo_sku TEXT NOT NULL,
    
    -- Current state
    pos_quantity INTEGER,
    woo_quantity INTEGER,
    last_pos_update DATETIME,
    last_woo_update DATETIME,
    
    -- Pricing
    pos_price DECIMAL(10,2),
    pos_cost DECIMAL(10,2),
    woo_price DECIMAL(10,2),
    
    -- Status
    sync_status TEXT CHECK(sync_status IN ('synced', 'pending', 'conflict', 'error')),
    last_sync DATETIME,
    
    UNIQUE(pos_sku, woo_sku)
);

CREATE TABLE sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id INTEGER REFERENCES inventory_sync(id),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT CHECK(source IN ('pos', 'woo', 'manual', 'sync_engine')),
    action TEXT CHECK(action IN ('qty_update', 'price_update', 'conflict_resolved')),
    old_value TEXT,
    new_value TEXT,
    reason TEXT
);

CREATE TABLE sync_conflicts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id INTEGER REFERENCES inventory_sync(id),
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    conflict_type TEXT,
    pos_value TEXT,
    woo_value TEXT,
    resolved_at DATETIME,
    resolution TEXT
);
```

---

## Sync Modes

### Mode 1: POS → WooCommerce (Primary)

POS is source of truth for:
- **Stock quantities** — in-store inventory count
- **Cost prices** — wholesale cost from vendors
- **UPC codes** — barcode data

```python
def sync_pos_to_woo(pos_data, woo_client, alignment):
    """Push POS inventory to WooCommerce."""
    
    changes = []
    
    for pos_item in pos_data:
        woo_sku = alignment.get_woo_sku(pos_item['sku'])
        if not woo_sku:
            continue
        
        woo_product = woo_client.get_product_by_sku(woo_sku)
        if not woo_product:
            continue
        
        # Update stock quantity
        if pos_item['quantity'] != woo_product['stock_quantity']:
            changes.append({
                'sku': woo_sku,
                'field': 'stock_quantity',
                'old': woo_product['stock_quantity'],
                'new': pos_item['quantity']
            })
            woo_client.update_product(woo_product['id'], {
                'stock_quantity': pos_item['quantity'],
                'manage_stock': True
            })
    
    return changes
```

### Mode 2: WooCommerce → POS (Orders)

When online order is placed:
- **Reduce POS quantity** — decrement by order quantity
- **Mark as online sale** — for reporting

```python
def handle_woo_order(order, pos_client, alignment):
    """Reduce POS inventory when WooCommerce order placed."""
    
    for item in order['line_items']:
        woo_sku = item['sku']
        pos_sku = alignment.get_pos_sku(woo_sku)
        
        if pos_sku:
            pos_client.reduce_quantity(
                sku=pos_sku,
                quantity=item['quantity'],
                reason=f"WooCommerce Order #{order['id']}"
            )
```

### Mode 3: Bi-directional Price Sync

```python
class PriceSync:
    """Sync prices between POS and WooCommerce."""
    
    def __init__(self, price_source='pos'):
        # Which system is source of truth for prices
        self.price_source = price_source
    
    def sync_prices(self, pos_data, woo_client, alignment):
        changes = []
        
        for pos_item in pos_data:
            woo_sku = alignment.get_woo_sku(pos_item['sku'])
            if not woo_sku:
                continue
            
            woo_product = woo_client.get_product_by_sku(woo_sku)
            if not woo_product:
                continue
            
            pos_price = pos_item.get('retail_price', 0)
            woo_price = float(woo_product.get('regular_price', 0) or 0)
            
            if self.price_source == 'pos' and pos_price != woo_price:
                # Update WooCommerce to match POS
                woo_client.update_product(woo_product['id'], {
                    'regular_price': str(pos_price)
                })
                changes.append({
                    'sku': woo_sku,
                    'field': 'price',
                    'old': woo_price,
                    'new': pos_price
                })
        
        return changes
```

---

## Conflict Resolution

### Conflict Types

| Type | Description | Resolution |
|------|-------------|------------|
| **Simultaneous sale** | Item sold online and in-store at same moment | Accept both, may go negative |
| **Quantity mismatch** | POS and WooCommerce disagree on quantity | POS wins (physical count) |
| **Price mismatch** | Different prices in systems | Configurable source of truth |
| **Missing alignment** | SKU exists in one system only | Alert for manual review |

### Resolution Strategy

```python
class ConflictResolver:
    def resolve_quantity_conflict(self, pos_qty, woo_qty, last_pos_change, last_woo_change):
        """Resolve quantity conflicts between systems."""
        
        # If POS was updated more recently, trust POS
        if last_pos_change > last_woo_change:
            return {'winner': 'pos', 'quantity': pos_qty}
        
        # If WooCommerce was updated more recently (online order), 
        # calculate the delta and apply to POS quantity
        if last_woo_change > last_pos_change:
            delta = woo_qty - pos_qty  # Usually negative (sales)
            return {'winner': 'woo', 'quantity': pos_qty + delta}
        
        # Same timestamp - trust POS (physical inventory)
        return {'winner': 'pos', 'quantity': pos_qty}
```

---

## Sync Schedule

### Automated Sync Jobs

| Job | Frequency | Direction | Purpose |
|-----|-----------|-----------|---------|
| **Full inventory sync** | Daily 3 AM | POS → WooCommerce | Reconcile all quantities |
| **Incremental sync** | Every 15 min | POS → WooCommerce | Recent changes only |
| **Order webhook** | Real-time | WooCommerce → POS | Online order inventory |
| **Price sync** | Daily 4 AM | POS → WooCommerce | Price updates |
| **Conflict check** | Hourly | Both | Detect discrepancies |

### Cron Configuration

```bash
# crontab entries
# Full inventory sync at 3 AM
0 3 * * * /usr/bin/python3 /path/to/sync_inventory.py --full

# Incremental sync every 15 minutes (business hours)
*/15 6-22 * * * /usr/bin/python3 /path/to/sync_inventory.py --incremental

# Price sync at 4 AM
0 4 * * * /usr/bin/python3 /path/to/sync_prices.py

# Conflict detection hourly
0 * * * * /usr/bin/python3 /path/to/detect_conflicts.py
```

---

## Webhook Integration

### WooCommerce Order Webhook

```php
// Register webhook for order creation
add_action('woocommerce_order_status_processing', function($order_id) {
    $order = wc_get_order($order_id);
    
    $payload = [
        'order_id' => $order_id,
        'items' => []
    ];
    
    foreach ($order->get_items() as $item) {
        $product = $item->get_product();
        $payload['items'][] = [
            'sku' => $product->get_sku(),
            'quantity' => $item->get_quantity()
        ];
    }
    
    // Send to sync endpoint
    wp_remote_post('https://sync.hmoonhydro.local/webhook/order', [
        'body' => json_encode($payload),
        'headers' => ['Content-Type' => 'application/json']
    ]);
});
```

### Webhook Receiver

```python
from flask import Flask, request
app = Flask(__name__)

@app.route('/webhook/order', methods=['POST'])
def handle_order_webhook():
    data = request.json
    
    for item in data['items']:
        # Update POS inventory
        pos_client.reduce_quantity(
            sku=alignment.get_pos_sku(item['sku']),
            quantity=item['quantity'],
            reason=f"WooCommerce Order #{data['order_id']}"
        )
        
        # Log the change
        log_sync_event(
            source='woo',
            action='qty_update',
            sku=item['sku'],
            delta=-item['quantity']
        )
    
    return {'status': 'ok'}
```

---

## Alerting

### Alert Conditions

| Condition | Severity | Action |
|-----------|----------|--------|
| Stock goes negative | High | Email + POS notification |
| >10 units discrepancy | Medium | Daily report |
| Price differs >20% | Medium | Review queue |
| Sync failure | High | Email + retry |
| Missing SKU alignment | Low | Weekly report |

### Alert Implementation

```python
def check_alerts(sync_state):
    alerts = []
    
    for item in sync_state:
        # Negative stock
        if item['woo_quantity'] < 0:
            alerts.append({
                'type': 'negative_stock',
                'severity': 'high',
                'sku': item['woo_sku'],
                'quantity': item['woo_quantity']
            })
        
        # Large discrepancy
        if abs(item['pos_quantity'] - item['woo_quantity']) > 10:
            alerts.append({
                'type': 'quantity_discrepancy',
                'severity': 'medium',
                'sku': item['woo_sku'],
                'pos_qty': item['pos_quantity'],
                'woo_qty': item['woo_quantity']
            })
        
        # Price difference >20%
        if item['pos_price'] and item['woo_price']:
            diff = abs(item['pos_price'] - item['woo_price']) / item['pos_price']
            if diff > 0.20:
                alerts.append({
                    'type': 'price_discrepancy',
                    'severity': 'medium',
                    'sku': item['woo_sku'],
                    'pos_price': item['pos_price'],
                    'woo_price': item['woo_price']
                })
    
    return alerts
```

---

## CLI Tool

```bash
# Full inventory sync
python scripts/sync/inventory_sync.py --full
# Syncs all ~2,554 POS items

# Incremental sync (changes since last run)
python scripts/sync/inventory_sync.py --incremental

# Price sync
python scripts/sync/price_sync.py

# Detect conflicts
python scripts/sync/detect_conflicts.py
# Output: conflicts_20260212.csv

# Resolve specific conflict
python scripts/sync/resolve_conflict.py --sku AN-BIGBUD-1L --winner pos

# Generate sync report
python scripts/sync/sync_report.py --period weekly
# Output: sync_report_20260206_20260212.md

# Test alignment
python scripts/sync/test_alignment.py --sku AN-BIGBUD-1L
# Shows: POS SKU, WooCommerce SKU, current quantities, sync state
```

---

## Dashboard Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| Sync latency | Time from POS change to WooCommerce update | <5 min |
| Alignment coverage | % of POS items mapped to WooCommerce | >95% |
| Conflict rate | Conflicts per day | <5 |
| Sync success rate | % of syncs completing without error | >99% |
| Inventory accuracy | POS vs WooCommerce match rate | >98% |

---

## Implementation Files

| File | Purpose |
|------|---------|
| `scripts/sync/inventory_sync.py` | Main sync engine |
| `scripts/sync/price_sync.py` | Price synchronization |
| `scripts/sync/detect_conflicts.py` | Conflict detection |
| `scripts/sync/resolve_conflict.py` | Conflict resolution |
| `scripts/sync/webhook_server.py` | Flask webhook receiver |
| `scripts/sync/pos_client.py` | POS API wrapper |
| `scripts/sync/sync_db.py` | SQLite state management |
| `scripts/sync/alerts.py` | Alerting system |

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| POS items aligned | ✅ >95% of 2,554 items |
| Real-time order sync | ✅ <5 minute latency |
| Daily full sync | ✅ Completing without errors |
| Conflict resolution | ✅ Auto-resolved >90% |
| Accurate inventory | ✅ <5 units average discrepancy |

---

## Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 1. SKU alignment verification | 0.5 day | Verify 928 auto-high + add more |
| 2. Sync engine core | 1.5 days | Full + incremental sync |
| 3. Webhook integration | 1 day | Order webhook processing |
| 4. Conflict detection | 0.5 day | Detection + alerting |
| 5. Reporting | 0.5 day | Dashboard + reports |
| 6. Testing | 1 day | End-to-end validation |

**Total: ~5 days**

---

## Dependencies

- Python 3.10+
- woocommerce>=3.0
- flask (webhook server)
- sqlite3 (state storage)
- schedule (job scheduling)

---

## References

- [WooCommerce Webhooks](https://woocommerce.github.io/woocommerce-rest-api-docs/#webhooks)
- [WooCommerce Inventory Management](https://woocommerce.com/document/managing-products/)
- Current alignment: `outputs/inventory/pos_shopify_alignment.csv`
