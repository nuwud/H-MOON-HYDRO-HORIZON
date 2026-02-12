"""
Pattern Matching Engine for Product Consolidation

Identifies products that should be variants of the same parent product
based on name similarity and size/dimension patterns.
"""

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Set


@dataclass
class ConsolidationPattern:
    """A pattern for identifying variant relationships."""
    name: str
    regex: str
    option_name: str  # WooCommerce attribute name (e.g., "Size", "CFM")
    value_formatter: Optional[str] = None  # Format string for variant value
    priority: int = 100  # Higher = checked first
    
    def __post_init__(self):
        self._compiled = re.compile(self.regex, re.IGNORECASE)
    
    def match(self, product_name: str) -> Optional[Tuple[str, str]]:
        """
        Match product name against this pattern.
        Returns (base_name, variant_value) or None if no match.
        """
        m = self._compiled.match(product_name.strip())
        if m:
            base = m.group(1).strip()
            variant = m.group(2).strip() if len(m.groups()) > 1 else "Default"
            
            # Apply value formatter if specified
            if self.value_formatter and variant:
                variant = self._format_value(variant)
            
            return (base, variant)
        return None
    
    def _format_value(self, value: str) -> str:
        """Format variant value according to pattern rules."""
        value = value.strip()
        
        # Normalize common abbreviations
        normalizations = {
            r'\bgal\b': 'Gallon',
            r'\bqt\b': 'Quart',
            r'\boz\b': 'oz',
            r'\bml\b': 'ml',
            r'\blb\b': 'lb',
            r'\blbs\b': 'lbs',
            r'\bin\b': 'inch',
            r'\bcfm\b': 'CFM',
            r'\bgph\b': 'GPH',
            r'\brpm\b': 'RPM',
            r'\bw\b': 'W',
        }
        
        for pattern, replacement in normalizations.items():
            value = re.sub(pattern, replacement, value, flags=re.IGNORECASE)
        
        # Format dimensions: 4x4x4 -> 4" × 4" × 4"
        dim_match = re.match(r'^(\d+)x(\d+)x(\d+)$', value, re.IGNORECASE)
        if dim_match:
            d1, d2, d3 = dim_match.groups()
            return f'{d1}" × {d2}" × {d3}"'
        
        # Format 2D dimensions: 4x8 -> 4" × 8"
        dim2_match = re.match(r'^(\d+)x(\d+)$', value, re.IGNORECASE)
        if dim2_match:
            d1, d2 = dim2_match.groups()
            return f'{d1}" × {d2}"'
        
        return value


# ============================================================================
# CONSOLIDATION PATTERNS - Ordered by priority (highest first)
# ============================================================================

CONSOLIDATION_PATTERNS: List[ConsolidationPattern] = [
    # Dimension pattern: Y-Connector 4x4x4 -> Y-Connector (Size: 4" × 4" × 4")
    ConsolidationPattern(
        name="dimension_3d",
        regex=r'^(.+?)\s+(\d+x\d+x\d+)\s*$',
        option_name="Size",
        value_formatter="dimension",
        priority=200,
    ),
    
    # Dimension pattern with prefix: 10 in. x 25 ft flexible duct
    ConsolidationPattern(
        name="dimension_prefix",
        regex=r'^(\d+)\s*(?:in\.?|inch)\s*[x×]\s*(\d+)\s*(?:ft\.?|foot)\s+(.+)$',
        option_name="Size",
        value_formatter="dimension",
        priority=195,
    ),
    
    # Volume with unit: FloraBlend 2.5 gal, Flora Micro 1 qt
    ConsolidationPattern(
        name="volume_suffix",
        regex=r'^(.+?)\s+(\d+(?:\.\d+)?)\s*(gal|gallon|qt|quart|oz|ml|l|lt|liter|litre)\s*$',
        option_name="Size",
        value_formatter="volume",
        priority=180,
    ),
    
    # Parenthetical size: Big Bud (1 gal), Flora Series (16 oz)
    ConsolidationPattern(
        name="parenthetical",
        regex=r'^(.+?)\s+\(([^)]+)\)\s*$',
        option_name="Size",
        value_formatter="general",
        priority=170,
    ),
    
    # CFM rating: Can-Fan 10" High Output 1023 CFM
    ConsolidationPattern(
        name="cfm_rating",
        regex=r'^(.+?)\s+(\d+)\s*(?:cfm)\s*$',
        option_name="CFM",
        value_formatter="cfm",
        priority=160,
    ),
    
    # GPH rating: EcoPlus 185 GPH
    ConsolidationPattern(
        name="gph_rating",
        regex=r'^(.+?)\s+(\d+)\s*(?:gph)\s*$',
        option_name="GPH",
        value_formatter="gph",
        priority=155,
    ),
    
    # Wattage: Plantmax 600W, 1000W HPS
    ConsolidationPattern(
        name="wattage",
        regex=r'^(.+?)\s+(\d+)\s*[wW]\.?\s*(.*)$',
        option_name="Wattage",
        value_formatter="wattage",
        priority=150,
    ),
    
    # Trailing number with unit: Worm Gear Clamp 4, Classic 2000
    ConsolidationPattern(
        name="trailing_number",
        regex=r'^(.+?)\s+(\d+(?:\.\d+)?)\s*$',
        option_name="Size",
        value_formatter="number",
        priority=100,
    ),
    
    # Weight suffix: Koolbloom 2.2 lb, Myco Madness 8 oz
    ConsolidationPattern(
        name="weight_suffix",
        regex=r'^(.+?)\s+(\d+(?:\.\d+)?)\s*(lb|lbs|pound|g|gram|kg|kilogram|oz)\s*$',
        option_name="Size",
        value_formatter="weight",
        priority=140,
    ),
    
    # Inch prefix: 10 in. Backdraft Damper, 6 in. hose clamps
    ConsolidationPattern(
        name="inch_prefix",
        regex=r'^(\d+)\s*(?:in\.?|inch|\")\s+(.+)$',
        option_name="Size",
        value_formatter="inch_prefix",
        priority=130,
    ),
]


@dataclass
class MatchResult:
    """Result of matching a product against consolidation patterns."""
    product_name: str
    product_id: str
    sku: str
    base_name: str
    variant_value: str
    option_name: str
    pattern_name: str
    confidence: float = 1.0


class PatternMatcher:
    """
    Matches products against consolidation patterns to identify variant groups.
    """
    
    def __init__(self, patterns: Optional[List[ConsolidationPattern]] = None):
        self.patterns = sorted(
            patterns or CONSOLIDATION_PATTERNS,
            key=lambda p: -p.priority
        )
        self._base_name_cache: Dict[str, str] = {}
    
    def match_product(self, name: str, product_id: str = "", sku: str = "") -> Optional[MatchResult]:
        """
        Match a single product against all patterns.
        Returns MatchResult if a pattern matches, None otherwise.
        """
        for pattern in self.patterns:
            result = pattern.match(name)
            if result:
                base_name, variant_value = result
                # Skip if base name is too short or variant is empty
                if len(base_name) < 3:
                    continue
                    
                return MatchResult(
                    product_name=name,
                    product_id=product_id,
                    sku=sku,
                    base_name=self._normalize_base_name(base_name),
                    variant_value=variant_value,
                    option_name=pattern.option_name,
                    pattern_name=pattern.name,
                )
        return None
    
    def _normalize_base_name(self, name: str) -> str:
        """Normalize base name for grouping."""
        if name in self._base_name_cache:
            return self._base_name_cache[name]
        
        normalized = name.strip()
        # Remove trailing dashes/spaces
        normalized = re.sub(r'[\s\-]+$', '', normalized)
        # Collapse multiple spaces
        normalized = re.sub(r'\s+', ' ', normalized)
        
        self._base_name_cache[name] = normalized
        return normalized
    
    def find_variant_groups(
        self, 
        products: List[Dict], 
        name_field: str = "Name",
        id_field: str = "ID",
        sku_field: str = "SKU",
        min_group_size: int = 2,
    ) -> Dict[str, List[MatchResult]]:
        """
        Find all variant groups in a list of products.
        
        Args:
            products: List of product dicts from CSV
            name_field: Field name containing product name
            id_field: Field name containing product ID
            sku_field: Field name containing SKU
            min_group_size: Minimum variants to form a group
            
        Returns:
            Dict mapping base_name -> list of MatchResults
        """
        groups: Dict[str, List[MatchResult]] = {}
        
        for product in products:
            name = product.get(name_field, "")
            if not name:
                continue
                
            match = self.match_product(
                name=name,
                product_id=str(product.get(id_field, "")),
                sku=str(product.get(sku_field, "")),
            )
            
            if match:
                key = match.base_name.lower()
                if key not in groups:
                    groups[key] = []
                groups[key].append(match)
        
        # Filter to groups with minimum size
        return {
            k: v for k, v in groups.items() 
            if len(v) >= min_group_size
        }


# ============================================================================
# PRIORITY PRODUCT GROUPS (worst offenders to consolidate first)
# ============================================================================

PRIORITY_GROUPS: List[str] = [
    "y-connector",
    "worm gear clamp",
    "can-fan",
    "can filter",
    "pre-filter for model pro",
    "backdraft damper",
    "classic",
    "uno-2 speed",
    "holland secret micro",
    "holland secret grow", 
    "holland secret bloom",
    "scietetics magcal",
    "scietetics ful v tech",
    "ecoplus",
    "plantmax hps",
    "plantmax mh",
    "floraduo a",
    "floraduo b",
    "floranova grow",
    "floranova bloom",
]


def is_priority_group(base_name: str) -> bool:
    """Check if a base name matches a priority consolidation group."""
    base_lower = base_name.lower()
    return any(pg in base_lower for pg in PRIORITY_GROUPS)
