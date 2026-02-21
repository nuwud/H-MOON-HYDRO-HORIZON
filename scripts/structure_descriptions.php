<?php
/**
 * structure_descriptions.php — Convert plain text descriptions to structured HTML
 * 
 * Transforms plain text descriptions into professional format:
 * - Extract key features as bullet points
 * - Add brand header
 * - Format NPK ratios, sizes, weights
 * - Add structured sections (Overview | Features | Usage)
 * - Clean up HTML entities
 * 
 * Usage:
 *   wp eval-file wp-content/structure_descriptions.php          # DRY RUN
 *   CONFIRM=1 wp eval-file wp-content/structure_descriptions.php # LIVE
 */

wp_set_current_user(1);
global $wpdb;

$dry_run = !getenv('CONFIRM');
$updated = 0;
$skipped = 0;
$already_good = 0;

echo "==============================================\n";
echo "  DESCRIPTION STRUCTURING ENGINE\n";
echo "  Mode: " . ($dry_run ? "DRY RUN" : "*** LIVE ***") . "\n";
echo "==============================================\n\n";

// ============================================================
// Get all products with descriptions
// ============================================================
$products = $wpdb->get_results("
    SELECT p.ID, p.post_title, p.post_content, p.post_excerpt
    FROM {$wpdb->posts} p
    WHERE p.post_type = 'product' AND p.post_status = 'publish'
    AND p.post_content != '' AND p.post_content IS NOT NULL
    ORDER BY p.post_title
");

echo "Products with descriptions: " . count($products) . "\n\n";

foreach ($products as $product) {
    $desc = $product->post_content;
    $title = $product->post_title;
    
    // Skip if already has HTML structure (h2, h3, ul tags)
    if (preg_match('/<(h[2-4]|ul|ol|table)\b/i', $desc)) {
        $already_good++;
        continue;
    }
    
    // Skip very short descriptions (under 20 chars)
    if (strlen(strip_tags($desc)) < 20) {
        $skipped++;
        continue;
    }
    
    // Get brand
    $brands = wp_get_object_terms($product->ID, 'pa_brand', ['fields' => 'names']);
    $brand = (!is_wp_error($brands) && !empty($brands)) ? $brands[0] : '';
    
    // ============================================================
    // Structure the description
    // ============================================================
    $structured = structure_description($desc, $title, $brand);
    
    if ($structured === $desc) {
        $skipped++;
        continue;
    }
    
    if (!$dry_run) {
        $wpdb->update($wpdb->posts, ['post_content' => $structured], ['ID' => $product->ID]);
        
        // Also update short description if it's empty or plain text
        $excerpt = $product->post_excerpt;
        if (empty($excerpt) || strlen(strip_tags($excerpt)) < 10) {
            // Generate a short description from the first meaningful sentence
            $short = generate_short_description($desc, $title, $brand);
            if ($short) {
                $wpdb->update($wpdb->posts, ['post_excerpt' => $short], ['ID' => $product->ID]);
            }
        }
    }
    
    $updated++;
    if ($updated <= 5) {
        echo "--- Example #$updated: $title ---\n";
        echo "BEFORE: " . substr(strip_tags($desc), 0, 100) . "...\n";
        echo "AFTER:  " . substr(strip_tags($structured), 0, 100) . "...\n\n";
    }
}

echo "==============================================\n";
echo "  SUMMARY\n";
echo "==============================================\n";
echo "Already structured (HTML): $already_good\n";
echo "Updated:                   $updated\n";
echo "Skipped (too short):       $skipped\n";
echo "Mode: " . ($dry_run ? "DRY RUN" : "LIVE") . "\n";
echo "==============================================\n";

// ============================================================
// FUNCTIONS
// ============================================================

function structure_description($desc, $title, $brand) {
    // Clean up common HTML entities
    $text = html_entity_decode($desc, ENT_QUOTES, 'UTF-8');
    $text = str_replace(['<br>', '<br/>', '<br />', "\r"], "\n", $text);
    $text = strip_tags($text, '<strong><em><b><i><a>');
    $text = trim($text);
    
    // Split into sentences/lines
    $lines = preg_split('/[\n]+/', $text);
    $lines = array_map('trim', $lines);
    $lines = array_filter($lines, function($l) { return strlen($l) > 2; });
    $lines = array_values($lines);
    
    if (count($lines) < 1) return $desc;
    
    // Detect patterns
    $features = [];
    $overview_lines = [];
    $npk_info = '';
    $sizes = [];
    
    foreach ($lines as $line) {
        // Check for NPK ratio
        if (preg_match('/\b\d+\s*[-–]\s*\d+\s*[-–]\s*\d+\b/', $line)) {
            $npk_info = $line;
            continue;
        }
        
        // Check for feature-like lines (starts with dash, bullet, or is short and descriptive)
        if (preg_match('/^[\-\*•·]\s*/', $line)) {
            $clean = preg_replace('/^[\-\*•·]\s*/', '', $line);
            $features[] = $clean;
            continue;
        }
        
        // Check for size/volume mentions as potential features
        if (preg_match('/\b(available in|comes in|sizes?:|volumes?:)/i', $line)) {
            $features[] = $line;
            continue;
        }
        
        // Short lines (under 100 chars) that describe a benefit are likely features
        if (strlen($line) < 100 && preg_match('/(increase|enhance|promote|improve|boost|stimulate|protect|strengthen|prevent|support|maximize|optimize)/i', $line)) {
            $features[] = $line;
            continue;
        }
        
        // Everything else goes to overview
        $overview_lines[] = $line;
    }
    
    // If no features were extracted AND description is multi-sentence, try to extract from overview
    if (empty($features) && count($overview_lines) > 2) {
        $remaining_overview = [];
        foreach ($overview_lines as $line) {
            // Sentences that mention specific benefits → features
            if (strlen($line) < 150 && preg_match('/(help|aid|provide|contain|formulated|designed|ideal|perfect|great for|use during|apply|mix|essential)/i', $line)) {
                $features[] = $line;
            } else {
                $remaining_overview[] = $line;
            }
        }
        if (!empty($remaining_overview)) {
            $overview_lines = $remaining_overview;
        }
    }
    
    // Build structured HTML
    $html = '';
    
    // Overview section
    if (!empty($overview_lines)) {
        $overview_text = implode(' ', $overview_lines);
        // Break into paragraphs at logical points
        $paragraphs = preg_split('/(?<=[.!?])\s+(?=[A-Z])/', $overview_text, 3);
        
        $html .= "<h3>Overview</h3>\n";
        foreach ($paragraphs as $p) {
            $p = trim($p);
            if (strlen($p) > 10) {
                $html .= "<p>$p</p>\n";
            }
        }
    }
    
    // NPK info
    if ($npk_info) {
        $html .= "<p><strong>NPK:</strong> $npk_info</p>\n";
    }
    
    // Features section
    if (!empty($features)) {
        $html .= "<h3>Key Features</h3>\n<ul>\n";
        foreach ($features as $f) {
            $f = trim($f, ' .');
            if (strlen($f) > 3) {
                // Capitalize first letter
                $f = ucfirst($f);
                $html .= "<li>$f</li>\n";
            }
        }
        $html .= "</ul>\n";
    }
    
    // If we couldn't extract any structure, add minimal formatting
    if (empty($html)) {
        $html = "<p>" . implode("</p>\n<p>", $overview_lines) . "</p>";
    }
    
    return $html;
}

function generate_short_description($desc, $title, $brand) {
    $text = strip_tags(html_entity_decode($desc, ENT_QUOTES, 'UTF-8'));
    $text = trim(preg_replace('/\s+/', ' ', $text));
    
    if (strlen($text) < 20) return '';
    
    // Take first sentence or first 150 chars
    $first_sentence = preg_split('/(?<=[.!?])\s/', $text, 2);
    $short = $first_sentence[0];
    
    // If first sentence is too long, truncate
    if (strlen($short) > 200) {
        $short = substr($short, 0, 197) . '...';
    }
    
    // If first sentence is too short and there's more, add second
    if (strlen($short) < 50 && isset($first_sentence[1])) {
        $second = preg_split('/(?<=[.!?])\s/', $first_sentence[1], 2);
        $short .= ' ' . $second[0];
    }
    
    // Prepend brand if not already in text
    if ($brand && stripos($short, $brand) === false) {
        $short = "$brand — $short";
    }
    
    return $short;
}
