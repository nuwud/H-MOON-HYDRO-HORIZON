<?php
/**
 * Verification Interface
 *
 * Defines the contract for bank account verification methods.
 *
 * @package Nuwud\WooAchBatch\Verification
 */

namespace Nuwud\WooAchBatch\Verification;

/**
 * Interface for bank account verification providers
 */
interface VerificationInterface {

    /**
     * Get the unique identifier for this verifier
     *
     * @return string
     */
    public function getId(): string;

    /**
     * Get the display name for this verifier
     *
     * @return string
     */
    public function getName(): string;

    /**
     * Check if this verifier is available and configured
     *
     * @return bool
     */
    public function isAvailable(): bool;

    /**
     * Start the verification process for a customer
     *
     * @param int   $order_id    WooCommerce order ID
     * @param int   $customer_id WooCommerce customer ID
     * @param array $bank_data   Bank account data (routing, account, type)
     * @return array{success: bool, message: string, data?: array}
     */
    public function startVerification( int $order_id, int $customer_id, array $bank_data ): array;

    /**
     * Complete/confirm the verification
     *
     * @param int   $order_id         WooCommerce order ID
     * @param int   $customer_id      WooCommerce customer ID
     * @param array $verification_data Data submitted by customer (e.g., micro-deposit amounts)
     * @return array{success: bool, message: string, verified?: bool}
     */
    public function completeVerification( int $order_id, int $customer_id, array $verification_data ): array;

    /**
     * Check the current verification status
     *
     * @param int $order_id    WooCommerce order ID
     * @param int $customer_id WooCommerce customer ID
     * @return array{status: string, message: string}
     */
    public function getVerificationStatus( int $order_id, int $customer_id ): array;

    /**
     * Cancel an in-progress verification
     *
     * @param int $order_id    WooCommerce order ID
     * @param int $customer_id WooCommerce customer ID
     * @return bool
     */
    public function cancelVerification( int $order_id, int $customer_id ): bool;
}
