import csv
import re
import collections

p = 'outputs/shopify_complete_import.csv'

def base_title(t):
    t = (t or '').lower().strip()
    # remove parenthetical size
    t = re.sub(r'\([^)]*(ml|l|liter|litre|gal|gallon|qt|quart|oz|lb|kg|g)\b[^)]*\)', '', t)
    # remove trailing size tokens
    t = re.sub(r'\b(\d+(\.\d+)?\s*(ml|l|liter|litre|gal|gallon|qt|quart|oz|lb|kg|g))\b\.?$', '', t).strip()
    t = re.sub(r'\s+', ' ', t).strip(' -–—')
    return t

groups = collections.defaultdict(set)
with open(p, newline='', encoding='utf-8') as f:
    r = csv.DictReader(f)
    for row in r:
        title = row.get('Title', '').strip()
        if not title:  # skip variant rows
            continue
        groups[(row.get('Vendor', '').strip().lower(), base_title(title))].add(row['Handle'])

dupes = [(k, len(v), sorted(v)[:12]) for k, v in groups.items() if len(v) >= 2]
dupes.sort(key=lambda x: -x[1])

print('Top split families (Vendor|BaseTitle -> handle count):')
print('=' * 80)
for (vendor, bt), n, hs in dupes[:50]:
    print(f'{n:>2}  {vendor or "(no-vendor)"} | {bt[:45]}')
    for h in hs[:6]:
        print(f'      - {h}')
    print()
