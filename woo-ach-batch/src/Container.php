<?php
/**
 * Service Container for dependency injection
 *
 * @package Nuwud\WooAchBatch
 */

namespace Nuwud\WooAchBatch;

/**
 * Simple service container implementation
 */
class Container {

    /**
     * Registered services
     *
     * @var array<string, callable|object>
     */
    private array $services = [];

    /**
     * Resolved service instances (singletons)
     *
     * @var array<string, object>
     */
    private array $resolved = [];

    /**
     * Register all plugin services
     */
    public function register_services(): void {
        // Core services - registered first as other services depend on them
        $this->singleton( 'settings', fn() => new Admin\Settings() );
        $this->singleton( 'encryption', fn() => new Security\Encryption() );
        $this->singleton( 'audit_log', fn() => new Security\AuditLog() );
        $this->singleton( 'rate_limiter', fn() => new Security\RateLimiter() );

        // Secure settings wrapper (handles SFTP credential encryption)
        $this->singleton( 'secure_settings', fn() => new Security\SecureSettings(
            $this->get( 'encryption' ),
            $this->get( 'settings' ),
            $this->get( 'audit_log' )
        ));

        // Private storage for secure file handling
        $this->singleton( 'private_storage', fn() => new Security\PrivateStorage() );

        // Order management
        $this->singleton( 'order_statuses', fn() => new Order\OrderStatuses() );
        $this->singleton( 'order_meta', fn() => new Order\OrderMeta( $this->get( 'encryption' ) ) );

        // Verification services
        $this->singleton( 'verification_manager', fn() => new Verification\VerificationManager() );

        // Batch processing
        $this->singleton( 'batch_repository', fn() => new Batch\BatchRepository() );
        $this->singleton( 'mapping_config', fn() => new Nacha\MappingConfig( $this->get( 'settings' ) ) );

        // NachaBuilder with secure storage and optional mapping config
        $this->singleton( 'nacha_builder', fn() => new Nacha\NachaBuilder(
            $this->get( 'settings' ),
            $this->get( 'private_storage' ),
            $this->get( 'mapping_config' )
        ));

        // BatchRunner with secure storage
        $this->singleton( 'batch_runner', fn() => new Batch\BatchRunner(
            $this->get( 'batch_repository' ),
            $this->get( 'nacha_builder' ),
            $this->get( 'sftp_client' ),
            $this->get( 'audit_log' ),
            $this->get( 'settings' ),
            $this->get( 'private_storage' )
        ));

        // SFTP (uses secure settings for decrypted credentials)
        $this->singleton( 'sftp_client', fn() => Sftp\SftpClientFactory::create(
            $this->get( 'settings' ),
            $this->get( 'secure_settings' )
        ));

        // Scheduler
        $this->singleton( 'scheduler', fn() => new Cron\Scheduler( $this->get( 'batch_runner' ), $this->get( 'settings' ) ) );

        // KYC Document handling with rate limiter, audit log, and private storage
        $this->singleton( 'kyc_handler', function() {
            $handler = new Kyc\DocumentHandler();
            $handler->set_rate_limiter( $this->get( 'rate_limiter' ) );
            $handler->set_audit_log( $this->get( 'audit_log' ) );
            $handler->set_private_storage( $this->get( 'private_storage' ) );
            return $handler;
        });

        // Reconciliation
        $this->singleton( 'reconciliation', fn() => new Reconciliation\ReconciliationProcessor() );

        // Admin
        $this->singleton( 'admin', fn() => new Admin\Admin(
            $this->get( 'settings' ),
            $this->get( 'batch_repository' ),
            $this->get( 'batch_runner' ),
            $this->get( 'audit_log' )
        ));

        // REST API
        $this->singleton( 'rest_api', fn() => new Api\RestController() );

        // Verification Wizard services
        $this->singleton( 'handoff_token', function() {
            $service = new Security\HandoffTokenService();
            $service->set_rate_limiter( $this->get( 'rate_limiter' ) );
            $service->set_audit_log( $this->get( 'audit_log' ) );
            return $service;
        });

        $this->singleton( 'bank_validator', fn() => new Validation\BankValidator() );

        $this->singleton( 'qr_generator', fn() => new Security\QrCodeGenerator() );

        $this->singleton( 'verification_wizard', function() {
            $wizard = new Frontend\VerificationWizard(
                $this->get( 'handoff_token' ),
                $this->get( 'bank_validator' ),
                $this->get( 'kyc_handler' ),
                $this->get( 'order_meta' )
            );
            $wizard->set_rate_limiter( $this->get( 'rate_limiter' ) );
            $wizard->set_audit_log( $this->get( 'audit_log' ) );
            $wizard->set_qr_generator( $this->get( 'qr_generator' ) );
            return $wizard;
        });

        // Register WooCommerce emails
        add_filter( 'woocommerce_email_classes', function( $emails ) {
            $emails['WC_ACH_Verification_Submitted'] = new Emails\VerificationSubmittedEmail();
            return $emails;
        });
    }

    /**
     * Register a singleton service
     *
     * @param string   $id       Service identifier
     * @param callable $resolver Service resolver callable
     */
    public function singleton( string $id, callable $resolver ): void {
        $this->services[ $id ] = $resolver;
    }

    /**
     * Register a factory service (new instance each time)
     *
     * @param string   $id       Service identifier
     * @param callable $resolver Service resolver callable
     */
    public function factory( string $id, callable $resolver ): void {
        $this->services[ $id ] = [ 'factory' => $resolver ];
    }

    /**
     * Get a service instance
     *
     * @param string $id Service identifier
     * @return mixed
     * @throws \RuntimeException If service not found
     */
    public function get( string $id ): mixed {
        // Return already resolved singleton
        if ( isset( $this->resolved[ $id ] ) ) {
            return $this->resolved[ $id ];
        }

        // Check if service is registered
        if ( ! isset( $this->services[ $id ] ) ) {
            throw new \RuntimeException( "Service '{$id}' not found in container." );
        }

        $service = $this->services[ $id ];

        // Factory pattern - new instance each time
        if ( is_array( $service ) && isset( $service['factory'] ) ) {
            return $service['factory']();
        }

        // Singleton pattern - resolve once and cache
        if ( is_callable( $service ) ) {
            $this->resolved[ $id ] = $service();
            return $this->resolved[ $id ];
        }

        return $service;
    }

    /**
     * Check if service exists
     *
     * @param string $id Service identifier
     * @return bool
     */
    public function has( string $id ): bool {
        return isset( $this->services[ $id ] ) || isset( $this->resolved[ $id ] );
    }

    /**
     * Set a pre-resolved service instance
     *
     * @param string $id       Service identifier
     * @param mixed  $instance Service instance
     */
    public function set( string $id, mixed $instance ): void {
        $this->resolved[ $id ] = $instance;
    }
}
