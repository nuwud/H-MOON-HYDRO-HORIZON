<?php
/**
 * Create H-Moon Hydro branded placeholder image
 * Generates an SVG placeholder with branding, then sets it as WooCommerce placeholder.
 */
wp_set_current_user(1);
global $wpdb;

$dry_run = getenv('CONFIRM') !== '1';
echo $dry_run ? "=== DRY RUN MODE ===\n\n" : "=== LIVE MODE ===\n\n";

$upload_dir = wp_upload_dir();
$svg_path = $upload_dir['basedir'] . '/hmoon-placeholder.svg';
$png_path = $upload_dir['basedir'] . '/hmoon-placeholder.png';

// Create SVG placeholder
$svg_content = '<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="600" height="600" fill="url(#bg)" rx="8"/>
  
  <!-- Decorative border -->
  <rect x="15" y="15" width="570" height="570" fill="none" stroke="#0f3460" stroke-width="2" rx="6"/>
  
  <!-- Water drop icon -->
  <g transform="translate(300,200)">
    <path d="M0,-70 C30,-30 50,10 50,40 C50,68 28,90 0,90 C-28,90 -50,68 -50,40 C-50,10 -30,-30 0,-70Z" 
          fill="none" stroke="#53d1ef" stroke-width="3" opacity="0.8"/>
    <path d="M0,-50 C20,-20 35,5 35,28 C35,48 20,63 0,63 C-20,63 -35,48 -35,28 C-35,5 -20,-20 0,-50Z" 
          fill="#53d1ef" opacity="0.15"/>
    <!-- Leaf accent -->
    <path d="M-15,20 C-15,0 5,-15 25,-15 C25,-15 15,5 -5,15 C-5,15 -15,20 -15,20Z" 
          fill="#4ade80" opacity="0.6"/>
  </g>
  
  <!-- H-Moon Hydro text -->
  <text x="300" y="340" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="bold" 
        fill="#e2e8f0" text-anchor="middle" letter-spacing="3">H-MOON HYDRO</text>
  
  <!-- Tagline -->
  <text x="300" y="375" font-family="Arial, Helvetica, sans-serif" font-size="14" 
        fill="#94a3b8" text-anchor="middle" letter-spacing="2">HYDROPONICS SUPPLY</text>
  
  <!-- "Image Coming Soon" text -->
  <text x="300" y="430" font-family="Arial, Helvetica, sans-serif" font-size="18" 
        fill="#64748b" text-anchor="middle" font-style="italic">Image Coming Soon</text>
  
  <!-- Subtle grid pattern -->
  <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" stroke-width="0.5"/>
  </pattern>
  <rect width="600" height="600" fill="url(#grid)" opacity="0.3" rx="8"/>
</svg>';

echo "Creating placeholder SVG...\n";

if (!$dry_run) {
    file_put_contents($svg_path, $svg_content);
    echo "  SVG saved to: {$svg_path}\n";
    
    // Also create a PNG version using GD (SVG may not work as WC placeholder)
    // Create a simple branded PNG
    $img = imagecreatetruecolor(600, 600);
    
    // Colors
    $bg_dark = imagecolorallocate($img, 26, 26, 46);     // #1a1a2e
    $border = imagecolorallocate($img, 15, 52, 96);       // #0f3460
    $cyan = imagecolorallocate($img, 83, 209, 239);       // #53d1ef
    $text_light = imagecolorallocate($img, 226, 232, 240); // #e2e8f0
    $text_dim = imagecolorallocate($img, 148, 163, 184);   // #94a3b8
    $text_muted = imagecolorallocate($img, 100, 116, 139); // #64748b
    
    // Fill background
    imagefilledrectangle($img, 0, 0, 599, 599, $bg_dark);
    
    // Border
    imagerectangle($img, 15, 15, 584, 584, $border);
    
    // Water drop (simple ellipse)
    imagefilledellipse($img, 300, 220, 80, 100, $border);
    imageellipse($img, 300, 220, 90, 110, $cyan);
    
    // Text - H-MOON HYDRO
    $font_size = 5; // largest built-in font
    $text = "H-MOON HYDRO";
    $tw = imagefontwidth($font_size) * strlen($text);
    imagestring($img, $font_size, (600 - $tw) / 2, 310, $text, $text_light);
    
    // Tagline
    $font_size2 = 3;
    $text2 = "HYDROPONICS SUPPLY";
    $tw2 = imagefontwidth($font_size2) * strlen($text2);
    imagestring($img, $font_size2, (600 - $tw2) / 2, 340, $text2, $text_dim);
    
    // Image Coming Soon
    $font_size3 = 4;
    $text3 = "Image Coming Soon";
    $tw3 = imagefontwidth($font_size3) * strlen($text3);
    imagestring($img, $font_size3, (600 - $tw3) / 2, 400, $text3, $text_muted);
    
    // Save PNG
    imagepng($img, $png_path);
    imagedestroy($img);
    echo "  PNG saved to: {$png_path}\n";
    
    // Upload PNG as WordPress attachment
    $filetype = wp_check_filetype('hmoon-placeholder.png');
    $attachment = array(
        'guid' => $upload_dir['baseurl'] . '/hmoon-placeholder.png',
        'post_mime_type' => $filetype['type'],
        'post_title' => 'H-Moon Hydro Placeholder',
        'post_content' => '',
        'post_status' => 'inherit'
    );
    
    $attach_id = wp_insert_attachment($attachment, $png_path);
    
    if ($attach_id && !is_wp_error($attach_id)) {
        require_once(ABSPATH . 'wp-admin/includes/image.php');
        $attach_data = wp_generate_attachment_metadata($attach_id, $png_path);
        wp_update_attachment_metadata($attach_id, $attach_data);
        
        // Set as WooCommerce placeholder
        update_option('woocommerce_placeholder_image', $attach_id);
        
        echo "  Attachment created: #{$attach_id}\n";
        echo "  Set as WooCommerce placeholder image!\n";
        echo "  URL: " . wp_get_attachment_url($attach_id) . "\n";
    } else {
        echo "  ERROR creating attachment\n";
    }
} else {
    echo "  Would create SVG and PNG placeholder images\n";
    echo "  Would set as WooCommerce placeholder image\n";
}

echo "\n=== DONE ===\n";
if ($dry_run) {
    echo "*** DRY RUN - no changes made. Run with CONFIRM=1 to apply. ***\n";
}
