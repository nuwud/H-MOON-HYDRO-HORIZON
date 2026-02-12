"""
Grouped → Variable Product Merger

Merges WooCommerce grouped products with their variable counterparts,
preserving valuable data before deletion.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

from .analyzer import ProductRecord, GroupedVariableDuplicate


@dataclass
class MergeAction:
    """Describes a merge action to perform."""
    action: str  # "merge_into_variable", "delete_grouped", "convert_to_variable"
    grouped_product: ProductRecord
    target_variable: Optional[ProductRecord]
    data_to_preserve: Dict[str, str] = field(default_factory=dict)
    notes: str = ""


@dataclass
class MergeResult:
    """Result of merge analysis."""
    merge_actions: List[MergeAction]
    products_to_delete: List[ProductRecord]
    products_to_update: List[Tuple[ProductRecord, Dict[str, str]]]  # (product, updates)
    conversion_candidates: List[ProductRecord]  # Grouped with no variable match


class GroupedVariableMerger:
    """
    Handles merging grouped products into variable products.
    
    Strategy:
    1. For grouped products WITH a matching variable: merge data, delete grouped
    2. For grouped products WITHOUT a match: convert to variable (Phase 2)
    """
    
    def __init__(self):
        self.merge_actions: List[MergeAction] = []
    
    def analyze_duplicates(
        self, 
        duplicates: List[GroupedVariableDuplicate],
    ) -> MergeResult:
        """
        Analyze grouped/variable duplicates and determine merge strategy.
        """
        actions = []
        to_delete = []
        to_update = []
        
        for dup in duplicates:
            grouped = dup.grouped_product
            
            if dup.variable_products:
                # Merge into the first (best) matching variable
                target = self._select_best_variable(dup.variable_products)
                
                # Determine what data to preserve from grouped
                data_to_preserve = self._extract_valuable_data(grouped, target)
                
                actions.append(MergeAction(
                    action="merge_into_variable",
                    grouped_product=grouped,
                    target_variable=target,
                    data_to_preserve=data_to_preserve,
                    notes=f"Merge grouped '{grouped.name}' into variable '{target.name}'",
                ))
                
                # Mark grouped for deletion
                to_delete.append(grouped)
                
                # If there's data to merge, mark variable for update
                if data_to_preserve:
                    to_update.append((target, data_to_preserve))
        
        return MergeResult(
            merge_actions=actions,
            products_to_delete=to_delete,
            products_to_update=to_update,
            conversion_candidates=[],  # Handled in Phase 2
        )
    
    def _select_best_variable(self, variables: List[ProductRecord]) -> ProductRecord:
        """Select the best variable product to merge into."""
        if len(variables) == 1:
            return variables[0]
        
        # Prefer variable with:
        # 1. More complete description
        # 2. Has images
        # 3. Has attributes defined
        
        def score(v: ProductRecord) -> int:
            s = 0
            if v.description and len(v.description) > 100:
                s += 10
            if v.images:
                s += 5
            if v.attribute_1_name:
                s += 3
            if v.regular_price:
                s += 2
            return s
        
        return max(variables, key=score)
    
    def _extract_valuable_data(
        self, 
        grouped: ProductRecord, 
        variable: ProductRecord,
    ) -> Dict[str, str]:
        """Extract data from grouped that should be merged into variable."""
        data = {}
        
        # Preserve description if variable's is shorter
        if grouped.description:
            grouped_len = len(grouped.description)
            variable_len = len(variable.description) if variable.description else 0
            
            if grouped_len > variable_len + 100:  # Grouped has significantly more content
                data["description"] = grouped.description
        
        # Preserve short description if variable's is empty
        if grouped.short_description and not variable.short_description:
            data["short_description"] = grouped.short_description
        
        # Preserve images if variable has none
        if grouped.images and not variable.images:
            data["images"] = grouped.images
        
        # Preserve upsells/cross-sells (if in grouped_products field)
        if grouped.grouped_products:
            data["upsells"] = grouped.grouped_products
        
        return data
    
    def generate_delete_csv(self, products: List[ProductRecord]) -> List[Dict]:
        """
        Generate CSV rows for products to delete.
        
        WooCommerce doesn't have a direct delete via CSV, but we can:
        1. Set status to 'draft' or 'trash'
        2. Use WP-CLI or direct deletion
        """
        rows = []
        for product in products:
            rows.append({
                "ID": product.id,
                "SKU": product.sku,
                "Name": product.name,
                "Type": product.type,
                "Action": "DELETE",
                "Reason": "Merged into variable product",
            })
        return rows
    
    def generate_update_csv(
        self, 
        updates: List[Tuple[ProductRecord, Dict[str, str]]],
    ) -> List[Dict]:
        """Generate CSV rows for products to update with merged data."""
        rows = []
        for product, data in updates:
            row = {
                "ID": product.id,
                "SKU": product.sku,
                "Type": product.type,
            }
            row.update(data)
            rows.append(row)
        return rows
