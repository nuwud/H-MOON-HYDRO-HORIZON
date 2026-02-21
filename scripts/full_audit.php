<?php
wp_set_current_user(1);
global $wpdb;

echo "======================================================================\n";
echo "H-MOON HYDRO COMPREHENSIVE SITE AUDIT - " . date('Y-m-d H:i') . "\n";
echo "======================================================================\n\n";

// === 1. SPRAY N GROW IMAGE MISUSE ===
echo "=== 1. SPRAY N GROW IMAGE AUDIT ===\n";
$spray_attachments = $wpdb->get_results("
    SELECT ID, guid, post_title FROM {$wpdb->posts} 
    WHERE post_type='attachment' AND (guid LIKE '%sprayNgrow%' OR guid LIKE '%spray-n-grow%' OR guid LIKE '%spray_n_grow%' OR post_title LIKE '%spray%grow%')
");
echo "Spray N Grow attachments found: " . count($spray_attachments) . "\n";
foreach ($spray_attachments as $att) {
    echo "  Attachment #{$att->ID}: {$att->guid}\n";
    $products_using = $wpdb->get_results($wpdb->prepare("
        SELECT p.ID, p.post_title FROM {$wpdb->posts} p
        INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
        WHERE pm.meta_key = '_thumbnail_id' AND pm.meta_value = %d
        AND p.post_type = 'product' AND p.post_status = 'publish'
    ", $att->ID));
    if ($products_using) {
        echo "  Products using this as thumbnail:\n";
        foreach ($products_using as $prod) {
            echo "    #{$prod->ID} {$prod->post_title}\n";
        }
    }
    $gallery_products = $wpdb->get_results($wpdb->prepare("
        SELECT p.ID, p.post_title FROM {$wpdb->posts} p
        INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
        WHERE pm.meta_key = '_product_image_gallery' AND pm.meta_value LIKE %s
        AND p.post_type = 'product' AND p.post_status = 'publish'
    ", '%' . $att->ID . '%'));
    if ($gallery_products) {
        echo "  Products with this in gallery:\n";
        foreach ($gallery_products as $prod) {
            echo "    #{$prod->ID} {$prod->post_title}\n";
        }
    }
}

// === 2. MOST REUSED IMAGES (potential misassignment) ===
echo "\n=== 2. MOST REUSED IMAGES (potential misassignment) ===\n";
$reused = $wpdb->get_results("
    SELECT pm.meta_value as thumb_id, COUNT(*) as cnt, 
           (SELECT guid FROM {$wpdb->posts} WHERE ID = pm.meta_value) as img_url
    FROM {$wpdb->postmeta} pm
    INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id 
    WHERE pm.meta_key = '_thumbnail_id' AND p.post_type = 'product' AND p.post_status = 'publish'
    AND pm.meta_value > 0
    GROUP BY pm.meta_value
    HAVING cnt > 3
    ORDER BY cnt DESC
    LIMIT 20
");
foreach ($reused as $r) {
    $img_basename = basename($r->img_url);
    echo "  {$r->cnt}x | Att#{$r->thumb_id} | {$img_basename}\n";
    $prods = $wpdb->get_results($wpdb->prepare("
        SELECT p.ID, p.post_title FROM {$wpdb->posts} p
        INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
        WHERE pm.meta_key = '_thumbnail_id' AND pm.meta_value = %d
        AND p.post_type = 'product' AND p.post_status = 'publish'
        LIMIT 10
    ", $r->thumb_id));
    foreach ($prods as $prod) {
        echo "      #{$prod->ID} {$prod->post_title}\n";
    }
}

// === 3. PRODUCTS WITHOUT THUMBNAIL ===
echo "\n=== 3. PRODUCTS WITHOUT THUMBNAIL ===\n";
$no_thumb = $wpdb->get_results("
    SELECT p.ID, p.post_title FROM {$wpdb->posts} p
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    AND NOT EXISTS (
        SELECT 1 FROM {$wpdb->postmeta} pm 
        WHERE pm.post_id = p.ID AND pm.meta_key = '_thumbnail_id' 
        AND pm.meta_value > 0 AND pm.meta_value != ''
    )
    ORDER BY p.post_title
");
echo "Count: " . count($no_thumb) . "\n";
foreach ($no_thumb as $p) {
    echo "  #{$p->ID} {$p->post_title}\n";
}

// === 4. CATEGORY STRUCTURE ===
echo "\n=== 4. CATEGORY STRUCTURE ===\n";
$cats = get_terms(array('taxonomy' => 'product_cat', 'hide_empty' => false, 'orderby' => 'name'));
echo "Total categories: " . count($cats) . "\n";
$top_level = array_filter($cats, function($c) { return $c->parent == 0; });
echo "Top-level: " . count($top_level) . "\n";
echo "\nTop-level categories (name | product count | subcategory count):\n";
foreach ($top_level as $cat) {
    $child_count = count(array_filter($cats, function($c) use ($cat) { return $c->parent == $cat->term_id; }));
    echo "  {$cat->name} ({$cat->count} products, {$child_count} subcats)\n";
    if ($child_count > 0) {
        $children = array_filter($cats, function($c) use ($cat) { return $c->parent == $cat->term_id; });
        foreach ($children as $child) {
            echo "    > {$child->name} ({$child->count})\n";
        }
    }
}

// === 5. BRAND/TAXONOMY AUDIT ===
echo "\n=== 5. BRAND/TAXONOMY AUDIT ===\n";
$brand_taxonomies = array('product_brand', 'pwb-brand', 'pa_brand');
foreach ($brand_taxonomies as $tax) {
    if (taxonomy_exists($tax)) {
        $brands = get_terms(array('taxonomy' => $tax, 'hide_empty' => false));
        if (!is_wp_error($brands)) {
            echo "Taxonomy '{$tax}': " . count($brands) . " terms\n";
            $tax_obj = get_taxonomy($tax);
            echo "  Public: " . ($tax_obj->public ? 'yes' : 'no') . "\n";
            echo "  Show in nav menus: " . ($tax_obj->show_in_nav_menus ? 'yes' : 'no') . "\n";
            $empty_brands = array_filter($brands, function($b) { return $b->count == 0; });
            echo "  Empty brands: " . count($empty_brands) . "\n";
            // Top 15 brands by product count
            usort($brands, function($a, $b) { return $b->count - $a->count; });
            echo "  Top 15 brands:\n";
            $shown = 0;
            foreach ($brands as $b) {
                if ($shown >= 15) break;
                echo "    {$b->name} ({$b->count})\n";
                $shown++;
            }
        }
    } else {
        echo "Taxonomy '{$tax}': NOT REGISTERED\n";
    }
}

$wc_brand_attr = $wpdb->get_row("SELECT * FROM {$wpdb->prefix}woocommerce_attribute_taxonomies WHERE attribute_name = 'brand'");
if ($wc_brand_attr) {
    echo "\nWC Attribute 'brand': ID={$wc_brand_attr->attribute_id}, type={$wc_brand_attr->attribute_type}, orderby={$wc_brand_attr->attribute_orderby}\n";
}

$active_plugins = get_option('active_plugins', array());
echo "\nActive plugins:\n";
foreach ($active_plugins as $p) {
    echo "  {$p}\n";
}

// === 6. CURRENT METRICS ===
echo "\n=== 6. CURRENT METRICS ===\n";
$total = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish'");
$grouped_count = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} p INNER JOIN {$wpdb->prefix}term_relationships tr ON p.ID = tr.object_id INNER JOIN {$wpdb->prefix}term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id INNER JOIN {$wpdb->prefix}terms t ON tt.term_id = t.term_id WHERE tt.taxonomy = 'product_type' AND t.slug = 'grouped' AND p.post_status = 'publish'");
$with_price = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id WHERE p.post_type='product' AND p.post_status='publish' AND pm.meta_key='_regular_price' AND pm.meta_value != '' AND CAST(pm.meta_value AS DECIMAL(10,2)) > 0");
$with_thumb = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id WHERE p.post_type='product' AND p.post_status='publish' AND pm.meta_key='_thumbnail_id' AND pm.meta_value > 0");
$with_desc = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish' AND post_content != '' AND LENGTH(post_content) > 20");
$with_short = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='product' AND post_status='publish' AND post_excerpt != '' AND LENGTH(post_excerpt) > 10");
$with_weight = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id WHERE p.post_type='product' AND p.post_status='publish' AND pm.meta_key='_weight' AND pm.meta_value != '' AND CAST(pm.meta_value AS DECIMAL(10,4)) > 0");
$with_dims = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id WHERE p.post_type='product' AND p.post_status='publish' AND pm.meta_key='_length' AND pm.meta_value != '' AND CAST(pm.meta_value AS DECIMAL(10,2)) > 0");
$with_gallery = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id WHERE p.post_type='product' AND p.post_status='publish' AND pm.meta_key='_product_image_gallery' AND pm.meta_value != ''");
$with_sku = $wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id WHERE p.post_type='product' AND p.post_status='publish' AND pm.meta_key='_sku' AND pm.meta_value != ''");

echo "Total: {$total} ({$grouped_count} grouped)\n";
$pct = function($n) use ($total) { return round(($n/$total)*100,1); };
echo "SKUs: {$with_sku} ({$pct($with_sku)}%)\n";
echo "Prices: {$with_price} ({$pct($with_price)}%)\n";
echo "Images: {$with_thumb} ({$pct($with_thumb)}%)\n";
echo "Gallery: {$with_gallery} ({$pct($with_gallery)}%)\n";
echo "Descriptions: {$with_desc} ({$pct($with_desc)}%)\n";
echo "Short desc: {$with_short} ({$pct($with_short)}%)\n";
echo "Weight: {$with_weight} ({$pct($with_weight)}%)\n";
echo "Dimensions: {$with_dims} ({$pct($with_dims)}%)\n";

// === 7. PLACEHOLDER IMAGE ===
echo "\n=== 7. PLACEHOLDER IMAGE ===\n";
$placeholder_id = get_option('woocommerce_placeholder_image');
if ($placeholder_id) {
    $placeholder_url = wp_get_attachment_url($placeholder_id);
    echo "Placeholder image ID: {$placeholder_id}\n";
    echo "URL: {$placeholder_url}\n";
} else {
    echo "No custom placeholder set (using default WooCommerce)\n";
}

// === 8. OLD SITE IMAGE ARCHIVE ===
echo "\n=== 8. OLD SITE IMAGE ARCHIVE ===\n";
$upload_years = array('2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026');
foreach ($upload_years as $year) {
    $dir = ABSPATH . "wp-content/uploads/{$year}";
    if (is_dir($dir)) {
        $count = 0;
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir));
        foreach ($iterator as $file) {
            if ($file->isFile() && preg_match('/\.(jpg|jpeg|png|webp|gif)$/i', $file->getFilename())) {
                $count++;
            }
        }
        echo "  {$year}: {$count} images\n";
    }
}

// === 9. PRODUCTS WITH WRONG IMAGE (image filename doesn't match product) ===
echo "\n=== 9. SAMPLE IMAGE MISMATCHES (image filename vs product title) ===\n";
$sample = $wpdb->get_results("
    SELECT p.ID, p.post_title, 
           (SELECT guid FROM {$wpdb->posts} WHERE ID = pm.meta_value) as img_url
    FROM {$wpdb->posts} p
    INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
    WHERE pm.meta_key = '_thumbnail_id' AND pm.meta_value > 0
    AND p.post_type = 'product' AND p.post_status = 'publish'
    ORDER BY p.post_title
");
$mismatches = 0;
foreach ($sample as $s) {
    if (!$s->img_url) continue;
    $img_name = strtolower(basename($s->img_url));
    $title_words = array_filter(explode(' ', strtolower($s->post_title)), function($w) {
        return strlen($w) > 3 && !in_array($w, array('the', 'and', 'for', 'with', 'from'));
    });
    $matched = false;
    foreach ($title_words as $word) {
        if (strpos($img_name, $word) !== false) {
            $matched = true;
            break;
        }
    }
    if (!$matched && $mismatches < 30) {
        echo "  #{$s->ID} \"{$s->post_title}\" => {$img_name}\n";
        $mismatches++;
    }
}
echo "Total potential mismatches found: {$mismatches}+ (showing first 30)\n";

// === 10. ACTIVE THEME AND BRAND DISPLAY ===
echo "\n=== 10. THEME & DISPLAY ===\n";
echo "Active theme: " . get_template() . " / " . get_stylesheet() . "\n";

// Check for brand display widgets
$sidebars = get_option('sidebars_widgets', array());
$brand_widgets = array();
foreach ($sidebars as $sidebar => $widgets) {
    if (is_array($widgets)) {
        foreach ($widgets as $widget) {
            if (stripos($widget, 'brand') !== false) {
                $brand_widgets[] = "{$sidebar}: {$widget}";
            }
        }
    }
}
echo "Brand widgets in sidebars: " . (empty($brand_widgets) ? 'NONE' : implode(', ', $brand_widgets)) . "\n";

// Check WooCommerce shop display settings
echo "Shop page display: " . get_option('woocommerce_shop_page_display', 'default') . "\n";
echo "Category display: " . get_option('woocommerce_category_archive_display', 'default') . "\n";
echo "Default sort: " . get_option('woocommerce_default_catalog_orderby', 'menu_order') . "\n";
