/**
 * ACH Verification Wizard - Frontend JavaScript
 *
 * Handles:
 * - Multi-step wizard navigation
 * - Bank validation with ABA checksum
 * - Document uploads with camera capture
 * - Mobile handoff QR code display
 * - Token-based authentication for mobile continuation
 *
 * @package Nuwud\WooAchBatch\Assets
 */

(function($) {
    'use strict';

    // Configuration from localized data
    const config = window.wooAchVerify || {};
    const i18n = config.i18n || {};

    // State
    let state = {
        currentStep: 1,
        bank: { validated: false, last4: '' },
        documents: { id_front: false, id_back: false, bank_proof: false },
        handoff: { token: '', expires: 0 },
        timerInterval: null
    };

    // DOM Elements (cached on init)
    let $container, $steps, $progressSteps;

    /**
     * Initialize the wizard
     */
    function init() {
        $container = $('.woo-ach-verify');
        if (!$container.length) return;

        $steps = $container.find('.woo-ach-verify__step');
        $progressSteps = $container.find('.woo-ach-verify__progress-step');

        // Get initial state
        fetchState();

        // Bind events
        bindEvents();

        // Initialize validation
        initBankValidation();
    }

    /**
     * Fetch current wizard state from server
     */
    function fetchState() {
        const data = buildRequestData({ action: 'woo_ach_get_wizard_state' });

        $.post(config.ajaxUrl, data, function(response) {
            if (response.success) {
                updateState(response.data);
            }
        });
    }

    /**
     * Update local state and UI
     */
    function updateState(serverState) {
        state.currentStep = serverState.current_step || 1;
        state.bank = serverState.bank || {};
        state.documents = serverState.documents || {};

        updateProgressUI();
        showStep(state.currentStep);
        updateDocumentsUI();
        updateConfirmUI();
    }

    /**
     * Build request data with token or nonce
     */
    function buildRequestData(data) {
        const token = $('#woo-ach-token').val() || config.token;

        if (token) {
            data.token = token;
            // Token-based requests use different actions
            if (data.action && !data.action.includes('_token')) {
                data.action = data.action.replace('woo_ach_', 'woo_ach_') + '_token';
            }
        } else {
            data.nonce = config.nonce;
            data.order_id = config.orderId || $container.data('order-id');
        }

        return data;
    }

    /**
     * Bind all event handlers
     */
    function bindEvents() {
        // Bank form submission
        $('#bank-form').on('submit', handleBankSubmit);
        $('#edit-bank-btn').on('click', showBankForm);
        $('#continue-to-docs-btn').on('click', () => showStep(2));

        // Navigation
        $('#back-to-bank-btn').on('click', () => showStep(1));
        $('#continue-to-confirm-btn').on('click', () => showStep(3));
        $('#back-to-docs-btn').on('click', () => showStep(2));

        // Document uploads
        $('[id^="upload-"]').on('change', handleDocumentUpload);

        // Terms checkbox
        $('#accept-terms').on('change', function() {
            $('#submit-verification-btn').prop('disabled', !this.checked);
        });

        // Final submission
        $('#submit-verification-btn').on('click', handleSubmitVerification);

        // Mobile handoff
        $('#show-handoff-btn').on('click', showHandoff);
        $('#hide-handoff-btn').on('click', hideHandoff);
        $('#send-handoff-email-btn').on('click', sendHandoffEmail);

        // Real-time validation
        $('#routing').on('input', validateRoutingRealtime);
        $('#account, #account_confirm').on('input', validateAccountRealtime);
    }

    /**
     * Initialize bank validation with ABA checksum
     */
    function initBankValidation() {
        // Restrict inputs to numbers only
        $('#routing, #account, #account_confirm').on('keypress', function(e) {
            if (!/[0-9]/.test(e.key) && !e.ctrlKey && e.key.length === 1) {
                e.preventDefault();
            }
        });

        // Format on paste
        $('#routing, #account, #account_confirm').on('paste', function(e) {
            e.preventDefault();
            const text = (e.originalEvent.clipboardData || window.clipboardData).getData('text');
            const numbers = text.replace(/\D/g, '');
            $(this).val(numbers.substring(0, $(this).attr('maxlength')));
            $(this).trigger('input');
        });
    }

    /**
     * Validate routing number in real-time
     */
    function validateRoutingRealtime() {
        const routing = $(this).val();
        const $error = $('[data-field="routing"]');

        if (routing.length === 0) {
            $error.text('');
            return;
        }

        if (routing.length < 9) {
            $error.text('');
            return;
        }

        if (routing.length === 9) {
            if (!validateABAChecksum(routing)) {
                $error.text(i18n.invalidRouting || 'Invalid routing number');
            } else {
                $error.text('').addClass('valid');
            }
        }
    }

    /**
     * Validate account number in real-time
     */
    function validateAccountRealtime() {
        const account = $('#account').val();
        const confirm = $('#account_confirm').val();
        const $accountError = $('[data-field="account"]');
        const $confirmError = $('[data-field="account_confirm"]');

        // Account length validation
        if (account.length > 0 && account.length < 4) {
            $accountError.text(i18n.invalidAccount || 'Account number too short');
        } else {
            $accountError.text('');
        }

        // Confirmation match
        if (confirm.length > 0 && account !== confirm) {
            $confirmError.text(i18n.accountMismatch || 'Account numbers do not match');
        } else {
            $confirmError.text('');
        }
    }

    /**
     * ABA routing number checksum validation
     * Weights: 3, 7, 1, 3, 7, 1, 3, 7, 1
     */
    function validateABAChecksum(routing) {
        if (!/^\d{9}$/.test(routing)) return false;

        const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1];
        let sum = 0;

        for (let i = 0; i < 9; i++) {
            sum += parseInt(routing[i], 10) * weights[i];
        }

        return sum % 10 === 0;
    }

    /**
     * Handle bank form submission
     */
    function handleBankSubmit(e) {
        e.preventDefault();

        const $form = $(this);
        const $btn = $('#verify-bank-btn');
        const $btnText = $btn.find('.btn-text');
        const $btnLoading = $btn.find('.btn-loading');

        // Clear errors
        $form.find('.woo-ach-verify__field-error').text('');

        // Client-side validation
        const routing = $('#routing').val();
        const account = $('#account').val();
        const accountConfirm = $('#account_confirm').val();

        let hasErrors = false;

        if (!validateABAChecksum(routing)) {
            $('[data-field="routing"]').text(i18n.invalidRouting || 'Invalid routing number');
            hasErrors = true;
        }

        if (account.length < 4) {
            $('[data-field="account"]').text(i18n.invalidAccount || 'Account number too short');
            hasErrors = true;
        }

        if (account !== accountConfirm) {
            $('[data-field="account_confirm"]').text(i18n.accountMismatch || 'Account numbers do not match');
            hasErrors = true;
        }

        if (hasErrors) return;

        // Show loading state
        $btn.prop('disabled', true);
        $btnText.hide();
        $btnLoading.show();

        const data = buildRequestData({
            action: 'woo_ach_verify_bank',
            routing: routing,
            account: account,
            account_confirm: accountConfirm,
            type: $('#type').val(),
            holder_name: $('#holder_name').val()
        });

        $.post(config.ajaxUrl, data, function(response) {
            $btn.prop('disabled', false);
            $btnText.show();
            $btnLoading.hide();

            if (response.success) {
                state.bank.validated = true;
                state.bank.last4 = response.data.last4;

                showNotification('success', response.data.message);

                // Update UI and move to next step
                setTimeout(() => showStep(2), 500);
            } else {
                // Show field-specific errors
                if (response.data.errors) {
                    Object.keys(response.data.errors).forEach(field => {
                        $(`[data-field="${field}"]`).text(response.data.errors[field]);
                    });
                } else {
                    showNotification('error', response.data.message);
                }
            }
        }).fail(function() {
            $btn.prop('disabled', false);
            $btnText.show();
            $btnLoading.hide();
            showNotification('error', i18n.error || 'An error occurred');
        });
    }

    /**
     * Show bank form for editing
     */
    function showBankForm() {
        $('#bank-form').show();
        $(this).hide();
        $('#continue-to-docs-btn').parent().hide();
    }

    /**
     * Handle document upload
     */
    function handleDocumentUpload(e) {
        const input = e.target;
        const file = input.files[0];

        if (!file) return;

        const docType = input.id.replace('upload-', '');
        const $card = $(`.woo-ach-verify__document-card[data-type="${docType}"]`);
        const $progress = $card.find('.woo-ach-verify__upload-progress');
        const $uploadBtn = $card.find('.woo-ach-verify__upload-btn');
        const $progressFill = $progress.find('.progress-fill');

        // Validate file
        if (file.size > config.maxFileSize) {
            showNotification('error', i18n.fileTooLarge || 'File is too large');
            return;
        }

        if (!config.allowedTypes.includes(file.type)) {
            showNotification('error', i18n.invalidFileType || 'Invalid file type');
            return;
        }

        // Show progress
        $uploadBtn.hide();
        $progress.show();
        $progressFill.css('width', '0%');

        // Create form data
        const formData = new FormData();
        formData.append('document', file);
        formData.append('document_type', docType);

        const token = $('#woo-ach-token').val() || config.token;
        if (token) {
            formData.append('token', token);
            formData.append('action', 'woo_ach_upload_document_token');
        } else {
            formData.append('nonce', config.nonce);
            formData.append('order_id', config.orderId || $container.data('order-id'));
            formData.append('action', 'woo_ach_upload_document');
        }

        // Upload with progress
        $.ajax({
            url: config.ajaxUrl,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            xhr: function() {
                const xhr = new window.XMLHttpRequest();
                xhr.upload.addEventListener('progress', function(e) {
                    if (e.lengthComputable) {
                        const percent = (e.loaded / e.total) * 100;
                        $progressFill.css('width', percent + '%');
                    }
                }, false);
                return xhr;
            },
            success: function(response) {
                $progress.hide();
                $uploadBtn.show();

                if (response.success) {
                    $card.addClass('uploaded');
                    $card.find('.woo-ach-verify__document-icon').html('<span class="dashicons dashicons-yes-alt"></span>');
                    $card.find('.upload-text').text('Replace');

                    // Update state
                    const stateKey = docType === 'voided_check' ? 'bank_proof' : docType;
                    state.documents[stateKey] = true;

                    updateDocumentsUI();
                    showNotification('success', response.data.message);
                } else {
                    showNotification('error', response.data.message);
                }
            },
            error: function() {
                $progress.hide();
                $uploadBtn.show();
                showNotification('error', i18n.error || 'Upload failed');
            }
        });

        // Clear input for re-upload
        input.value = '';
    }

    /**
     * Update documents UI based on state
     */
    function updateDocumentsUI() {
        const allUploaded = state.documents.id_front && state.documents.id_back && state.documents.bank_proof;
        $('#continue-to-confirm-btn').prop('disabled', !allUploaded);
    }

    /**
     * Update confirmation step UI
     */
    function updateConfirmUI() {
        $('#review-account-type').text(state.bank.type ? state.bank.type.charAt(0).toUpperCase() + state.bank.type.slice(1) : 'Checking');
        $('#review-account-last4').text('••••' + (state.bank.last4 || ''));
    }

    /**
     * Handle final verification submission
     */
    function handleSubmitVerification() {
        if (!$('#accept-terms').is(':checked')) {
            showNotification('error', 'Please accept the terms to continue.');
            return;
        }

        const $btn = $(this);
        const $btnText = $btn.find('.btn-text');
        const $btnLoading = $btn.find('.btn-loading');

        $btn.prop('disabled', true);
        $btnText.hide();
        $btnLoading.show();

        const data = buildRequestData({
            action: 'woo_ach_complete_verification'
        });

        $.post(config.ajaxUrl, data, function(response) {
            $btn.prop('disabled', false);
            $btnText.show();
            $btnLoading.hide();

            if (response.success) {
                showNotification('success', response.data.message);
                showStep(4);

                // Redirect after delay if provided
                if (response.data.redirect) {
                    setTimeout(() => {
                        window.location.href = response.data.redirect;
                    }, 3000);
                }
            } else {
                showNotification('error', response.data.message);
            }
        }).fail(function() {
            $btn.prop('disabled', false);
            $btnText.show();
            $btnLoading.hide();
            showNotification('error', i18n.error || 'An error occurred');
        });
    }

    /**
     * Show mobile handoff QR code
     */
    function showHandoff() {
        const $content = $('#handoff-content');
        const $btn = $('#show-handoff-btn');

        $btn.prop('disabled', true);
        $btn.text('Generating...');

        $.post(config.ajaxUrl, {
            action: 'woo_ach_generate_handoff',
            nonce: config.nonce,
            order_id: config.orderId || $container.data('order-id')
        }, function(response) {
            $btn.prop('disabled', false);
            $btn.html('<span class="dashicons dashicons-smartphone"></span> Continue on Phone');

            if (response.success) {
                state.handoff.token = response.data.token;
                state.handoff.expires = response.data.expires;

                // Display QR code
                $('#handoff-qr').html(response.data.qr_svg);

                // Start countdown timer
                startHandoffTimer(response.data.expires_in);

                // Show content
                $content.slideDown();
                $btn.parent().hide();
            } else {
                showNotification('error', response.data.message);
            }
        }).fail(function() {
            $btn.prop('disabled', false);
            $btn.html('<span class="dashicons dashicons-smartphone"></span> Continue on Phone');
            showNotification('error', i18n.error || 'Failed to generate QR code');
        });
    }

    /**
     * Hide mobile handoff panel
     */
    function hideHandoff() {
        $('#handoff-content').slideUp();
        $('#show-handoff-btn').parent().show();

        if (state.timerInterval) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
        }
    }

    /**
     * Start handoff countdown timer
     */
    function startHandoffTimer(seconds) {
        if (state.timerInterval) {
            clearInterval(state.timerInterval);
        }

        const $timer = $('#handoff-timer');

        function updateTimer() {
            if (seconds <= 0) {
                clearInterval(state.timerInterval);
                $timer.text('Expired');
                $('#handoff-qr').addClass('expired');
                return;
            }

            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            $timer.text(`${mins}:${secs.toString().padStart(2, '0')}`);
            seconds--;
        }

        updateTimer();
        state.timerInterval = setInterval(updateTimer, 1000);
    }

    /**
     * Send handoff email
     */
    function sendHandoffEmail() {
        const email = $('#handoff-email').val();
        const $btn = $('#send-handoff-email-btn');

        if (!email || !isValidEmail(email)) {
            showNotification('error', 'Please enter a valid email address');
            return;
        }

        $btn.prop('disabled', true).text('Sending...');

        $.post(config.ajaxUrl, {
            action: 'woo_ach_send_handoff_email',
            nonce: config.nonce,
            order_id: config.orderId || $container.data('order-id'),
            email: email,
            token: state.handoff.token
        }, function(response) {
            $btn.prop('disabled', false).text('Send');

            if (response.success) {
                showNotification('success', response.data.message);
            } else {
                showNotification('error', response.data.message);
            }
        }).fail(function() {
            $btn.prop('disabled', false).text('Send');
            showNotification('error', i18n.error || 'Failed to send email');
        });
    }

    /**
     * Show a specific step
     */
    function showStep(stepNumber) {
        state.currentStep = stepNumber;

        $steps.hide();
        $(`#step-${stepNumber}`).show();

        updateProgressUI();

        // Scroll to top of wizard
        $('html, body').animate({
            scrollTop: $container.offset().top - 50
        }, 300);
    }

    /**
     * Update progress indicator UI
     */
    function updateProgressUI() {
        $progressSteps.each(function() {
            const step = parseInt($(this).data('step'), 10);
            $(this).removeClass('active completed');

            if (step < state.currentStep) {
                $(this).addClass('completed');
            } else if (step === state.currentStep) {
                $(this).addClass('active');
            }
        });

        // Update connectors
        $('.woo-ach-verify__progress-connector').each(function(index) {
            $(this).toggleClass('completed', index < state.currentStep - 1);
        });
    }

    /**
     * Show notification message
     */
    function showNotification(type, message) {
        // Remove existing notifications
        $('.woo-ach-verify__notification').remove();

        const $notification = $(`
            <div class="woo-ach-verify__notification woo-ach-verify__notification--${type}">
                <span class="notification-icon">${type === 'success' ? '✓' : '!'}</span>
                <span class="notification-message">${escapeHtml(message)}</span>
                <button class="notification-close">&times;</button>
            </div>
        `);

        $container.prepend($notification);

        $notification.find('.notification-close').on('click', function() {
            $notification.fadeOut(200, () => $notification.remove());
        });

        // Auto-dismiss success messages
        if (type === 'success') {
            setTimeout(() => {
                $notification.fadeOut(200, () => $notification.remove());
            }, 5000);
        }
    }

    /**
     * Validate email format
     */
    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize on DOM ready
    $(document).ready(init);

})(jQuery);
