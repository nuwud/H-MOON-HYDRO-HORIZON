# scripts/compare_inventory.py
import csv
import os

ALL_EXPORT = os.path.join("CSVs", "shopify_export_after_prod__INCLUDE_ALL.csv")
WAREHOUSE = os.path.join("CSVs", "HMoonHydro_Inventory.csv")
OUT = os.path.join("reports", "sku_compare_report.csv")


def read_csv(fp):
    with open(fp, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def to_num(value):
    try:
        return int(float(value))
    except Exception:
        return 0


shopify = read_csv(ALL_EXPORT)
warehouse = read_csv(WAREHOUSE)

s_by_sku = {}
for row in shopify:
    sku = (row.get("sku") or "").strip()
    if not sku:
        continue
    s_by_sku.setdefault(sku, {"total": 0, "rows": []})
    s_by_sku[sku]["total"] += to_num(row.get("inv_total_all_locations", 0))
    s_by_sku[sku]["rows"].append(row)

w_by_sku = {}
for row in warehouse:
    sku = (row.get("SKU") or row.get("sku") or "").strip()
    if not sku:
        continue
    qty = row.get("Quantity") or row.get("qty") or row.get("QTY") or row.get("OnHand")
    w_by_sku[sku] = to_num(qty)

rows = []
headers = ["SKU", "Shopify_Total", "Warehouse_Total", "Delta", "Notes"]
for sku, skudata in s_by_sku.items():
    shop = skudata["total"]
    ware = w_by_sku.get(sku)
    if ware is None:
        rows.append([sku, shop, "", "", "Missing in Warehouse CSV"])
    else:
        delta = shop - ware
        note = "" if delta == 0 else ("Over by Shopify" if delta > 0 else "Over by Warehouse")
        rows.append([sku, shop, ware, delta, note])

for sku in w_by_sku:
    if sku not in s_by_sku:
        rows.append([sku, "", w_by_sku[sku], "", "Missing in Shopify"])

os.makedirs("reports", exist_ok=True)
with open(OUT, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)

print(f"[OK] Wrote comparison -> {OUT}")
