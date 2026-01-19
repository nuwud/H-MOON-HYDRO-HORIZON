/**
 * PLM Frontend JavaScript
 * 
 * @package WooProductLineManager
 */

(function($) {
    'use strict';

    const PLM_Frontend = {
        /**
         * Initialize
         */
        init: function() {
            this.bindEvents();
            this.initAccordions();
            this.initFilters();
        },

        /**
         * Bind events
         */
        bindEvents: function() {
            // Accordion toggle
            $(document).on('click', '.plm-accordion-header', this.toggleAccordion.bind(this));
            
            // Filter change
            $(document).on('change', '.plm-filters select', this.handleFilterChange.bind(this));
            
            // Search input
            $(document).on('input', '.plm-filters input[type="search"]', this.debounce(this.handleSearch.bind(this), 300));
            
            // Add to cart (special order)
            $(document).on('click', '.plm-add-special-order', this.addSpecialOrder.bind(this));
            
            // Quick view
            $(document).on('click', '.plm-quick-view', this.openQuickView.bind(this));
        },

        /**
         * Initialize accordions
         */
        initAccordions: function() {
            // Open first accordion by default
            $('.plm-accordion-item').first().addClass('open');
        },

        /**
         * Initialize filters from URL params
         */
        initFilters: function() {
            const params = new URLSearchParams(window.location.search);
            
            params.forEach(function(value, key) {
                const $field = $(`.plm-filters [name="${key}"]`);
                if ($field.length) {
                    $field.val(value);
                }
            });
        },

        /**
         * Toggle accordion
         */
        toggleAccordion: function(e) {
            const $item = $(e.currentTarget).closest('.plm-accordion-item');
            
            // Toggle current item
            $item.toggleClass('open');
        },

        /**
         * Handle filter change
         */
        handleFilterChange: function(e) {
            this.applyFilters();
        },

        /**
         * Handle search
         */
        handleSearch: function(e) {
            this.applyFilters();
        },

        /**
         * Apply filters
         */
        applyFilters: function() {
            const $form = $('.plm-filters');
            const formData = new FormData($form[0]);
            const params = new URLSearchParams();
            
            for (const [key, value] of formData.entries()) {
                if (value) {
                    params.append(key, value);
                }
            }
            
            // Update URL
            const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
            window.history.replaceState(null, null, newUrl);
            
            // Show loading
            this.showLoading();
            
            // AJAX filter
            $.ajax({
                url: plm_frontend.ajax_url,
                type: 'GET',
                data: {
                    action: 'plm_filter_catalog',
                    ...Object.fromEntries(params)
                },
                success: function(response) {
                    if (response.success) {
                        $('.plm-catalog-results').html(response.data.html);
                    }
                },
                complete: function() {
                    PLM_Frontend.hideLoading();
                }
            });
        },

        /**
         * Add special order to cart
         */
        addSpecialOrder: function(e) {
            e.preventDefault();
            const $btn = $(e.currentTarget);
            const productData = $btn.data();
            
            $btn.prop('disabled', true).addClass('loading');
            
            $.ajax({
                url: plm_frontend.ajax_url,
                type: 'POST',
                data: {
                    action: 'plm_add_special_order',
                    manufacturer: productData.manufacturer,
                    line: productData.line,
                    size: productData.size,
                    nonce: plm_frontend.nonce
                },
                success: function(response) {
                    if (response.success) {
                        PLM_Frontend.showNotice('success', 'Added to cart as special order!');
                        
                        // Update cart count
                        $(document.body).trigger('wc_fragment_refresh');
                    } else {
                        PLM_Frontend.showNotice('error', response.data.message || 'Could not add to cart');
                    }
                },
                error: function() {
                    PLM_Frontend.showNotice('error', 'An error occurred');
                },
                complete: function() {
                    $btn.prop('disabled', false).removeClass('loading');
                }
            });
        },

        /**
         * Open quick view modal
         */
        openQuickView: function(e) {
            e.preventDefault();
            const $btn = $(e.currentTarget);
            const data = $btn.data();
            
            // Create modal
            const $modal = $(`
                <div class="plm-modal-overlay">
                    <div class="plm-modal">
                        <button class="plm-modal-close">&times;</button>
                        <div class="plm-modal-content">
                            <div class="plm-loading"><div class="plm-spinner"></div></div>
                        </div>
                    </div>
                </div>
            `);
            
            $('body').append($modal);
            
            // Load content
            $.ajax({
                url: plm_frontend.ajax_url,
                type: 'GET',
                data: {
                    action: 'plm_quick_view',
                    manufacturer: data.manufacturer,
                    line: data.line
                },
                success: function(response) {
                    if (response.success) {
                        $modal.find('.plm-modal-content').html(response.data.html);
                    }
                }
            });
            
            // Close on overlay click
            $modal.on('click', function(e) {
                if ($(e.target).hasClass('plm-modal-overlay') || $(e.target).hasClass('plm-modal-close')) {
                    $modal.remove();
                }
            });
            
            // Close on escape
            $(document).on('keydown.plm-modal', function(e) {
                if (e.key === 'Escape') {
                    $modal.remove();
                    $(document).off('keydown.plm-modal');
                }
            });
        },

        /**
         * Show loading overlay
         */
        showLoading: function() {
            if (!$('.plm-loading-overlay').length) {
                $('.plm-catalog-results').append('<div class="plm-loading-overlay"><div class="plm-spinner"></div></div>');
            }
        },

        /**
         * Hide loading overlay
         */
        hideLoading: function() {
            $('.plm-loading-overlay').remove();
        },

        /**
         * Show notice
         */
        showNotice: function(type, message) {
            const $notice = $(`
                <div class="plm-notice plm-notice-${type}">
                    <p>${message}</p>
                    <button class="plm-notice-close">&times;</button>
                </div>
            `);
            
            $('body').append($notice);
            
            // Animate in
            setTimeout(function() {
                $notice.addClass('visible');
            }, 10);
            
            // Close handler
            $notice.find('.plm-notice-close').on('click', function() {
                $notice.removeClass('visible');
                setTimeout(function() {
                    $notice.remove();
                }, 300);
            });
            
            // Auto close
            setTimeout(function() {
                $notice.removeClass('visible');
                setTimeout(function() {
                    $notice.remove();
                }, 300);
            }, 4000);
        },

        /**
         * Debounce utility
         */
        debounce: function(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }
    };

    // Initialize when ready
    $(document).ready(function() {
        PLM_Frontend.init();
    });

})(jQuery);
