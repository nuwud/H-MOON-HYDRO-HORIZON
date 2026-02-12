<?php
/**
 * Admin Settings Template
 *
 * @package Nuwud\WooAchBatch
 * @var \Nuwud\WooAchBatch\Admin\Settings $settings
 * @var array $sftp_implementations
 * @var \Nuwud\WooAchBatch\Verification\VerificationManager $verification_manager
 * @var array $tabs
 * @var string $current_tab
 */

defined( 'ABSPATH' ) || exit;
?>

<div class="wrap woo-ach-batch-settings">
    <h1><?php esc_html_e( 'ACH Batch Settings', 'woo-ach-batch' ); ?></h1>

    <?php settings_errors( 'woo_ach_batch' ); ?>

    <!-- Tabs -->
    <nav class="nav-tab-wrapper">
        <?php foreach ( $tabs as $tab_id => $tab_label ) : ?>
            <a href="<?php echo esc_url( add_query_arg( 'tab', $tab_id ) ); ?>" 
               class="nav-tab <?php echo $current_tab === $tab_id ? 'nav-tab-active' : ''; ?>">
                <?php echo esc_html( $tab_label ); ?>
            </a>
        <?php endforeach; ?>
    </nav>

    <form method="post" action="">
        <?php wp_nonce_field( 'woo_ach_settings' ); ?>
        <input type="hidden" name="woo_ach_save_settings" value="1">

        <table class="form-table">
            <?php if ( $current_tab === 'general' ) : ?>
                <!-- General Settings -->
                <tr>
                    <th scope="row"><?php esc_html_e( 'Enable ACH Payments', 'woo-ach-batch' ); ?></th>
                    <td>
                        <label>
                            <input type="checkbox" name="enabled" value="yes" 
                                   <?php checked( $settings->get_option( 'enabled', 'no' ), 'yes' ); ?>>
                            <?php esc_html_e( 'Enable ACH batch payment gateway', 'woo-ach-batch' ); ?>
                        </label>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Test Mode', 'woo-ach-batch' ); ?></th>
                    <td>
                        <label>
                            <input type="checkbox" name="test_mode" value="yes" 
                                   <?php checked( $settings->get_option( 'test_mode', 'yes' ), 'yes' ); ?>>
                            <?php esc_html_e( 'Enable test mode (no actual NACHA files sent)', 'woo-ach-batch' ); ?>
                        </label>
                    </td>
                </tr>

            <?php elseif ( $current_tab === 'nacha' ) : ?>
                <!-- NACHA Settings -->
                <tr>
                    <th scope="row"><?php esc_html_e( 'Immediate Destination (ODFI Routing)', 'woo-ach-batch' ); ?></th>
                    <td>
                        <input type="text" name="odfi_routing" class="regular-text" 
                               value="<?php echo esc_attr( $settings->get_option( 'odfi_routing' ) ); ?>"
                               placeholder="091000019">
                        <p class="description"><?php esc_html_e( 'Your bank\'s routing number (9 digits)', 'woo-ach-batch' ); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Immediate Destination Name', 'woo-ach-batch' ); ?></th>
                    <td>
                        <input type="text" name="odfi_name" class="regular-text" 
                               value="<?php echo esc_attr( $settings->get_option( 'odfi_name' ) ); ?>"
                               placeholder="YOUR BANK NAME">
                        <p class="description"><?php esc_html_e( 'Your bank\'s name (max 23 characters)', 'woo-ach-batch' ); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Immediate Origin (Company ID)', 'woo-ach-batch' ); ?></th>
                    <td>
                        <input type="text" name="company_id" class="regular-text" 
                               value="<?php echo esc_attr( $settings->get_option( 'company_id' ) ); ?>"
                               placeholder="1234567890">
                        <p class="description"><?php esc_html_e( 'Your company identifier (usually EIN with leading 1)', 'woo-ach-batch' ); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Immediate Origin Name', 'woo-ach-batch' ); ?></th>
                    <td>
                        <input type="text" name="company_name" class="regular-text" 
                               value="<?php echo esc_attr( $settings->get_option( 'company_name' ) ); ?>"
                               placeholder="YOUR COMPANY NAME">
                        <p class="description"><?php esc_html_e( 'Your company name (max 23 characters)', 'woo-ach-batch' ); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Company Entry Description', 'woo-ach-batch' ); ?></th>
                    <td>
                        <input type="text" name="company_entry_description" class="regular-text" maxlength="10"
                               value="<?php echo esc_attr( $settings->get_option( 'company_entry_description', 'PAYMENT' ) ); ?>">
                        <p class="description"><?php esc_html_e( 'Description on customer bank statement (max 10 chars)', 'woo-ach-batch' ); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Originator DFI ID', 'woo-ach-batch' ); ?></th>
                    <td>
                        <input type="text" name="originator_dfi" class="regular-text" 
                               value="<?php echo esc_attr( $settings->get_option( 'originator_dfi' ) ); ?>"
                               placeholder="09100001">
                        <p class="description"><?php esc_html_e( 'First 8 digits of ODFI routing number', 'woo-ach-batch' ); ?></p>
                    </td>
                </tr>
                <tr>
                    <td colspan="2">
                        <div class="notice notice-info inline">
                            <p>
                                <strong><?php esc_html_e( 'TODO: Additional NACHA fields will be configured based on Dan\'s processor spec on Monday.', 'woo-ach-batch' ); ?></strong>
                            </p>
                        </div>
                    </td>
                </tr>

            <?php elseif ( $current_tab === 'sftp' ) : ?>
                <!-- SFTP Settings -->
                <tr>
                    <th scope="row"><?php esc_html_e( 'Available SFTP Libraries', 'woo-ach-batch' ); ?></th>
                    <td>
                        <?php if ( $sftp_implementations['phpseclib'] ) : ?>
                            <span class="dashicons dashicons-yes" style="color: green;"></span> phpseclib (installed)
                        <?php else : ?>
                            <span class="dashicons dashicons-no" style="color: red;"></span> phpseclib (not installed)
                        <?php endif; ?>
                        <br>
                        <?php if ( $sftp_implementations['ssh2'] ) : ?>
                            <span class="dashicons dashicons-yes" style="color: green;"></span> ssh2 extension (available)
                        <?php else : ?>
                            <span class="dashicons dashicons-no" style="color: #999;"></span> ssh2 extension (not available)
                        <?php endif; ?>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'SFTP Host', 'woo-ach-batch' ); ?></th>
                    <td>
                        <input type="text" name="sftp_host" class="regular-text" 
                               value="<?php echo esc_attr( $settings->get_option( 'sftp_host' ) ); ?>"
                               placeholder="sftp.processor.com">
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'SFTP Port', 'woo-ach-batch' ); ?></th>
                    <td>
                        <input type="number" name="sftp_port" class="small-text" 
                               value="<?php echo esc_attr( $settings->get_option( 'sftp_port', 22 ) ); ?>">
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Authentication Type', 'woo-ach-batch' ); ?></th>
                    <td>
                        <select name="sftp_auth_type">
                            <option value="password" <?php selected( $settings->get_option( 'sftp_auth_type' ), 'password' ); ?>>
                                <?php esc_html_e( 'Password', 'woo-ach-batch' ); ?>
                            </option>
                            <option value="key" <?php selected( $settings->get_option( 'sftp_auth_type' ), 'key' ); ?>>
                                <?php esc_html_e( 'Private Key', 'woo-ach-batch' ); ?>
                            </option>
                        </select>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'SFTP Username', 'woo-ach-batch' ); ?></th>
                    <td>
                        <input type="text" name="sftp_username" class="regular-text" 
                               value="<?php echo esc_attr( $settings->get_option( 'sftp_username' ) ); ?>">
                    </td>
                </tr>
                <tr class="sftp-password-row">
                    <th scope="row"><?php esc_html_e( 'SFTP Password', 'woo-ach-batch' ); ?></th>
                    <td>
                        <input type="password" name="sftp_password" class="regular-text" 
                               placeholder="<?php echo $settings->has_encrypted_value( 'sftp_password_encrypted' ) ? '••••••••' : ''; ?>">
                        <p class="description"><?php esc_html_e( 'Leave blank to keep existing password', 'woo-ach-batch' ); ?></p>
                    </td>
                </tr>
                <tr class="sftp-key-row">
                    <th scope="row"><?php esc_html_e( 'Private Key Path', 'woo-ach-batch' ); ?></th>
                    <td>
                        <input type="text" name="sftp_private_key_path" class="regular-text" 
                               value="<?php echo esc_attr( $settings->get_option( 'sftp_private_key_path' ) ); ?>"
                               placeholder="/path/to/private/key">
                        <p class="description"><?php esc_html_e( 'Absolute path to SSH private key file', 'woo-ach-batch' ); ?></p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Remote Path', 'woo-ach-batch' ); ?></th>
                    <td>
                        <input type="text" name="sftp_remote_path" class="regular-text" 
                               value="<?php echo esc_attr( $settings->get_option( 'sftp_remote_path', '/outgoing' ) ); ?>"
                               placeholder="/outgoing">
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Test Connection', 'woo-ach-batch' ); ?></th>
                    <td>
                        <button type="button" id="test-sftp" class="button">
                            <?php esc_html_e( 'Test SFTP Connection', 'woo-ach-batch' ); ?>
                        </button>
                        <span id="sftp-test-result"></span>
                    </td>
                </tr>

            <?php elseif ( $current_tab === 'verification' ) : ?>
                <!-- Verification Settings -->
                <tr>
                    <th scope="row"><?php esc_html_e( 'Verification Method', 'woo-ach-batch' ); ?></th>
                    <td>
                        <select name="verification_method">
                            <?php foreach ( $verification_manager->getVerifierOptions() as $id => $label ) : ?>
                                <option value="<?php echo esc_attr( $id ); ?>" 
                                        <?php selected( $settings->get_option( 'verification_method', 'manual' ), $id ); ?>>
                                    <?php echo esc_html( $label ); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </td>
                </tr>
                <tr class="plaid-row">
                    <th scope="row"><?php esc_html_e( 'Plaid Client ID', 'woo-ach-batch' ); ?></th>
                    <td>
                        <input type="text" name="plaid_client_id" class="regular-text" 
                               value="<?php echo esc_attr( $settings->get_option( 'plaid_client_id' ) ); ?>">
                    </td>
                </tr>
                <tr class="plaid-row">
                    <th scope="row"><?php esc_html_e( 'Plaid Secret', 'woo-ach-batch' ); ?></th>
                    <td>
                        <input type="password" name="plaid_secret" class="regular-text" 
                               placeholder="<?php echo $settings->has_encrypted_value( 'plaid_secret_encrypted' ) ? '••••••••' : ''; ?>">
                        <p class="description"><?php esc_html_e( 'Leave blank to keep existing secret', 'woo-ach-batch' ); ?></p>
                    </td>
                </tr>
                <tr class="plaid-row">
                    <th scope="row"><?php esc_html_e( 'Plaid Environment', 'woo-ach-batch' ); ?></th>
                    <td>
                        <select name="plaid_environment">
                            <option value="sandbox" <?php selected( $settings->get_option( 'plaid_environment' ), 'sandbox' ); ?>>
                                Sandbox
                            </option>
                            <option value="development" <?php selected( $settings->get_option( 'plaid_environment' ), 'development' ); ?>>
                                Development
                            </option>
                            <option value="production" <?php selected( $settings->get_option( 'plaid_environment' ), 'production' ); ?>>
                                Production
                            </option>
                        </select>
                    </td>
                </tr>
                <tr class="micro-deposit-row">
                    <th scope="row"><?php esc_html_e( 'Enable Micro-Deposits', 'woo-ach-batch' ); ?></th>
                    <td>
                        <label>
                            <input type="checkbox" name="enable_micro_deposits" value="yes" 
                                   <?php checked( $settings->get_option( 'enable_micro_deposits', 'no' ), 'yes' ); ?>>
                            <?php esc_html_e( 'Allow micro-deposit verification (requires processor support)', 'woo-ach-batch' ); ?>
                        </label>
                    </td>
                </tr>

            <?php elseif ( $current_tab === 'schedule' ) : ?>
                <!-- Schedule Settings -->
                <tr>
                    <th scope="row"><?php esc_html_e( 'Export Times', 'woo-ach-batch' ); ?></th>
                    <td>
                        <p>
                            <label>
                                <input type="checkbox" name="export_times[]" value="13:00" 
                                       <?php checked( in_array( '13:00', $settings->get_option( 'export_times', [ '13:00', '00:00' ] ), true ) ); ?>>
                                1:00 PM (13:00)
                            </label>
                        </p>
                        <p>
                            <label>
                                <input type="checkbox" name="export_times[]" value="00:00" 
                                       <?php checked( in_array( '00:00', $settings->get_option( 'export_times', [ '13:00', '00:00' ] ), true ) ); ?>>
                                12:00 AM (00:00)
                            </label>
                        </p>
                        <p class="description">
                            <?php esc_html_e( 'Times when batch exports are automatically triggered.', 'woo-ach-batch' ); ?>
                        </p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Timezone', 'woo-ach-batch' ); ?></th>
                    <td>
                        <select name="timezone">
                            <option value="America/Los_Angeles" <?php selected( $settings->get_option( 'timezone', 'America/Los_Angeles' ), 'America/Los_Angeles' ); ?>>
                                Pacific Time (Los Angeles)
                            </option>
                            <option value="America/Denver" <?php selected( $settings->get_option( 'timezone' ), 'America/Denver' ); ?>>
                                Mountain Time (Denver)
                            </option>
                            <option value="America/Chicago" <?php selected( $settings->get_option( 'timezone' ), 'America/Chicago' ); ?>>
                                Central Time (Chicago)
                            </option>
                            <option value="America/New_York" <?php selected( $settings->get_option( 'timezone' ), 'America/New_York' ); ?>>
                                Eastern Time (New York)
                            </option>
                        </select>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><?php esc_html_e( 'Next Scheduled Export', 'woo-ach-batch' ); ?></th>
                    <td>
                        <?php
                        $next_export = wp_next_scheduled( 'woo_ach_batch_export_1300' );
                        $next_midnight = wp_next_scheduled( 'woo_ach_batch_export_0000' );
                        $next = min( array_filter( [ $next_export, $next_midnight ] ) );
                        if ( $next ) {
                            echo esc_html( date_i18n( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), $next ) );
                        } else {
                            esc_html_e( 'Not scheduled', 'woo-ach-batch' );
                        }
                        ?>
                    </td>
                </tr>
            <?php endif; ?>
        </table>

        <?php submit_button(); ?>
    </form>
</div>

<script>
jQuery(document).ready(function($) {
    // Toggle SFTP auth fields
    function toggleSftpAuthFields() {
        var authType = $('select[name="sftp_auth_type"]').val();
        $('.sftp-password-row').toggle(authType === 'password');
        $('.sftp-key-row').toggle(authType === 'key');
    }
    toggleSftpAuthFields();
    $('select[name="sftp_auth_type"]').change(toggleSftpAuthFields);

    // Toggle verification method fields
    function toggleVerificationFields() {
        var method = $('select[name="verification_method"]').val();
        $('.plaid-row').toggle(method === 'plaid');
        $('.micro-deposit-row').toggle(method === 'micro_deposit');
    }
    toggleVerificationFields();
    $('select[name="verification_method"]').change(toggleVerificationFields);

    // Test SFTP connection
    $('#test-sftp').click(function() {
        var $btn = $(this);
        var $result = $('#sftp-test-result');
        
        $btn.prop('disabled', true).text('<?php esc_html_e( 'Testing...', 'woo-ach-batch' ); ?>');
        $result.html('');

        $.ajax({
            url: wooAchBatch.ajaxUrl,
            type: 'POST',
            data: {
                action: 'woo_ach_test_sftp',
                nonce: wooAchBatch.nonce
            },
            success: function(response) {
                $btn.prop('disabled', false).text('<?php esc_html_e( 'Test SFTP Connection', 'woo-ach-batch' ); ?>');
                if (response.success) {
                    $result.html('<span style="color: green;">' + response.data.message + '</span>');
                } else {
                    $result.html('<span style="color: red;">' + response.data.message + '</span>');
                }
            },
            error: function() {
                $btn.prop('disabled', false).text('<?php esc_html_e( 'Test SFTP Connection', 'woo-ach-batch' ); ?>');
                $result.html('<span style="color: red;"><?php esc_html_e( 'Connection test failed', 'woo-ach-batch' ); ?></span>');
            }
        });
    });
});
</script>
