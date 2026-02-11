/**
 * H-Moon Product Enricher - Admin JavaScript
 * Handles AJAX interactions for product data enrichment
 */

(function($) {
    'use strict';

    const Enricher = {
        // Store scraped data
        scrapedData: null,
        
        init: function() {
            this.bindEvents();
        },
        
        bindEvents: function() {
            $('#hmoon-search-btn').on('click', this.searchProduct.bind(this));
            $('#hmoon-apply-btn').on('click', this.applyEnrichment.bind(this));
            
            // Enter key in search field
            $('#hmoon-search-query').on('keypress', function(e) {
                if (e.which === 13) {
                    e.preventDefault();
                    $('#hmoon-search-btn').click();
                }
            });
        },
        
        log: function(message, type) {
            type = type || 'info';
            const $log = $('#hmoon-enricher-log');
            const time = new Date().toLocaleTimeString();
            const icons = {
                'info': 'ℹ️',
                'success': '✅',
                'error': '❌',
                'warning': '⚠️',
            };
            
            $log.show().prepend(
                '<div class="log-' + type + '">' +
                '<span class="log-icon">' + (icons[type] || '') + '</span> ' +
                '<span class="log-time">[' + time + ']</span> ' +
                message +
                '</div>'
            );
        },
        
        searchProduct: function() {
            const self = this;
            const query = $('#hmoon-search-query').val().trim();
            const source = $('#hmoon-search-source').val();
            
            if (!query) {
                this.log('Please enter a search query', 'warning');
                return;
            }
            
            const $btn = $('#hmoon-search-btn');
            $btn.prop('disabled', true).text('🔄 Searching...');
            
            this.log('Searching for: ' + query);
            
            $.ajax({
                url: hmoonEnricher.ajax_url,
                type: 'POST',
                data: {
                    action: 'hmoon_search_product',
                    nonce: hmoonEnricher.nonce,
                    query: query,
                    source: source,
                    product_id: hmoonEnricher.product_id,
                },
                success: function(response) {
                    $btn.prop('disabled', false).text('🔍 Search for Product Data');
                    
                    if (response.success) {
                        self.displayResults(response.data);
                        self.log('Search complete', 'success');
                    } else {
                        self.log('Search failed: ' + response.data.message, 'error');
                    }
                },
                error: function(xhr, status, error) {
                    $btn.prop('disabled', false).text('🔍 Search for Product Data');
                    self.log('Request failed: ' + error, 'error');
                },
            });
        },
        
        displayResults: function(data) {
            const self = this;
            const $results = $('#hmoon-search-results');
            const $content = $('#hmoon-results-content');
            
            $content.empty();
            
            // Show search source
            $content.append('<p><strong>Source:</strong> ' + this.escapeHtml(data.source) + '</p>');
            
            // Show data found (if any)
            if (data.data && data.data.found) {
                this.scrapedData = data.data.fields;
                
                if (data.data.fields.image) {
                    $content.append(
                        '<div class="hmoon-result-item">' +
                        '<strong>Image Found:</strong><br>' +
                        '<img src="' + this.escapeHtml(data.data.fields.image) + '" class="hmoon-result-image" />' +
                        '</div>'
                    );
                }
                
                if (data.data.fields.weight) {
                    $content.append(
                        '<div class="hmoon-result-item">' +
                        '<strong>Weight:</strong> ' + 
                        this.escapeHtml(data.data.fields.weight) + ' ' + 
                        this.escapeHtml(data.data.fields.weight_unit || 'lbs') +
                        '</div>'
                    );
                }
                
                if (data.data.fields.description) {
                    $content.append(
                        '<div class="hmoon-result-item">' +
                        '<strong>Description:</strong><br>' +
                        '<small>' + this.escapeHtml(data.data.fields.description.substring(0, 200)) + '...</small>' +
                        '</div>'
                    );
                }
                
                $('#hmoon-apply-section').show();
            } else {
                $content.append('<p>' + this.escapeHtml(data.data.message || 'No automatic data found.') + '</p>');
            }
            
            // Show search links
            if (data.search_urls && data.search_urls.length > 0) {
                let linksHtml = '<div class="hmoon-search-links"><strong>Search Links:</strong><br>';
                
                data.search_urls.forEach(function(link) {
                    linksHtml += '<a href="' + self.escapeHtml(link.url) + '" target="_blank" class="button button-small" style="margin: 3px;">' +
                        self.escapeHtml(link.name) + ' →</a> ';
                });
                
                linksHtml += '</div>';
                $content.append(linksHtml);
                
                // Add manual URL input
                $content.append(
                    '<div class="hmoon-manual-input" style="margin-top: 15px;">' +
                    '<strong>Or paste product URL:</strong><br>' +
                    '<input type="url" id="hmoon-manual-url" class="widefat" placeholder="https://..." style="margin: 5px 0;" />' +
                    '<button type="button" id="hmoon-fetch-url-btn" class="button button-secondary">📥 Fetch from URL</button>' +
                    '</div>'
                );
                
                // Bind fetch URL button
                $('#hmoon-fetch-url-btn').on('click', function() {
                    self.fetchFromUrl();
                });
            }
            
            $results.show();
        },
        
        fetchFromUrl: function() {
            const self = this;
            const url = $('#hmoon-manual-url').val().trim();
            
            if (!url) {
                this.log('Please enter a URL', 'warning');
                return;
            }
            
            const $btn = $('#hmoon-fetch-url-btn');
            $btn.prop('disabled', true).text('🔄 Fetching...');
            
            this.log('Fetching data from: ' + url);
            
            $.ajax({
                url: hmoonEnricher.ajax_url,
                type: 'POST',
                data: {
                    action: 'hmoon_fetch_product_data',
                    nonce: hmoonEnricher.nonce,
                    url: url,
                },
                success: function(response) {
                    $btn.prop('disabled', false).text('📥 Fetch from URL');
                    
                    if (response.success) {
                        self.displayFetchedData(response.data);
                        self.log('Data fetched successfully', 'success');
                    } else {
                        self.log('Fetch failed: ' + response.data.message, 'error');
                    }
                },
                error: function(xhr, status, error) {
                    $btn.prop('disabled', false).text('📥 Fetch from URL');
                    self.log('Request failed: ' + error, 'error');
                },
            });
        },
        
        displayFetchedData: function(data) {
            this.scrapedData = data;
            
            let html = '<div class="hmoon-fetched-data" style="background: #fff; padding: 10px; margin-top: 10px; border-radius: 4px;">';
            html += '<h4>Extracted Data:</h4>';
            
            if (data.image) {
                html += '<div class="hmoon-result-item">' +
                    '<label><input type="checkbox" class="hmoon-use-field" data-field="image" checked> Use Image:</label><br>' +
                    '<img src="' + this.escapeHtml(data.image) + '" class="hmoon-result-image" style="max-width: 150px;" />' +
                    '</div>';
            }
            
            if (data.weight) {
                html += '<div class="hmoon-result-item">' +
                    '<label><input type="checkbox" class="hmoon-use-field" data-field="weight" checked> Weight:</label> ' +
                    '<input type="text" id="hmoon-edit-weight" value="' + this.escapeHtml(data.weight) + '" style="width: 60px;" /> ' +
                    '<select id="hmoon-edit-weight-unit">' +
                    '<option value="lbs"' + (data.weight_unit === 'lbs' ? ' selected' : '') + '>lbs</option>' +
                    '<option value="kg"' + (data.weight_unit === 'kg' ? ' selected' : '') + '>kg</option>' +
                    '<option value="g"' + (data.weight_unit === 'g' ? ' selected' : '') + '>g</option>' +
                    '<option value="oz"' + (data.weight_unit === 'oz' ? ' selected' : '') + '>oz</option>' +
                    '</select>' +
                    '</div>';
            }
            
            if (data.description) {
                html += '<div class="hmoon-result-item">' +
                    '<label><input type="checkbox" class="hmoon-use-field" data-field="description" checked> Description:</label><br>' +
                    '<textarea id="hmoon-edit-description" rows="3" class="widefat">' + this.escapeHtml(data.description) + '</textarea>' +
                    '</div>';
            }
            
            html += '<button type="button" id="hmoon-apply-fetched-btn" class="button button-primary" style="margin-top: 10px;">✅ Apply to Product</button>';
            html += '</div>';
            
            $('#hmoon-results-content').append(html);
            
            // Bind apply button
            $('#hmoon-apply-fetched-btn').on('click', this.applyFetchedData.bind(this));
        },
        
        applyFetchedData: function() {
            const self = this;
            
            // Build data from edited fields
            const data = {
                source: this.scrapedData.url || 'manual',
            };
            
            const options = {};
            
            // Check which fields to use
            $('.hmoon-use-field').each(function() {
                const field = $(this).data('field');
                if ($(this).is(':checked')) {
                    options[field] = true;
                    
                    switch (field) {
                        case 'image':
                            data.image = self.scrapedData.image;
                            break;
                        case 'weight':
                            data.weight = $('#hmoon-edit-weight').val();
                            data.weight_unit = $('#hmoon-edit-weight-unit').val();
                            break;
                        case 'description':
                            data.description = $('#hmoon-edit-description').val();
                            break;
                    }
                }
            });
            
            this.doApply(data, options);
        },
        
        applyEnrichment: function() {
            if (!this.scrapedData) {
                this.log('No data to apply', 'warning');
                return;
            }
            
            const options = {
                image: $('#hmoon-apply-image').is(':checked'),
                weight: $('#hmoon-apply-weight').is(':checked'),
                description: $('#hmoon-apply-description').is(':checked'),
                dimensions: $('#hmoon-apply-dimensions').is(':checked'),
            };
            
            this.doApply(this.scrapedData, options);
        },
        
        doApply: function(data, options) {
            const self = this;
            const $btn = $('#hmoon-apply-btn, #hmoon-apply-fetched-btn');
            
            $btn.prop('disabled', true).text('🔄 Applying...');
            this.log('Applying updates to product...');
            
            $.ajax({
                url: hmoonEnricher.ajax_url,
                type: 'POST',
                data: {
                    action: 'hmoon_apply_enrichment',
                    nonce: hmoonEnricher.nonce,
                    product_id: hmoonEnricher.product_id,
                    data: data,
                    options: options,
                },
                success: function(response) {
                    $btn.prop('disabled', false).text('✅ Apply Selected Updates');
                    
                    if (response.success) {
                        self.log('Updated: ' + response.data.updated.join(', '), 'success');
                        
                        // Refresh status display after short delay
                        setTimeout(function() {
                            location.reload();
                        }, 1500);
                    } else {
                        self.log('Update failed: ' + response.data.message, 'error');
                    }
                },
                error: function(xhr, status, error) {
                    $btn.prop('disabled', false).text('✅ Apply Selected Updates');
                    self.log('Request failed: ' + error, 'error');
                },
            });
        },
        
        escapeHtml: function(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },
    };

    $(document).ready(function() {
        // Only initialize if the enricher box exists
        if ($('#hmoon-product-enricher').length) {
            Enricher.init();
        }
    });

})(jQuery);
            $source = $this->detect_manufacturer($query, $vendor);
        }
        
        $results = [
            'source' => $source,
            'query' => $query,
            'data' => [],
            'search_urls' => [],
        ];
        
        // Build search URLs for manual fallback
        $encoded_query = urlencode($query);
        
        if (isset($this->manufacturers[$source])) {
            $mfr = $this->manufacturers[$source];
            $results['search_urls'][] = [
                'name' => $mfr['name'],
                'url' => sprintf($mfr['search_url'], $encoded_query),
            ];
        }
        
        // Add retailer fallbacks
        foreach ($this->retailers as $key => $ret) {
            $results['search_urls'][] = [
                'name' => $ret['name'],
                'url' => sprintf($ret['search_url'], $encoded_query),
            ];
        }
        
        // Add Google search
        $results['search_urls'][] = [
            'name' => 'Google',
            'url' => 'https://www.google.com/search?q=' . $encoded_query . '+hydroponics+product',
        ];
        
        // Try to fetch data (this would be enhanced with actual scraping)
        $results['data'] = $this->fetch_product_info($query, $source);
        
        return $results;
    }
    
    /**
     * Detect manufacturer from query/vendor
     */
    private function detect_manufacturer($query, $vendor) {
        $text = strtolower($query . ' ' . $vendor);
        
        $patterns = [
            'advanced-nutrients' => ['advanced nutrients', 'big bud', 'overdrive', 'bud candy', 'sensi'],
            'general-hydroponics' => ['general hydro', 'flora', 'maxi', 'rapid rooter'],
            'fox-farm' => ['fox farm', 'foxfarm', 'ocean forest', 'happy frog', 'big bloom'],
            'botanicare' => ['botanicare', 'hydroguard', 'pure blend'],
            'ac-infinity' => ['ac infinity', 'cloudline', 'cloudlab'],
            'spider-farmer' => ['spider farmer', 'sf-'],
            'hydrofarm' => ['hydrofarm', 'active aqua', 'quantum'],
            'gorilla-grow' => ['gorilla', 'grow tent'],
        ];
        
        foreach ($patterns as $key => $keywords) {
            foreach ($keywords as $keyword) {
                if (strpos($text, $keyword) !== false) {
                    return $key;
                }
            }
        }
        
        return 'htg-supply'; // Default to retailer
    }
    
    /**
     * Fetch product information (placeholder for actual implementation)
     */
    private function fetch_product_info($query, $source) {
        // This would be enhanced with actual web scraping
        // For now, return structure for manual entry
        return [
            'found' => false,
            'message' => 'Use the search links below to find product data, then paste the URL to import.',
            'fields' => [
                'image' => '',
                'weight' => '',
                'weight_unit' => 'lbs',
                'description' => '',
                'dimensions' => [
                    'length' => '',
                    'width' => '',
                    'height' => '',
                ],
            ],
        ];
    }
    
    /**
     * AJAX: Fetch data from a specific URL
     */
    public function ajax_fetch_product_data() {
        check_ajax_referer('hmoon_enricher_nonce', 'nonce');
        
        if (!current_user_can('edit_products')) {
            wp_send_json_error(['message' => 'Permission denied']);
        }
        
        $url = esc_url_raw($_POST['url'] ?? '');
        
        if (empty($url)) {
            wp_send_json_error(['message' => 'URL is required']);
        }
        
        $data = $this->scrape_product_page($url);
        
        if (is_wp_error($data)) {
            wp_send_json_error(['message' => $data->get_error_message()]);
        }
        
        wp_send_json_success($data);
    }
    
    /**
     * Scrape product page for data
     */
    private function scrape_product_page($url) {
        $response = wp_remote_get($url, [
            'timeout' => 15,
            'user-agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ]);
        
        if (is_wp_error($response)) {
            return $response;
        }
        
        $body = wp_remote_retrieve_body($response);
        
        if (empty($body)) {
            return new WP_Error('empty_response', 'No content received from URL');
        }
        
        // Parse the HTML
        libxml_use_internal_errors(true);
        $doc = new DOMDocument();
        $doc->loadHTML($body);
        $xpath = new DOMXPath($doc);
        
        $data = [
            'url' => $url,
            'image' => '',
            'weight' => '',
            'description' => '',
            'dimensions' => [],
        ];
        
        // Try to find product image
        $image_selectors = [
            '//meta[@property="og:image"]/@content',
            '//img[contains(@class, "product")]/@src',
            '//img[@id="product-image"]/@src',
            '//div[contains(@class, "product-image")]//img/@src',
        ];
        
        foreach ($image_selectors as $selector) {
            $nodes = $xpath->query($selector);
            if ($nodes->length > 0) {
                $data['image'] = $nodes->item(0)->nodeValue;
                break;
            }
        }
        
        // Try to find weight
        $weight_patterns = [
            '/(\d+(?:\.\d+)?)\s*(lbs?|pounds?|oz|ounces?|kg|g)/i',
            '/weight[:\s]+(\d+(?:\.\d+)?)\s*(lbs?|kg|g)/i',
            '/shipping\s+weight[:\s]+(\d+(?:\.\d+)?)/i',
        ];
        
        foreach ($weight_patterns as $pattern) {
            if (preg_match($pattern, $body, $matches)) {
                $data['weight'] = $matches[1];
                $data['weight_unit'] = strtolower($matches[2] ?? 'lbs');
                break;
            }
        }
        
        // Try to find description
        $desc_selectors = [
            '//meta[@property="og:description"]/@content',
            '//meta[@name="description"]/@content',
            '//div[contains(@class, "product-description")]',
            '//div[@id="description"]',
        ];
        
        foreach ($desc_selectors as $selector) {
            $nodes = $xpath->query($selector);
            if ($nodes->length > 0) {
                $desc = $nodes->item(0)->nodeValue ?? $nodes->item(0)->textContent;
                if (strlen($desc) > 50) {
                    $data['description'] = trim($desc);
                    break;
                }
            }
        }
        
        return $data;
    }
    
    /**
     * AJAX: Apply enrichment to product
     */
    public function ajax_apply_enrichment() {
        check_ajax_referer('hmoon_enricher_nonce', 'nonce');
        
        if (!current_user_can('edit_products')) {
            wp_send_json_error(['message' => 'Permission denied']);
        }
        
        $product_id = intval($_POST['product_id'] ?? 0);
        $data = $_POST['data'] ?? [];
        $options = $_POST['options'] ?? [];
        
        $product = wc_get_product($product_id);
        
        if (!$product) {
            wp_send_json_error(['message' => 'Product not found']);
        }
        
        $updated = [];
        
        // Update image
        if (!empty($options['image']) && !empty($data['image'])) {
            $image_id = $this->upload_image_from_url($data['image'], $product_id);
            if ($image_id && !is_wp_error($image_id)) {
                $product->set_image_id($image_id);
                $updated[] = 'image';
            }
        }
        
        // Update weight
        if (!empty($options['weight']) && !empty($data['weight'])) {
            $weight = floatval($data['weight']);
            $unit = $data['weight_unit'] ?? 'lbs';
            
            // Convert to store unit if needed
            if ($unit === 'kg') {
                $weight = $weight * 2.20462;
            } elseif ($unit === 'g') {
                $weight = $weight / 453.592;
            } elseif ($unit === 'oz') {
                $weight = $weight / 16;
            }
            
            $product->set_weight($weight);
            $updated[] = 'weight';
        }
        
        // Update description
        if (!empty($options['description']) && !empty($data['description'])) {
            $product->set_description(wp_kses_post($data['description']));
            $updated[] = 'description';
        }
        
        // Update dimensions
        if (!empty($options['dimensions']) && !empty($data['dimensions'])) {
            if (!empty($data['dimensions']['length'])) {
                $product->set_length($data['dimensions']['length']);
            }
            if (!empty($data['dimensions']['width'])) {
                $product->set_width($data['dimensions']['width']);
            }
            if (!empty($data['dimensions']['height'])) {
                $product->set_height($data['dimensions']['height']);
            }
            $updated[] = 'dimensions';
        }
        
        $product->save();
        
        // Log the update
        $this->log_enrichment($product_id, $updated, $data);
        
        wp_send_json_success([
            'message' => 'Product updated successfully',
            'updated' => $updated,
        ]);
    }
    
    /**
     * Upload image from URL
     */
    private function upload_image_from_url($url, $product_id) {
        require_once(ABSPATH . 'wp-admin/includes/media.php');
        require_once(ABSPATH . 'wp-admin/includes/file.php');
        require_once(ABSPATH . 'wp-admin/includes/image.php');
        
        $tmp = download_url($url);
        
        if (is_wp_error($tmp)) {
            return $tmp;
        }
        
        $file_array = [
            'name' => basename(parse_url($url, PHP_URL_PATH)) ?: 'product-image.jpg',
            'tmp_name' => $tmp,
        ];
        
        $image_id = media_handle_sideload($file_array, $product_id);
        
        @unlink($tmp);
        
        return $image_id;
    }
    
    /**
     * Log enrichment activity
     */
    private function log_enrichment($product_id, $fields, $data) {
        $log = get_option('hmoon_enricher_log', []);
        
        $log[] = [
            'product_id' => $product_id,
            'fields' => $fields,
            'source' => $data['source'] ?? 'manual',
            'timestamp' => current_time('mysql'),
        ];
        
        // Keep only last 100 entries
        if (count($log) > 100) {
            $log = array_slice($log, -100);
        }
        
        update_option('hmoon_enricher_log', $log);
    }
    
    /**
     * Add settings page
     */
    public function add_settings_page() {
        add_submenu_page(
            'woocommerce',
            'Product Enricher',
            '🔍 Enricher',
            'manage_woocommerce',
            'hmoon-enricher',
            [$this, 'render_settings_page']
        );
    }
    
    /**
     * Register settings
     */
    public function register_settings() {
        register_setting('hmoon_enricher_settings', 'hmoon_enricher_options');
    }
    
    /**
     * Render settings page
     */
    public function render_settings_page() {
        $log = get_option('hmoon_enricher_log', []);
        ?>
        <div class="wrap">
            <h1>🔍 H-Moon Product Enricher</h1>
            
            <div class="card" style="max-width: 800px; padding: 20px;">
                <h2>About</h2>
                <p>This plugin allows you to enrich WooCommerce products with data from manufacturer websites:</p>
                <ul style="list-style: disc; padding-left: 20px;">
                    <li>Images from official product pages</li>
                    <li>Accurate weights for shipping</li>
                    <li>Product descriptions</li>
                    <li>Dimensions</li>
                </ul>
                
                <h3>How to Use</h3>
                <ol>
                    <li>Edit any WooCommerce product</li>
                    <li>Find the "Product Data Enricher" box in the sidebar</li>
                    <li>Click "Search for Product Data"</li>
                    <li>Review found data or use search links to find manually</li>
                    <li>Click "Apply Selected Updates" to save</li>
                </ol>
            </div>
            
            <div class="card" style="max-width: 800px; padding: 20px; margin-top: 20px;">
                <h2>Enrichment Log</h2>
                <?php if (empty($log)): ?>
                    <p>No enrichments recorded yet.</p>
                <?php else: ?>
                    <table class="wp-list-table widefat fixed striped">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Fields Updated</th>
                                <th>Source</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach (array_reverse($log) as $entry): ?>
                                <?php $product = wc_get_product($entry['product_id']); ?>
                                <tr>
                                    <td>
                                        <?php if ($product): ?>
                                            <a href="<?php echo get_edit_post_link($entry['product_id']); ?>">
                                                <?php echo esc_html($product->get_name()); ?>
                                            </a>
                                        <?php else: ?>
                                            #<?php echo $entry['product_id']; ?>
                                        <?php endif; ?>
                                    </td>
                                    <td><?php echo esc_html(implode(', ', $entry['fields'])); ?></td>
                                    <td><?php echo esc_html($entry['source']); ?></td>
                                    <td><?php echo esc_html($entry['timestamp']); ?></td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php endif; ?>
            </div>
            
            <div class="card" style="max-width: 800px; padding: 20px; margin-top: 20px;">
                <h2>Bulk Enrichment</h2>
                <p>Products missing data:</p>
                <?php
                $missing_image = wc_get_products([
                    'limit' => -1,
                    'return' => 'ids',
                    'meta_query' => [
                        [
                            'key' => '_thumbnail_id',
                            'compare' => 'NOT EXISTS',
                        ],
                    ],
                ]);
                
                $missing_weight = wc_get_products([
                    'limit' => -1,
                    'return' => 'ids',
                    'meta_query' => [
                        [
                            'key' => '_weight',
                            'compare' => 'NOT EXISTS',
                        ],
                    ],
                ]);
                ?>
                <ul>
                    <li>Missing images: <strong><?php echo count($missing_image); ?></strong></li>
                    <li>Missing weight: <strong><?php echo count($missing_weight); ?></strong></li>
                </ul>
                
                <p><em>Bulk enrichment coming soon - use individual product editors for now.</em></p>
            </div>
        </div>
        <?php
    }
}

// Initialize plugin
HMoon_Product_Enricher::get_instance();
