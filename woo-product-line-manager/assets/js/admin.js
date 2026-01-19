/**
 * PLM Admin JavaScript
 * 
 * @package WooProductLineManager
 */

(function($) {
    'use strict';

    const PLM_Admin = {
        /**
         * Initialize
         */
        init: function() {
            this.bindEvents();
            this.initTabs();
        },

        /**
         * Bind events
         */
        bindEvents: function() {
            // Tab navigation
            $(document).on('click', '.plm-tab', this.handleTabClick.bind(this));
            
            // Run audit
            $(document).on('click', '#plm-run-audit', this.runAudit.bind(this));
            
            // Export CSV
            $(document).on('click', '.plm-export-csv', this.exportCSV.bind(this));
            
            // Manufacturer card toggle
            $(document).on('click', '.plm-manufacturer-card .toggle-lines', this.toggleLines.bind(this));
            
            // Search filter
            $(document).on('input', '#plm-search', this.filterTable.bind(this));
            
            // Bulk actions
            $(document).on('change', '#plm-bulk-action', this.handleBulkAction.bind(this));
        },

        /**
         * Initialize tabs
         */
        initTabs: function() {
            const hash = window.location.hash;
            if (hash) {
                const $tab = $(`.plm-tab[data-tab="${hash.substring(1)}"]`);
                if ($tab.length) {
                    this.switchTab($tab);
                }
            }
        },

        /**
         * Handle tab click
         */
        handleTabClick: function(e) {
            e.preventDefault();
            const $tab = $(e.currentTarget);
            this.switchTab($tab);
            
            // Update URL hash
            const tabId = $tab.data('tab');
            window.history.replaceState(null, null, `#${tabId}`);
        },

        /**
         * Switch tab
         */
        switchTab: function($tab) {
            const tabId = $tab.data('tab');
            
            // Update tab buttons
            $('.plm-tab').removeClass('active');
            $tab.addClass('active');
            
            // Update tab content
            $('.plm-tab-content').removeClass('active');
            $(`#tab-${tabId}`).addClass('active');
        },

        /**
         * Run audit
         */
        runAudit: function(e) {
            e.preventDefault();
            const $btn = $(e.currentTarget);
            const originalText = $btn.text();
            
            $btn.prop('disabled', true).text('Running Audit...');
            
            $.ajax({
                url: plm_admin.ajax_url,
                type: 'POST',
                data: {
                    action: 'plm_run_audit',
                    nonce: plm_admin.nonce
                },
                success: function(response) {
                    if (response.success) {
                        PLM_Admin.showNotice('success', 'Audit completed successfully!');
                        PLM_Admin.updateDashboard(response.data);
                    } else {
                        PLM_Admin.showNotice('error', response.data.message || 'Audit failed');
                    }
                },
                error: function() {
                    PLM_Admin.showNotice('error', 'An error occurred while running the audit');
                },
                complete: function() {
                    $btn.prop('disabled', false).text(originalText);
                }
            });
        },

        /**
         * Update dashboard with audit results
         */
        updateDashboard: function(data) {
            if (data.stats) {
                $('#plm-total-products').text(data.stats.total_products);
                $('#plm-total-manufacturers').text(data.stats.total_manufacturers);
                $('#plm-coverage').text(data.stats.coverage + '%');
                $('#plm-gaps').text(data.stats.gaps);
            }
            
            // Refresh the page to show updated data
            setTimeout(function() {
                location.reload();
            }, 1500);
        },

        /**
         * Export CSV
         */
        exportCSV: function(e) {
            e.preventDefault();
            const type = $(e.currentTarget).data('type');
            
            window.location.href = plm_admin.ajax_url + 
                '?action=plm_export_csv&type=' + type + 
                '&nonce=' + plm_admin.nonce;
        },

        /**
         * Toggle manufacturer lines
         */
        toggleLines: function(e) {
            e.preventDefault();
            const $card = $(e.currentTarget).closest('.plm-manufacturer-card');
            const $lines = $card.find('.lines');
            
            $lines.slideToggle(200);
            $(e.currentTarget).toggleClass('open');
        },

        /**
         * Filter table
         */
        filterTable: function(e) {
            const query = $(e.currentTarget).val().toLowerCase();
            const $rows = $('.plm-table tbody tr');
            
            $rows.each(function() {
                const text = $(this).text().toLowerCase();
                $(this).toggle(text.indexOf(query) > -1);
            });
        },

        /**
         * Handle bulk action
         */
        handleBulkAction: function(e) {
            const action = $(e.currentTarget).val();
            
            if (!action) return;
            
            const $checked = $('input[name="plm_items[]"]:checked');
            
            if ($checked.length === 0) {
                this.showNotice('warning', 'Please select at least one item');
                $(e.currentTarget).val('');
                return;
            }
            
            const ids = $checked.map(function() {
                return $(this).val();
            }).get();
            
            // Confirm dangerous actions
            if (action === 'delete' && !confirm('Are you sure you want to delete the selected items?')) {
                $(e.currentTarget).val('');
                return;
            }
            
            $.ajax({
                url: plm_admin.ajax_url,
                type: 'POST',
                data: {
                    action: 'plm_bulk_action',
                    bulk_action: action,
                    ids: ids,
                    nonce: plm_admin.nonce
                },
                success: function(response) {
                    if (response.success) {
                        PLM_Admin.showNotice('success', response.data.message);
                        location.reload();
                    } else {
                        PLM_Admin.showNotice('error', response.data.message);
                    }
                },
                error: function() {
                    PLM_Admin.showNotice('error', 'An error occurred');
                }
            });
            
            $(e.currentTarget).val('');
        },

        /**
         * Show notice
         */
        showNotice: function(type, message) {
            const classMap = {
                'success': 'notice-success',
                'error': 'notice-error',
                'warning': 'notice-warning',
                'info': 'notice-info'
            };
            
            const $notice = $('<div class="notice ' + classMap[type] + ' is-dismissible"><p>' + message + '</p></div>');
            
            $('.plm-dashboard-header').after($notice);
            
            // Make dismissible
            $notice.find('.notice-dismiss').on('click', function() {
                $notice.fadeOut(300, function() {
                    $(this).remove();
                });
            });
            
            // Auto dismiss after 5 seconds
            setTimeout(function() {
                $notice.fadeOut(300, function() {
                    $(this).remove();
                });
            }, 5000);
        }
    };

    // Initialize when ready
    $(document).ready(function() {
        PLM_Admin.init();
    });

})(jQuery);
