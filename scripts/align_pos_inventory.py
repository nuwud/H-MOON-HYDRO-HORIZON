#!/usr/bin/env python3
"""Generate best-guess mappings between the POS inventory sheet and Shopify export.

This script consumes the recently provided `HMoonHydro_Inventory.csv` POS sheet
alongside the latest Shopify product export (`products_export_1.csv` by default).
It computes token-overlap similarity scores between each Shopify variant and
each POS item, writes a reviewable alignment spreadsheet, and emits auxiliary
reports for unmatched records on either side.

The output CSV is meant to be reviewed (and edited if necessary) before feeding
into the inventory synchronization workflow. High-confidence matches are marked
`auto-high`, while lower-scoring matches are flagged `needs-review` so the
merchandising team can verify the pairing before accepting it as source of
truth.
"""

from __future__ import annotations

import argparse
import math
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

from difflib import SequenceMatcher

import pandas as pd

# Thresholds for accepting POS ↔ Shopify matches
AUTO_THRESHOLD = 0.78
REVIEW_THRESHOLD = 0.63
AMBIGUITY_DELTA = 0.035

# Columns that contain location-specific inventory counts in the POS sheet
POS_QTY_PREFIX = "Qty "

# Columns emitted in the primary alignment CSV (order matters)
ALIGNMENT_COLUMNS: Sequence[str] = (
    "Variant SKU",
    "Handle",
    "Title",
    "Variant Price",
    "Variant Inventory Qty",
    "Top Candidate Item Number",
    "Top Candidate Item Name",
    "Top Candidate Score",
    "Top Candidate Qty Total",
    "Top Candidate Regular Price",
    "POS Item Number",
    "POS Item Name",
    "POS Size",
    "POS Qty Total",
    "POS Regular Price",
    "POS On Order Qty",
    "POS Vendor",
    "Match Score",
    "Confidence",
    "Review Notes",
    "Alt1 Item Number",
    "Alt1 Item Name",
    "Alt1 Score",
    "Alt2 Item Number",
    "Alt2 Item Name",
    "Alt2 Score",
)

# Tokens to normalise onto canonical unit names
UNIT_SYNONYMS: Dict[str, str] = {
    "gallons": "gal",
    "gallon": "gal",
    "gal": "gal",
    "in": "inch",
    "inch": "inch",
    "inches": "inch",
    "ft": "foot",
    "foot": "foot",
    "feet": "foot",
    "cm": "cm",
    "centimeter": "cm",
    "centimeters": "cm",
    "centimetre": "cm",
    "centimetres": "cm",
    "mm": "mm",
    "millimeter": "mm",
    "millimeters": "mm",
    "millimetre": "mm",
    "millimetres": "mm",
    "meter": "m",
    "meters": "m",
    "metre": "m",
    "metres": "m",
    "pk": "pack",
    "pks": "pack",
    "qt": "quart",
    "quart": "quart",
    "quarts": "quart",
    "pt": "pint",
    "pint": "pint",
    "pints": "pint",
    "ml": "ml",
    "milliliter": "ml",
    "milliliters": "ml",
    "liter": "l",
    "liters": "l",
    "litre": "l",
    "litres": "l",
    "l": "l",
    "lb": "lb",
    "lbs": "lb",
    "pound": "lb",
    "pounds": "lb",
    "oz": "oz",
    "ounce": "oz",
    "ounces": "oz",
    "pack": "pack",
    "packs": "pack",
    "kit": "kit",
    "kits": "kit",
    "pair": "pair",
    "pairs": "pair",
    "set": "set",
    "sets": "set",
    "bag": "bag",
    "bags": "bag",
    "box": "box",
    "boxes": "box",
    "tray": "tray",
    "trays": "tray",
    "case": "case",
    "cases": "case",
}

# Brand tokens to strip during normalisation so they do not dominate scoring.
# Many POS names already include vendor prefixes.
# Brand tokens to strip during normalisation so they do not dominate scoring.
# Many POS names already include vendor prefixes.
BRAND_STOPWORDS: Sequence[str] = (
    "h", "moon", "hydro", "foxfarm", "fox", "farm", "atlas", "seed",
    "advanced", "nutrients", "humboldt", "nickel", "city", "wholesale",
    "garden", "supply", "grow", "secret", "scietetics", "plantmax",
    "athena", "greenpower", "nanotech", "can", "filter",
)

# General linguistic stopwords removed from token sets to reduce noise.
COMMON_STOPWORDS: Sequence[str] = (
    "and", "the", "with", "for", "to", "of", "in", "on", "by",
    "new", "plus", "tm", "r", "trade", "mark", "inc", "llc",
    "default", "title", "simple",
)


@dataclass
class PosRecord:
    """Lightweight representation of a single POS inventory item."""

    index: int
    item_number: str
    name: str
    description: str
    size: str
    vendor: str
    tokens: frozenset[str]
    number_tokens: frozenset[str]
    size_tokens: frozenset[str]
    size_numbers: frozenset[str]
    normalized_text: str
    regular_price: float
    qty_total: float
    on_order_qty: float


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Align POS inventory with Shopify export")
    parser.add_argument(
        "--shopify",
        type=Path,
        default=Path("products_export_1.csv"),
        help="Path to the Shopify product export CSV",
    )
    parser.add_argument(
        "--pos",
        type=Path,
        default=Path("CSVs/HMoonHydro_Inventory.csv"),
        help="Path to the POS inventory CSV provided by the client",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("outputs/inventory/pos_shopify_alignment.csv"),
        help="Destination CSV for the alignment results",
    )
    parser.add_argument(
        "--unmatched-shopify",
        type=Path,
        default=Path("outputs/inventory/shopify_pos_unmatched.csv"),
        help="Path for the Shopify variants without a confident POS match",
    )
    parser.add_argument(
        "--unmatched-pos",
        type=Path,
        default=Path("outputs/inventory/pos_items_unmatched.csv"),
        help="Path for POS entries that were not paired to Shopify variants",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional limit for the number of Shopify variants to process (debugging)",
    )
    return parser.parse_args()


def ensure_ascii(text: str) -> str:
    """Return an ASCII-only version of *text* (lowercased)."""

    normalised = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")
    return normalised.lower()


def normalise_text(text: str) -> str:
    ascii_text = ensure_ascii(text)
    return re.sub(r"[^a-z0-9]+", " ", ascii_text).strip()


def singularize(token: str) -> str:
    """Return a naive singular form for basic English plurals."""

    if not token:
        return token

    lowered = token.lower()
    if lowered.endswith("series") or lowered.endswith("species"):
        return token

    if len(token) > 4 and lowered.endswith("ies"):
        return token[:-3] + "y"

    if len(token) > 4 and lowered.endswith("ves"):
        return token[:-3] + "f"

    if len(token) > 4 and lowered.endswith(("xes", "zes", "ches", "shes", "sses")):
        return token[:-2]

    if len(token) > 3 and lowered.endswith("s") and not lowered.endswith(("ss", "us", "is")):
        return token[:-1]

    return token


def parse_float(value: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def price_delta(variant_price: float, pos_price: float) -> float:
    if variant_price <= 0 or pos_price <= 0:
        return float("inf")
    return abs(variant_price - pos_price) / variant_price


def normalise_token(raw: str) -> str:
    mapped = UNIT_SYNONYMS.get(raw, raw)
    if mapped in BRAND_STOPWORDS or mapped in COMMON_STOPWORDS:
        return ""
    return mapped


def tokenise(text: str) -> Tuple[frozenset[str], frozenset[str]]:
    """Split *text* into general tokens and numeric tokens."""

    ascii_text = ensure_ascii(text)
    raw_tokens = re.findall(r"[a-z0-9]+", ascii_text)
    general_tokens: List[str] = []
    number_tokens: List[str] = []
    for token in raw_tokens:
        if token.isdigit():
            number_tokens.append(token)
            continue
        cleaned = normalise_token(token)
        if cleaned and len(cleaned) > 1:
            general_tokens.append(cleaned)
            singular = singularize(cleaned)
            if singular and singular != cleaned:
                general_tokens.append(singular)
    return frozenset(general_tokens), frozenset(number_tokens)


def load_pos_inventory(path: Path) -> Tuple[pd.DataFrame, List[PosRecord]]:
    if not path.exists():
        raise FileNotFoundError(f"POS inventory CSV not found: {path}")

    df = pd.read_csv(path, dtype=str).fillna("")
    qty_columns = [col for col in df.columns if col.startswith(POS_QTY_PREFIX)]
    qty_frame = df[qty_columns].apply(pd.to_numeric, errors="coerce").fillna(0.0)
    qty_total = qty_frame.sum(axis=1)
    df["__qty_total__"] = qty_total
    df["__on_order_qty__"] = pd.to_numeric(df.get("On Order Qty", 0), errors="coerce").fillna(0.0)
    df["__regular_price__"] = pd.to_numeric(df.get("Regular Price", 0), errors="coerce").fillna(0.0)

    pos_records: List[PosRecord] = []
    for index, row in df.iterrows():
        combined_text = " ".join(
            filter(
                None,
                [
                    row.get("Item Name", ""),
                    row.get("Item Description", ""),
                    row.get("Brief Description", ""),
                    row.get("Size", ""),
                ],
            )
        )
        tokens, numbers = tokenise(combined_text)
        size_tokens, size_numbers = tokenise(row.get("Size", ""))
        if not tokens and not numbers and not size_tokens and not size_numbers:
            continue
        pos_records.append(
            PosRecord(
                index=index,
                item_number=row.get("Item Number", ""),
                name=row.get("Item Name", ""),
                description=row.get("Item Description", ""),
                size=row.get("Size", ""),
                vendor=row.get("Vendor Name", ""),
                tokens=tokens,
                number_tokens=numbers,
                size_tokens=size_tokens,
                size_numbers=size_numbers,
                normalized_text=normalise_text(combined_text),
                regular_price=float(df.loc[index, "__regular_price__"]),
                qty_total=float(df.loc[index, "__qty_total__"]),
                on_order_qty=float(df.loc[index, "__on_order_qty__"]),
            )
        )
    return df, pos_records


def load_shopify_export(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Shopify export CSV not found: {path}")
    df = pd.read_csv(path, dtype=str).fillna("")
    if "Variant SKU" not in df.columns:
        raise ValueError("Shopify export missing 'Variant SKU' column")
    return df


def dice_coefficient(a: frozenset[str], b: frozenset[str]) -> float:
    if not a or not b:
        return 0.0
    overlap = len(a & b)
    if overlap == 0:
        return 0.0
    return (2.0 * overlap) / (len(a) + len(b))


def score_match(
    shop_tokens: frozenset[str],
    shop_numbers: frozenset[str],
    shop_size_tokens: frozenset[str],
    shop_text: str,
    pos_record: PosRecord,
) -> float:
    base = dice_coefficient(shop_tokens, pos_record.tokens)
    if base == 0.0:
        return 0.0

    if shop_numbers:
        overlap = len(shop_numbers & pos_record.number_tokens)
        if overlap == len(shop_numbers) and overlap > 0:
            base += 0.22
        elif overlap > 0:
            base += 0.12
        else:
            base -= 0.12

    # Reward explicit size/unit overlap
    if shop_size_tokens and pos_record.size_tokens:
        size_overlap = len(shop_size_tokens & pos_record.size_tokens)
        if size_overlap:
            base += 0.1 + 0.05 * min(size_overlap, 2)

    # Small boost when vendor tokens intersect
    vendor_tokens, _ = tokenise(pos_record.vendor)
    if vendor_tokens and vendor_tokens & shop_tokens:
        base += 0.04

    # Blend in fuzzy similarity on the normalised full text
    if shop_text and pos_record.normalized_text:
        ratio = SequenceMatcher(None, shop_text, pos_record.normalized_text).ratio()
        base += 0.55 * ratio

    return max(base, 0.0)


def resolve_matches(
    shopify_df: pd.DataFrame,
    pos_records: Sequence[PosRecord],
    limit: int | None = None,
) -> Tuple[pd.DataFrame, List[int]]:
    rows: List[Dict[str, object]] = []
    matched_pos_indices: List[int] = []

    iterable = shopify_df
    if limit is not None:
        iterable = shopify_df.head(limit)

    for _, variant in iterable.iterrows():
        sku = variant.get("Variant SKU", "").strip()
        title = variant.get("Title", "").strip()
        option_values = " ".join(
            filter(
                None,
                [
                    variant.get("Option1 Value", ""),
                    variant.get("Option2 Value", ""),
                    variant.get("Option3 Value", ""),
                ],
            )
        )
        combined_variant_text = " ".join(
            filter(
                None,
                [
                    title,
                    option_values,
                    variant.get("Handle", ""),
                    variant.get("Vendor", ""),
                    variant.get("Type", ""),
                ],
            )
        )
        tokens, numbers = tokenise(combined_variant_text)
        size_tokens, _ = tokenise(option_values)
        normalized_variant_text = normalise_text(combined_variant_text)
        variant_price_value = parse_float(variant.get("Variant Price", ""))

        scores: List[Tuple[float, PosRecord]] = []
        for pos_record in pos_records:
            score = score_match(tokens, numbers, size_tokens, normalized_variant_text, pos_record)
            if score <= 0:
                continue
            scores.append((score, pos_record))

        scores.sort(key=lambda item: item[0], reverse=True)
        top_matches = scores[:3]

        best_record = None
        best_score = 0.0
        decision_record = None
        decision_score = 0.0
        decision_confidence = "no-match"
        decision_reason = ""
        if top_matches:
            best_score, best_record = top_matches[0]

        top_candidate_number = best_record.item_number if best_record else ""
        top_candidate_name = best_record.name if best_record else ""
        top_candidate_score = f"{best_score:.3f}" if best_score else ""
        top_candidate_qty = best_record.qty_total if best_record else float("nan")
        top_candidate_price = best_record.regular_price if best_record else 0.0
        review_notes = ""
        best_alt_score = top_matches[1][0] if len(top_matches) > 1 else 0.0
        alt_record = top_matches[1][1] if len(top_matches) > 1 else None
        decision_record = best_record or decision_record
        decision_score = best_score if best_record is not None else decision_score

        # Determine confidence bucket and whether to accept the pairing
        confidence = "no-match"
        assigned_item_number = ""
        assigned_item_name = ""
        assigned_size = ""
        assigned_qty = 0.0
        assigned_price = 0.0
        assigned_on_order = 0.0
        assigned_vendor = ""

        if best_record is not None:
            alt_score = best_alt_score
            ambiguous = best_score - alt_score < AMBIGUITY_DELTA and alt_score > 0

            if best_score >= AUTO_THRESHOLD and not ambiguous:
                confidence = "auto-high"
            elif best_score >= REVIEW_THRESHOLD and not ambiguous:
                confidence = "needs-review"
            elif best_score >= REVIEW_THRESHOLD and ambiguous:
                confidence = "ambiguous"
            else:
                confidence = "low-score"

            decision_confidence = confidence

            if confidence == "ambiguous" and alt_record is not None:
                overlap_best_numbers = len(numbers & best_record.number_tokens)
                overlap_alt_numbers = len(numbers & alt_record.number_tokens)
                overlap_best_size = len(size_tokens & best_record.size_tokens)
                overlap_alt_size = len(size_tokens & alt_record.size_tokens)
                vendor_tokens_best, _ = tokenise(best_record.vendor)
                vendor_tokens_alt, _ = tokenise(alt_record.vendor)
                vendor_best = 1 if vendor_tokens_best & tokens else 0
                vendor_alt = 1 if vendor_tokens_alt & tokens else 0
                overlap_best_tokens = len(tokens & best_record.tokens)
                overlap_alt_tokens = len(tokens & alt_record.tokens)
                ratio_best = SequenceMatcher(None, normalized_variant_text, best_record.normalized_text).ratio()
                ratio_alt = SequenceMatcher(None, normalized_variant_text, alt_record.normalized_text).ratio()
                price_best = price_delta(variant_price_value, best_record.regular_price)
                price_alt = price_delta(variant_price_value, alt_record.regular_price)

                auto_resolve_reason = ""
                if overlap_best_numbers > overlap_alt_numbers:
                    auto_resolve_reason = "auto-resolved: stronger numeric overlap"
                elif overlap_best_numbers == overlap_alt_numbers and overlap_best_size > overlap_alt_size:
                    auto_resolve_reason = "auto-resolved: size tokens match"
                elif math.isfinite(price_best) and (
                    (not math.isfinite(price_alt))
                    or price_alt - price_best >= 0.04
                    or (price_best <= 0.05 and price_alt >= 0.15)
                ):
                    auto_resolve_reason = "auto-resolved: price proximity"
                elif overlap_best_tokens >= overlap_alt_tokens + 2:
                    auto_resolve_reason = "auto-resolved: token overlap"
                elif ratio_best - ratio_alt >= 0.05:
                    auto_resolve_reason = "auto-resolved: text similarity"
                elif vendor_best > vendor_alt and (best_score - alt_score) >= 0.01:
                    auto_resolve_reason = "auto-resolved: vendor tokens"

                if auto_resolve_reason:
                    decision_confidence = "auto-high" if best_score >= AUTO_THRESHOLD else "needs-review"
                    decision_reason = auto_resolve_reason
                else:
                    alt_reason = ""
                    if ratio_alt - ratio_best >= 0.06:
                        alt_reason = "auto-resolved: alt text similarity"
                    elif math.isfinite(price_alt) and (
                        (not math.isfinite(price_best))
                        or price_best - price_alt >= 0.06
                        or (price_alt <= 0.04 and price_best >= 0.12)
                    ):
                        alt_reason = "auto-resolved: alt price proximity"
                    elif overlap_alt_tokens >= overlap_best_tokens + 2:
                        alt_reason = "auto-resolved: alt token overlap"

                    if alt_reason:
                        decision_record = alt_record
                        decision_score = alt_score
                        decision_confidence = "auto-high" if alt_score >= AUTO_THRESHOLD else "needs-review"
                        decision_reason = alt_reason

                if decision_confidence == "ambiguous":
                    decision_confidence = "needs-review"
                    if not decision_reason:
                        delta_value = best_score - best_alt_score
                        alt_label = alt_record.item_number if alt_record else ""
                        decision_reason = f"Needs review: close alt {alt_label} (Δ={delta_value:.3f})"

            if decision_reason:
                review_notes = decision_reason
            confidence = decision_confidence

            if confidence == "needs-review" and not review_notes and alt_record is not None:
                review_notes = (
                    f"Verify vs alt {alt_record.item_number} (score {best_alt_score:.3f})"
                )

            if confidence in {"auto-high", "needs-review"} and decision_record is not None:
                assigned_item_number = decision_record.item_number
                assigned_item_name = decision_record.name
                assigned_size = decision_record.size
                assigned_qty = decision_record.qty_total
                assigned_price = decision_record.regular_price
                assigned_on_order = decision_record.on_order_qty
                assigned_vendor = decision_record.vendor
                matched_pos_indices.append(decision_record.index)
            else:
                if best_record.qty_total >= 20:
                    review_notes = (
                        f"High stock (~{int(round(best_record.qty_total))}) - manual confirmation"
                        if not review_notes
                        else review_notes
                    )
                if not review_notes:
                    delta_value = best_score - best_alt_score
                    review_notes = f"Ambiguous: Δ={delta_value:.3f}"
        else:
            review_notes = "No viable candidate"

        if confidence == "low-score" and best_score:
            review_notes = review_notes or "Low score - manual mapping"
        if confidence == "no-match":
            review_notes = "No match"

        def fmt_num(value: float) -> str:
            if math.isnan(value):
                return "0"
            if abs(value - round(value)) < 1e-6:
                return f"{int(round(value))}"
            return f"{value:.2f}"

        row = {
            "Variant SKU": sku,
            "Handle": variant.get("Handle", ""),
            "Title": title,
            "Variant Price": variant.get("Variant Price", ""),
            "Variant Inventory Qty": variant.get("Variant Inventory Qty", ""),
            "Top Candidate Item Number": top_candidate_number,
            "Top Candidate Item Name": top_candidate_name,
            "Top Candidate Score": top_candidate_score,
            "Top Candidate Qty Total": (
                fmt_num(top_candidate_qty) if best_record is not None else ""
            ),
            "Top Candidate Regular Price": (
                f"{top_candidate_price:.2f}" if best_record and top_candidate_price else ""
            ),
            "POS Item Number": assigned_item_number,
            "POS Item Name": assigned_item_name,
            "POS Size": assigned_size,
            "POS Qty Total": fmt_num(assigned_qty),
            "POS Regular Price": f"{assigned_price:.2f}" if assigned_price else "",
            "POS On Order Qty": fmt_num(assigned_on_order),
            "POS Vendor": assigned_vendor,
            "Match Score": f"{decision_score:.3f}" if decision_score else "",
            "Confidence": confidence,
            "Review Notes": review_notes,
            "Alt1 Item Number": top_matches[1][1].item_number if len(top_matches) > 1 else "",
            "Alt1 Item Name": top_matches[1][1].name if len(top_matches) > 1 else "",
            "Alt1 Score": f"{top_matches[1][0]:.3f}" if len(top_matches) > 1 else "",
            "Alt2 Item Number": top_matches[2][1].item_number if len(top_matches) > 2 else "",
            "Alt2 Item Name": top_matches[2][1].name if len(top_matches) > 2 else "",
            "Alt2 Score": f"{top_matches[2][0]:.3f}" if len(top_matches) > 2 else "",
        }

        rows.append(row)

    alignment_df = pd.DataFrame(rows, columns=ALIGNMENT_COLUMNS)
    return alignment_df, matched_pos_indices


def write_csv(path: Path, df: pd.DataFrame) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)


def main() -> None:
    args = parse_arguments()

    shopify_df = load_shopify_export(args.shopify)
    pos_df, pos_records = load_pos_inventory(args.pos)

    alignment_df, matched_pos_indices = resolve_matches(shopify_df, pos_records, limit=args.limit)

    write_csv(args.output, alignment_df)

    # Report Shopify variants lacking a confident match
    unmatched_shopify = alignment_df[
        ~alignment_df["Confidence"].isin({"auto-high", "needs-review"})
    ]
    write_csv(args.unmatched_shopify, unmatched_shopify)

    matched_pos_indices_set = set(matched_pos_indices)
    unmatched_pos_df = pos_df.loc[~pos_df.index.isin(matched_pos_indices_set)]
    write_csv(args.unmatched_pos, unmatched_pos_df)

    auto_count = int((alignment_df["Confidence"] == "auto-high").sum())
    review_count = int((alignment_df["Confidence"] == "needs-review").sum())
    ambiguous_count = int((alignment_df["Confidence"] == "ambiguous").sum())
    low_score_count = int((alignment_df["Confidence"] == "low-score").sum())
    no_match_count = int((alignment_df["Confidence"] == "no-match").sum())

    print("POS ↔ Shopify alignment summary")
    print("=" * 40)
    print(f"Shopify variants processed : {len(alignment_df):,}")
    print(f"High-confidence matches    : {auto_count:,}")
    print(f"Needs review (assigned)    : {review_count:,}")
    print(f"Ambiguous top matches      : {ambiguous_count:,}")
    print(f"Low-score suggestions      : {low_score_count:,}")
    print(f"No viable suggestions      : {no_match_count:,}")
    print()
    print(f"Alignment CSV              : {args.output}")
    print(f"Shopify unmatched report   : {args.unmatched_shopify}")
    print(f"POS unmatched report       : {args.unmatched_pos}")


if __name__ == "__main__":
    main()
