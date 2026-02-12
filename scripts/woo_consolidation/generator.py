"""
WooCommerce CSV Generator

Generates WooCommerce-compatible CSV files for importing consolidated products.
"""

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .analyzer import ProductRecord, ConsolidationGroup, AnalysisResult
from .merger import MergeResult


# WooCommerce CSV columns for product import
WOOCOMMERCE_COLUMNS = [
    "ID",
    "Type",
    "SKU",
    "Name",
    "Published",
    "Is featured?",
    "Visibility in catalog",
    "Short description",
    "Description",
    "Date sale price starts",
    "Date sale price ends",
    "Tax status",
    "Tax class",
    "In stock?",
    "Stock",
    "Low stock amount",
    "Backorders allowed?",
    "Sold individually?",
    "Weight (lbs)",
    "Length (in)",
    "Width (in)",
    "Height (in)",
    "Allow customer reviews?",
    "Purchase note",
    "Sale price",
    "Regular price",
    "Categories",
    "Tags",
    "Shipping class",
    "Images",
    "Download limit",
    "Download expiry days",
    "Parent",
    "Grouped products",
    "Upsells",
    "Cross-sells",
    "External URL",
    "Button text",
    "Position",
    "Brands",
    "Attribute 1 name",
    "Attribute 1 value(s)",
    "Attribute 1 visible",
    "Attribute 1 global",
]


@dataclass
class GeneratorConfig:
    """Configuration for CSV generation."""
    output_dir: Path
    preserve_ids: bool = False  # Whether to include IDs (for updates) or leave blank (new)
    default_published: str = "1"
    default_visibility: str = "visible"
    default_tax_status: str = "taxable"


class WooCommerceCSVGenerator:
    """
    Generates WooCommerce-compatible CSV files for product consolidation.
    """
    
    def __init__(self, config: GeneratorConfig):
        self.config = config
        self.config.output_dir.mkdir(parents=True, exist_ok=True)
    
    def generate_consolidated_products(
        self,
        groups: List[ConsolidationGroup],
        output_filename: str = "consolidated_products.csv",
    ) -> Tuple[Path, int, int]:
        """
        Generate WooCommerce CSV with consolidated variable products.
        
        Returns: (output_path, parent_count, variation_count)
        """
        rows = []
        parent_count = 0
        variation_count = 0
        
        for group in groups:
            # Generate parent (variable) product row
            parent_row = self._create_parent_row(group)
            rows.append(parent_row)
            parent_count += 1
            
            # Generate variation rows
            for i, (product, variant_value) in enumerate(
                zip(group.products, group.variant_values)
            ):
                variation_row = self._create_variation_row(
                    parent_sku=parent_row["SKU"],
                    original_product=product,
                    variant_value=variant_value,
                    option_name=group.option_name,
                    position=i,
                )
                rows.append(variation_row)
                variation_count += 1
        
        # Write CSV
        output_path = self.config.output_dir / output_filename
        self._write_csv(output_path, rows)
        
        return output_path, parent_count, variation_count
    
    def generate_deletion_list(
        self,
        groups: List[ConsolidationGroup],
        merge_result: Optional[MergeResult] = None,
        output_filename: str = "products_to_delete.csv",
    ) -> Tuple[Path, int]:
        """
        Generate CSV listing products that should be deleted after import.
        
        This is a reference file - WooCommerce doesn't support delete via CSV import.
        Use WP-CLI or bulk actions in admin.
        """
        rows = []
        
        # Products consolidated into variants
        for group in groups:
            for product in group.products:
                rows.append({
                    "ID": product.id,
                    "SKU": product.sku,
                    "Name": product.name,
                    "Type": product.type,
                    "Action": "DELETE",
                    "Reason": f"Consolidated into '{group.base_name}' as variant",
                    "New Parent SKU": self._generate_parent_sku(group),
                })
        
        # Grouped products merged
        if merge_result:
            for product in merge_result.products_to_delete:
                rows.append({
                    "ID": product.id,
                    "SKU": product.sku,
                    "Name": product.name,
                    "Type": product.type,
                    "Action": "DELETE",
                    "Reason": "Grouped product merged into variable",
                    "New Parent SKU": "",
                })
        
        output_path = self.config.output_dir / output_filename
        
        # Write simple CSV
        if rows:
            with open(output_path, 'w', encoding='utf-8', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=rows[0].keys())
                writer.writeheader()
                writer.writerows(rows)
        
        return output_path, len(rows)
    
    def generate_sku_map(
        self,
        groups: List[ConsolidationGroup],
        output_filename: str = "sku_map.json",
    ) -> Path:
        """Generate JSON mapping old SKUs to new parent SKUs."""
        import json
        
        sku_map = {}
        for group in groups:
            parent_sku = self._generate_parent_sku(group)
            for product in group.products:
                if product.sku:
                    sku_map[product.sku] = {
                        "parent_sku": parent_sku,
                        "base_name": group.base_name,
                        "action": "consolidated_to_variation",
                    }
        
        output_path = self.config.output_dir / output_filename
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(sku_map, f, indent=2)
        
        return output_path
    
    def _create_parent_row(self, group: ConsolidationGroup) -> Dict:
        """Create the parent (variable) product row."""
        # Use first product as template for shared data
        template = group.products[0] if group.products else None
        
        # Generate parent SKU
        parent_sku = self._generate_parent_sku(group)
        
        # Collect all variant values for attribute
        all_values = sorted(set(group.variant_values))
        
        # Get best description from variants
        best_description = ""
        best_short = ""
        best_image = ""
        categories = ""
        brands = ""
        
        for product in group.products:
            if product.description and len(product.description) > len(best_description):
                best_description = product.description
            if product.short_description and len(product.short_description) > len(best_short):
                best_short = product.short_description
            if product.images and not best_image:
                best_image = product.images
            if product.categories and not categories:
                categories = product.categories
            if product.brands and not brands:
                brands = product.brands
        
        return {
            "ID": "",  # New product, leave blank
            "Type": "variable",
            "SKU": parent_sku,
            "Name": group.base_name,
            "Published": self.config.default_published,
            "Is featured?": "0",
            "Visibility in catalog": "visible",  # Must be: visible, catalog, search, hidden
            "Short description": best_short,
            "Description": best_description,
            "Date sale price starts": "",
            "Date sale price ends": "",
            "Tax status": self.config.default_tax_status,
            "Tax class": "",
            "In stock?": "1",
            "Stock": "",
            "Low stock amount": "",
            "Backorders allowed?": "0",
            "Sold individually?": "0",
            "Weight (lbs)": "",
            "Length (in)": "",
            "Width (in)": "",
            "Height (in)": "",
            "Allow customer reviews?": "1",
            "Purchase note": "",
            "Sale price": "",
            "Regular price": "",  # No price on parent, prices on variations
            "Categories": categories,
            "Tags": "",
            "Shipping class": "",
            "Images": best_image,
            "Download limit": "",
            "Download expiry days": "",
            "Parent": "",
            "Grouped products": "",
            "Upsells": "",
            "Cross-sells": "",
            "External URL": "",
            "Button text": "",
            "Position": "0",
            "Brands": brands,
            "Attribute 1 name": group.option_name,
            "Attribute 1 value(s)": " | ".join(all_values),
            "Attribute 1 visible": "1",
            "Attribute 1 global": "1",
        }
    
    def _create_variation_row(
        self,
        parent_sku: str,
        original_product: ProductRecord,
        variant_value: str,
        option_name: str,
        position: int,
    ) -> Dict:
        """Create a variation row."""
        return {
            "ID": "",  # New variation
            "Type": "variation",
            "SKU": original_product.sku,  # Preserve original SKU
            "Name": "",  # Variations inherit parent name
            "Published": "1",
            "Is featured?": "",
            "Visibility in catalog": "",  # Variations don't need visibility
            "Short description": "",
            "Description": original_product.description,
            "Date sale price starts": "",
            "Date sale price ends": "",
            "Tax status": self.config.default_tax_status,
            "Tax class": "",
            "In stock?": original_product.stock_status,
            "Stock": original_product.stock,
            "Low stock amount": "",
            "Backorders allowed?": "0",
            "Sold individually?": "",
            "Weight (lbs)": original_product.raw.get("Weight (lbs)", ""),
            "Length (in)": original_product.raw.get("Length (in)", ""),
            "Width (in)": original_product.raw.get("Width (in)", ""),
            "Height (in)": original_product.raw.get("Height (in)", ""),
            "Allow customer reviews?": "",
            "Purchase note": "",
            "Sale price": original_product.sale_price,
            "Regular price": original_product.regular_price,
            "Categories": "",  # Inherited from parent
            "Tags": "",
            "Shipping class": original_product.raw.get("Shipping class", ""),
            "Images": original_product.images,
            "Download limit": "",
            "Download expiry days": "",
            "Parent": parent_sku,
            "Grouped products": "",
            "Upsells": "",
            "Cross-sells": "",
            "External URL": "",
            "Button text": "",
            "Position": str(position),
            "Brands": "",  # Inherited from parent
            "Attribute 1 name": option_name,
            "Attribute 1 value(s)": variant_value,
            "Attribute 1 visible": "",
            "Attribute 1 global": "1",
        }
    
    def _generate_parent_sku(self, group: ConsolidationGroup) -> str:
        """Generate unique SKU for parent variable product."""
        import re
        import hashlib
        
        # Generate slug from product name
        slug = re.sub(r'[^a-zA-Z0-9]+', '-', group.base_name.lower())
        slug = slug.strip('-')[:25]
        
        # Create short hash from name for uniqueness
        name_hash = hashlib.md5(group.base_name.encode()).hexdigest()[:4].upper()
        
        # Try to use first product's SKU prefix if meaningful
        if group.products and group.products[0].sku:
            base_sku = group.products[0].sku
            # Strip numeric suffix
            stripped = re.sub(r'[-_]?\d+$', '', base_sku)
            # Only use if it's meaningful (more than 3 chars, not just 'hmh')
            if len(stripped) > 5 and stripped.lower() not in ['hmh', 'hmh0', 'hmh00']:
                return f"{stripped}-VAR"
        
        # Generate from name with hash for uniqueness
        return f"HMH-{slug.upper()}-{name_hash}"
    
    def _write_csv(self, path: Path, rows: List[Dict]):
        """Write rows to CSV file."""
        if not rows:
            return
        
        with open(path, 'w', encoding='utf-8', newline='') as f:
            # Use WOOCOMMERCE_COLUMNS for consistent ordering
            fieldnames = WOOCOMMERCE_COLUMNS
            
            # Add any extra columns from rows
            for row in rows:
                for key in row.keys():
                    if key not in fieldnames:
                        fieldnames.append(key)
            
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(rows)
