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
