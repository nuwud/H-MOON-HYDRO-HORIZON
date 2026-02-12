"""
WooCommerce Product Consolidation Module

Consolidates simple products into variable products with proper variant structure.
Merges grouped/variable duplicates and outputs WooCommerce-compatible CSV imports.

Usage:
    python scripts/run_woo_consolidation.py --input CSVs/wc-product-export.csv --dry-run
"""

from .patterns import PatternMatcher, CONSOLIDATION_PATTERNS
from .analyzer import ProductAnalyzer
from .merger import GroupedVariableMerger
from .generator import WooCommerceCSVGenerator

__version__ = "1.0.0"
__all__ = [
    "PatternMatcher",
    "CONSOLIDATION_PATTERNS", 
    "ProductAnalyzer",
    "GroupedVariableMerger",
    "WooCommerceCSVGenerator",
]
