"""
CSV Analyzer for WooCommerce Product Consolidation

Analyzes WooCommerce product exports to identify consolidation opportunities.
"""

import csv
import json
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from .patterns import PatternMatcher, MatchResult, is_priority_group


@dataclass
class ProductRecord:
    """A WooCommerce product record."""
    id: str
    type: str  # simple, variable, variation, grouped
    sku: str
    name: str
    regular_price: str
    sale_price: str
    stock_status: str
    stock: str
    categories: str
    images: str
    description: str
    short_description: str
    parent: str  # Parent SKU for variations
    grouped_products: str  # For grouped products
    brands: str
    attribute_1_name: str
    attribute_1_values: str
    raw: Dict = field(default_factory=dict)
    
    @classmethod
    def from_csv_row(cls, row: Dict) -> "ProductRecord":
        """Create ProductRecord from CSV row dict."""
        return cls(
            id=row.get("ID", ""),
            type=row.get("Type", "simple"),
            sku=row.get("SKU", ""),
            name=row.get("Name", ""),
            regular_price=row.get("Regular price", ""),
            sale_price=row.get("Sale price", ""),
            stock_status=row.get("In stock?", "1"),
            stock=row.get("Stock", ""),
            categories=row.get("Categories", ""),
            images=row.get("Images", ""),
            description=row.get("Description", ""),
            short_description=row.get("Short description", ""),
            parent=row.get("Parent", ""),
            grouped_products=row.get("Grouped products", ""),
            brands=row.get("Brands", row.get("Brand", "")),
            attribute_1_name=row.get("Attribute 1 name", ""),
            attribute_1_values=row.get("Attribute 1 value(s)", ""),
            raw=row,
        )


@dataclass
class ConsolidationGroup:
    """A group of products that should be consolidated into one variable product."""
    base_name: str
    option_name: str
    pattern_name: str
    products: List[ProductRecord] = field(default_factory=list)
    variant_values: List[str] = field(default_factory=list)
    is_priority: bool = False
    
    @property
    def product_count(self) -> int:
        return len(self.products)
    
    @property
    def sku_list(self) -> List[str]:
        return [p.sku for p in self.products if p.sku]
    
    @property
    def id_list(self) -> List[str]:
        return [p.id for p in self.products if p.id]


@dataclass
class GroupedVariableDuplicate:
    """A case where both grouped and variable products exist for same base."""
    grouped_product: ProductRecord
    variable_products: List[ProductRecord]
    base_name: str


@dataclass 
class AnalysisResult:
    """Complete analysis result for a WooCommerce export."""
    total_products: int
    simple_count: int
    variable_count: int
    variation_count: int
    grouped_count: int
    
    # Consolidation opportunities
    consolidation_groups: List[ConsolidationGroup]
    priority_groups: List[ConsolidationGroup]
    
    # Duplicates to merge
    grouped_variable_duplicates: List[GroupedVariableDuplicate]
    
    # Category issues
    category_issues: List[Tuple[str, str, str]]  # (product_name, current_cat, suggested_cat)
    
    # All products indexed by type
    products_by_type: Dict[str, List[ProductRecord]]
    
    # All products indexed by SKU
    products_by_sku: Dict[str, ProductRecord]


class ProductAnalyzer:
    """
    Analyzes WooCommerce product exports for consolidation opportunities.
    """
    
    def __init__(self, matcher: Optional[PatternMatcher] = None):
        self.matcher = matcher or PatternMatcher()
        self.products: List[ProductRecord] = []
        self.products_by_sku: Dict[str, ProductRecord] = {}
        self.products_by_name: Dict[str, List[ProductRecord]] = defaultdict(list)
        self.products_by_type: Dict[str, List[ProductRecord]] = defaultdict(list)
    
    def load_csv(self, filepath: str) -> int:
        """
        Load products from WooCommerce CSV export.
        
        Returns number of products loaded.
        """
        self.products = []
        self.products_by_sku = {}
        self.products_by_name = defaultdict(list)
        self.products_by_type = defaultdict(list)
        
        with open(filepath, 'r', encoding='utf-8-sig', newline='') as f:
            reader = csv.DictReader(f)
            for row in reader:
                product = ProductRecord.from_csv_row(row)
                self.products.append(product)
                
                if product.sku:
                    self.products_by_sku[product.sku] = product
                
                if product.name:
                    self.products_by_name[product.name.lower()].append(product)
                
                self.products_by_type[product.type].append(product)
        
        return len(self.products)
    
    def analyze(self) -> AnalysisResult:
        """
        Perform complete analysis of loaded products.
        """
        # Count by type
        simple_count = len(self.products_by_type.get("simple", []))
        variable_count = len(self.products_by_type.get("variable", []))
        variation_count = len(self.products_by_type.get("variation", []))
        grouped_count = len(self.products_by_type.get("grouped", []))
        
        # Find consolidation groups from simple products
        consolidation_groups = self._find_consolidation_groups()
        priority_groups = [g for g in consolidation_groups if g.is_priority]
        
        # Find grouped/variable duplicates
        grouped_variable_duplicates = self._find_grouped_variable_duplicates()
        
        # Find category issues
        category_issues = self._find_category_issues()
        
        return AnalysisResult(
            total_products=len(self.products),
            simple_count=simple_count,
            variable_count=variable_count,
            variation_count=variation_count,
            grouped_count=grouped_count,
            consolidation_groups=consolidation_groups,
            priority_groups=priority_groups,
            grouped_variable_duplicates=grouped_variable_duplicates,
            category_issues=category_issues,
            products_by_type=dict(self.products_by_type),
            products_by_sku=self.products_by_sku,
        )
    
    def _find_consolidation_groups(self) -> List[ConsolidationGroup]:
        """Find simple products that should be consolidated into variable products."""
        # Only consider simple products for consolidation
        simple_products = self.products_by_type.get("simple", [])
        
        # Convert to dict format for pattern matcher
        product_dicts = [
            {"Name": p.name, "ID": p.id, "SKU": p.sku}
            for p in simple_products
        ]
        
        # Find groups using pattern matcher
        raw_groups = self.matcher.find_variant_groups(
            product_dicts,
            min_group_size=2,
        )
        
        # Convert to ConsolidationGroup objects
        groups = []
        for base_name, matches in raw_groups.items():
            # Get corresponding ProductRecords
            products = []
            variant_values = []
            
            for match in matches:
                if match.sku and match.sku in self.products_by_sku:
                    products.append(self.products_by_sku[match.sku])
                    variant_values.append(match.variant_value)
                elif match.product_id:
                    # Find by ID
                    for p in simple_products:
                        if p.id == match.product_id:
                            products.append(p)
                            variant_values.append(match.variant_value)
                            break
            
            if len(products) >= 2:
                groups.append(ConsolidationGroup(
                    base_name=matches[0].base_name,
                    option_name=matches[0].option_name,
                    pattern_name=matches[0].pattern_name,
                    products=products,
                    variant_values=variant_values,
                    is_priority=is_priority_group(matches[0].base_name),
                ))
        
        # Sort: priority groups first, then by size
        groups.sort(key=lambda g: (-int(g.is_priority), -g.product_count))
        
        return groups
    
    def _find_grouped_variable_duplicates(self) -> List[GroupedVariableDuplicate]:
        """Find cases where grouped and variable products exist for same base name."""
        duplicates = []
        
        grouped_products = self.products_by_type.get("grouped", [])
        variable_products = self.products_by_type.get("variable", [])
        
        for grouped in grouped_products:
            # Normalize name for comparison
            grouped_base = self._normalize_for_comparison(grouped.name)
            
            matching_variables = []
            for variable in variable_products:
                variable_base = self._normalize_for_comparison(variable.name)
                
                # Check if names are similar enough
                if self._names_match(grouped_base, variable_base):
                    matching_variables.append(variable)
            
            if matching_variables:
                duplicates.append(GroupedVariableDuplicate(
                    grouped_product=grouped,
                    variable_products=matching_variables,
                    base_name=grouped.name,
                ))
        
        return duplicates
    
    def _normalize_for_comparison(self, name: str) -> str:
        """Normalize product name for comparison."""
        import re
        name = name.lower().strip()
        # Remove common suffixes
        name = re.sub(r'\s*\d+(\.\d+)?\s*(gal|gallon|qt|quart|oz|ml|l|lt)\.?\s*$', '', name)
        name = re.sub(r'\s*\([^)]*\)\s*$', '', name)
        name = re.sub(r'\s+', ' ', name)
        return name.strip()
    
    def _names_match(self, name1: str, name2: str) -> bool:
        """Check if two normalized names match."""
        if name1 == name2:
            return True
        # One is prefix of other
        if name1.startswith(name2) or name2.startswith(name1):
            return True
        return False
    
    def _find_category_issues(self) -> List[Tuple[str, str, str]]:
        """Find products that appear to be miscategorized."""
        issues = []
        
        # Book keywords that shouldn't be in grow_media
        book_keywords = [
            "gardening indoors", "teaming with", "handbook", "guide",
            "book", "mushroom", "psilocybin", "grubbycup",
        ]
        
        for product in self.products:
            categories_lower = product.categories.lower()
            name_lower = product.name.lower()
            
            # Books miscategorized
            if any(kw in name_lower for kw in book_keywords):
                if "book" not in categories_lower and categories_lower:
                    issues.append((
                        product.name,
                        product.categories,
                        "Books",
                    ))
        
        return issues
    
    def get_priority_simple_groups(self, limit: int = 20) -> List[ConsolidationGroup]:
        """Get top priority consolidation groups."""
        result = self.analyze()
        return result.priority_groups[:limit]
    
    def generate_report(self, result: AnalysisResult) -> str:
        """Generate human-readable analysis report."""
        lines = [
            "# WooCommerce Product Consolidation Analysis",
            "",
            "## Overview",
            "",
            f"- **Total Products**: {result.total_products:,}",
            f"- **Simple Products**: {result.simple_count:,}",
            f"- **Variable Products**: {result.variable_count:,}",
            f"- **Variations**: {result.variation_count:,}",
            f"- **Grouped Products**: {result.grouped_count:,}",
            "",
            "## Consolidation Opportunities",
            "",
            f"Found **{len(result.consolidation_groups)}** groups of simple products that should be variants.",
            f"**{len(result.priority_groups)}** are high-priority groups.",
            "",
            "### Priority Groups (Top 20)",
            "",
        ]
        
        for i, group in enumerate(result.priority_groups[:20], 1):
            lines.append(f"**{i}. {group.base_name}** ({group.product_count} variants)")
            lines.append(f"   - Option: {group.option_name}")
            lines.append(f"   - Values: {', '.join(group.variant_values[:5])}" + 
                        ("..." if len(group.variant_values) > 5 else ""))
            lines.append(f"   - SKUs: {', '.join(group.sku_list[:3])}" +
                        ("..." if len(group.sku_list) > 3 else ""))
            lines.append("")
        
        lines.extend([
            "## Grouped/Variable Duplicates",
            "",
            f"Found **{len(result.grouped_variable_duplicates)}** products that exist as both grouped AND variable.",
            "",
        ])
        
        for dup in result.grouped_variable_duplicates[:10]:
            lines.append(f"- **{dup.base_name}**")
            lines.append(f"  - Grouped: {dup.grouped_product.sku}")
            lines.append(f"  - Variable: {', '.join(v.sku for v in dup.variable_products)}")
            lines.append("")
        
        if result.category_issues:
            lines.extend([
                "## Category Issues",
                "",
                f"Found **{len(result.category_issues)}** products that may be miscategorized.",
                "",
            ])
            for name, current, suggested in result.category_issues[:10]:
                lines.append(f"- **{name}**")
                lines.append(f"  - Current: {current}")
                lines.append(f"  - Suggested: {suggested}")
                lines.append("")
        
        return "\n".join(lines)
