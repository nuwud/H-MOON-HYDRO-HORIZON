/**
 * WooCommerce ACH Batch - Admin JavaScript
 *
 * @package Nuwud\WooAchBatch
 */

(function($) {
    'use strict';

    window.WooAchBatchAdmin = {
        init: function() {
            this.bindEvents();
        },

        bindEvents: function() {
            // Manual batch trigger
            $(document).on('click', '#run-manual-batch', this.runManualBatch.bind(this));

            // SFTP test
            $(document).on('click', '#test-sftp', this.testSftp.bind(this));

            // Verification actions
            $(document).on('click', '.approve-verification', this.approveVerification.bind(this));
            $(document).on('click', '.reject-verification', this.showRejectModal.bind(this));
            $(document).on('click', '#confirm-reject', this.confirmReject.bind(this));
            $(document).on('click', '#cancel-reject', this.hideRejectModal.bind(this));

            // Modal close on outside click
            $(document).on('click', '.woo-ach-modal', function(e) {
                if ($(e.target).hasClass('woo-ach-modal')) {
                    WooAchBatchAdmin.hideRejectModal();
                }
            });
        },

        runManualBatch: function(e) {
            e.preventDefault();

            if (!confirm(wooAchBatch.i18n.confirmManualBatch)) {
                return;
            }

            var $btn = $(e.currentTarget);
            var originalText = $btn.text();

            $btn.prop('disabled', true).text(wooAchBatch.i18n.processing);

            $.ajax({
                url: wooAchBatch.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'woo_ach_manual_batch',
                    nonce: wooAchBatch.nonce
                },
                success: function(response) {
                    $btn.prop('disabled', false).text(originalText);

                    if (response.success) {
                        alert('Batch created successfully. ' + (response.data.count || 0) + ' orders processed.');
                        location.reload();
                    } else {
                        alert('Error: ' + (response.data.message || 'Unknown error'));
                    }
                },
                error: function() {
                    $btn.prop('disabled', false).text(originalText);
                    alert('Request failed. Please try again.');
                }
            });
        },

        testSftp: function(e) {
            e.preventDefault();

            var $btn = $(e.currentTarget);
            var $result = $('#sftp-test-result');
            var originalText = $btn.text();

            $btn.prop('disabled', true).text(wooAchBatch.i18n.testing);
            $result.html('');

            $.ajax({
                url: wooAchBatch.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'woo_ach_test_sftp',
                    nonce: wooAchBatch.nonce
                },
                success: function(response) {
                    $btn.prop('disabled', false).text(originalText);

                    if (response.success) {
                        $result.html('<span style="color: green;">' + response.data.message + '</span>');
                    } else {
                        $result.html('<span style="color: red;">' + response.data.message + '</span>');
                    }
                },
                error: function() {
                    $btn.prop('disabled', false).text(originalText);
                    $result.html('<span style="color: red;">Connection test failed</span>');
                }
            });
        },

        approveVerification: function(e) {
            e.preventDefault();

            if (!confirm(wooAchBatch.i18n.confirmApprove)) {
                return;
            }

            var $btn = $(e.currentTarget);
            var orderId = $btn.data('order-id');
            var $row = $btn.closest('tr');

            $btn.prop('disabled', true).text(wooAchBatch.i18n.processing);

            $.ajax({
                url: wooAchBatch.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'woo_ach_approve_verification',
                    nonce: wooAchBatch.nonce,
                    order_id: orderId
                },
                success: function(response) {
                    if (response.success) {
                        $row.fadeOut(400, function() {
                            $(this).remove();
                        });
                    } else {
                        $btn.prop('disabled', false).text('Approve');
                        alert('Error: ' + (response.data.message || 'Unknown error'));
                    }
                },
                error: function() {
                    $btn.prop('disabled', false).text('Approve');
                    alert('Request failed. Please try again.');
                }
            });
        },

        currentRejectOrderId: null,

        showRejectModal: function(e) {
            e.preventDefault();

            this.currentRejectOrderId = $(e.currentTarget).data('order-id');
            $('#reject-modal').show();
            $('#rejection-reason').val('').focus();
        },

        hideRejectModal: function() {
            $('#reject-modal').hide();
            this.currentRejectOrderId = null;
        },

        confirmReject: function(e) {
            e.preventDefault();

            if (!this.currentRejectOrderId) {
                return;
            }

            var reason = $('#rejection-reason').val();
            var orderId = this.currentRejectOrderId;
            var $row = $('tr[data-order-id="' + orderId + '"]');
            var $btn = $(e.currentTarget);

            $btn.prop('disabled', true).text(wooAchBatch.i18n.processing);

            $.ajax({
                url: wooAchBatch.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'woo_ach_reject_verification',
                    nonce: wooAchBatch.nonce,
                    order_id: orderId,
                    reason: reason
                },
                success: function(response) {
                    $btn.prop('disabled', false).text('Reject');
                    WooAchBatchAdmin.hideRejectModal();

                    if (response.success) {
                        $row.fadeOut(400, function() {
                            $(this).remove();
                        });
                    } else {
                        alert('Error: ' + (response.data.message || 'Unknown error'));
                    }
                },
                error: function() {
                    $btn.prop('disabled', false).text('Reject');
                    alert('Request failed. Please try again.');
                }
            });
        }
    };

    $(document).ready(function() {
        WooAchBatchAdmin.init();
    });

})(jQuery);
                $('#reject-modal').hide();
                if (response.success) {
                    $row.fadeOut();
                } else {
                    alert(response.data.message || 'Error');
                }
            }
        });
    });
});
</script>
