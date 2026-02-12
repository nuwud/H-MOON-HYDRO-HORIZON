#!/usr/bin/env python3
"""
WooCommerce Product Consolidation Runner

Consolidates simple products into variable products and merges grouped→variable duplicates.

Usage:
    python scripts/run_woo_consolidation.py --input CSVs/wc-product-export.csv --dry-run
    python scripts/run_woo_consolidation.py --input CSVs/wc-product-export.csv --confirm

Options:
    --input FILE        Input WooCommerce export CSV
    --output-dir DIR    Output directory (default: outputs/woo_consolidation)
    --dry-run           Analyze only, no file output (default)
    --confirm           Actually generate output files
    --priority-only     Only process priority consolidation groups
    --verbose           Show detailed output
"""

import argparse
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from woo_consolidation import (
    PatternMatcher,
    ProductAnalyzer,
    GroupedVariableMerger,
    WooCommerceCSVGenerator,
)
from woo_consolidation.generator import GeneratorConfig


def main():
    parser = argparse.ArgumentParser(
        description="Consolidate WooCommerce products into proper variable products"
    )
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="Input WooCommerce product export CSV file",
    )
    parser.add_argument(
        "--output-dir", "-o",
        default="outputs/woo_consolidation",
        help="Output directory for generated files",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=True,
        help="Analyze only, no file output (default)",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Actually generate output files",
    )
    parser.add_argument(
        "--priority-only",
        action="store_true",
        help="Only process priority consolidation groups (worst offenders)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed output",
    )
    
    args = parser.parse_args()
    
    # If --confirm specified, disable dry-run
    if args.confirm:
        args.dry_run = False
    
    # Validate input file
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}")
        sys.exit(1)
    
    print("=" * 70)
    print("WooCommerce Product Consolidation")
    print("=" * 70)
    print(f"Input:  {input_path}")
    print(f"Output: {args.output_dir}")
    print(f"Mode:   {'DRY-RUN (analysis only)' if args.dry_run else 'CONFIRM (will generate files)'}")
    print()
    
    # Initialize components
    pattern_matcher = PatternMatcher()
    analyzer = ProductAnalyzer(pattern_matcher)
    
    # Load and analyze CSV
    print("Loading CSV...")
    product_count = analyzer.load_csv(input_path)
    print(f"Loaded {product_count} products")
    print()
    
    # Run analysis
    print("Analyzing products...")
    result = analyzer.analyze()
    
    # Print summary
    print()
    print("-" * 70)
    print("ANALYSIS RESULTS")
    print("-" * 70)
    print()
    
    print(f"Total Products: {result.total_products}")
    print()
    print("Product Types:")
    type_dist = {k: len(v) for k, v in result.products_by_type.items()}
    for ptype, count in sorted(type_dist.items(), key=lambda x: -x[1]):
        pct = count / result.total_products * 100
        print(f"  {ptype:15} {count:5} ({pct:.1f}%)")
    print()
    
    print(f"Consolidation Groups Found: {len(result.consolidation_groups)}")
    total_consolidatable = sum(len(g.products) for g in result.consolidation_groups)
    print(f"Products to Consolidate: {total_consolidatable}")
    print()
    
    # Show top consolidation groups
    print("Top Consolidation Groups:")
    print("-" * 70)
    
    groups = result.consolidation_groups
    if args.priority_only:
        groups = [g for g in groups if g.is_priority]
        print(f"(Showing {len(groups)} priority groups)")
    else:
        groups = groups[:20]
        print(f"(Showing top 20 of {len(result.consolidation_groups)})")
    
    print()
    for i, group in enumerate(groups, 1):
        priority_marker = " [PRIORITY]" if group.is_priority else ""
        print(f"{i:2}. {group.base_name}{priority_marker}")
        print(f"    Pattern: {group.pattern_name}, Option: {group.option_name}")
        print(f"    Variants: {len(group.products)}")
        
        if args.verbose:
            for product, value in zip(group.products, group.variant_values):
                print(f"      - {value}: {product.sku or 'no-sku'} (${product.regular_price or 'n/a'})")
        else:
            values_preview = ", ".join(group.variant_values[:5])
            if len(group.variant_values) > 5:
                values_preview += f", +{len(group.variant_values) - 5} more"
            print(f"    Values: {values_preview}")
        print()
    
    print("-" * 70)
    print(f"Grouped/Variable Duplicates: {len(result.grouped_variable_duplicates)}")
    print()
    
    if result.grouped_variable_duplicates:
        print("Grouped products with matching variable products:")
        for dup in result.grouped_variable_duplicates[:10]:
            print(f"  - {dup.grouped_product.name}")
            for var in dup.variable_products[:2]:
                print(f"    -> matches: {var.name}")
        if len(result.grouped_variable_duplicates) > 10:
            print(f"  ... and {len(result.grouped_variable_duplicates) - 10} more")
    print()
    
    print("-" * 70)
    print(f"Category Issues: {len(result.category_issues)}")
    if result.category_issues:
        print("Products with missing or problematic categories:")
        for issue in result.category_issues[:5]:
            # issue is tuple: (product_name, current_cat, suggested_cat)
            print(f"  - {issue[0]}: {issue[1]} -> {issue[2]}")
    print()
    
    # If dry-run, stop here
    if args.dry_run:
        print("=" * 70)
        print("DRY-RUN COMPLETE")
        print("=" * 70)
        print()
        print("To generate output files, run with --confirm:")
        print(f"  python {sys.argv[0]} --input {args.input} --confirm")
        print()
        return 0
    
    # Generate output files
    print("=" * 70)
    print("GENERATING OUTPUT FILES")
    print("=" * 70)
    print()
    
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    config = GeneratorConfig(
        output_dir=output_dir,
        preserve_ids=False,
    )
    
    generator = WooCommerceCSVGenerator(config)
    
    # Filter groups if priority-only
    groups_to_process = result.consolidation_groups
    if args.priority_only:
        groups_to_process = [g for g in groups_to_process if g.is_priority]
    
    # Generate consolidated products CSV
    print("Generating consolidated products CSV...")
    csv_path, parent_count, variation_count = generator.generate_consolidated_products(
        groups_to_process,
        output_filename="consolidated_products.csv",
    )
    print(f"  Created: {csv_path}")
    print(f"  Parents: {parent_count}, Variations: {variation_count}")
    print()
    
    # Handle grouped→variable merges
    merger = GroupedVariableMerger()
    merge_result = merger.analyze_duplicates(result.grouped_variable_duplicates)
    
    # Generate deletion list
    print("Generating deletion list...")
    delete_path, delete_count = generator.generate_deletion_list(
        groups_to_process,
        merge_result,
        output_filename="products_to_delete.csv",
    )
    print(f"  Created: {delete_path}")
    print(f"  Products to delete: {delete_count}")
    print()
    
    # Generate SKU map
    print("Generating SKU map...")
    map_path = generator.generate_sku_map(groups_to_process)
    print(f"  Created: {map_path}")
    print()
    
    # Generate analysis report
    print("Generating analysis report...")
    report_path = output_dir / "analysis_report.md"
    report = analyzer.generate_report(result)
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report)
    print(f"  Created: {report_path}")
    print()
    
    print("=" * 70)
    print("GENERATION COMPLETE")
    print("=" * 70)
    print()
    print("Next steps:")
    print("1. Review consolidated_products.csv for accuracy")
    print("2. Import to WooCommerce: Products > Import")
    print("3. Delete old products using products_to_delete.csv as reference")
    print("4. Verify via WooCommerce admin")
    print()
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
