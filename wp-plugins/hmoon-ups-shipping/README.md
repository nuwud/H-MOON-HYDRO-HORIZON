# H-Moon UPS Shipping Plugin

**Free alternative to $100/yr premium UPS plugins** using the official UPS REST API.

## Features

- ✅ Live UPS shipping rates at checkout
- ✅ Support for all major UPS services (Ground, 2-Day, Next Day, etc.)
- ✅ OAuth 2.0 authentication (modern, secure)
- ✅ Rate caching for performance
- ✅ Handling fee support (fixed + percentage)
- ✅ Fallback rates if API fails
- ✅ WooCommerce Shipping Zones compatible
- ✅ HPOS (High-Performance Order Storage) compatible
- ✅ Test/Sandbox mode for development

## Requirements

- WordPress 5.8+
- WooCommerce 5.0+
- PHP 7.4+
- UPS Developer Account (free)

## Installation

1. Upload the `hmoon-ups-shipping` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu
3. Go to **WooCommerce → Settings → Shipping → UPS (H-Moon)**
4. Enter your UPS API credentials

## Getting UPS API Credentials

1. Go to [developer.ups.com](https://developer.ups.com)
2. Create a free account
3. Create a new application
4. Select "Rating" API access
5. Copy your **Client ID** and **Client Secret**
6. Use your existing UPS account number

### Test Mode

The plugin uses UPS sandbox environment by default. **Disable test mode** for production to get real rates.

## Configuration

### Global Settings (WooCommerce → Shipping → UPS)

| Setting | Description |
|---------|-------------|
| Client ID | Your UPS API Client ID |
| Client Secret | Your UPS API Client Secret |
| Account Number | Your 6-digit UPS account number |
| Origin Postal Code | ZIP/postal code packages ship from |
| Origin Country | Country packages ship from |
| Test Mode | Use sandbox environment |

### Per-Zone Settings (Shipping Zones)

| Setting | Description |
|---------|-------------|
| Enabled Services | Which UPS services to offer |
| Handling Fee | Fixed amount added to each shipment |
| Handling Fee (%) | Percentage added to shipping cost |
| Fallback Rate | Rate to show if API fails |
| Debug Mode | Log API calls for troubleshooting |

## Available Services

| Code | Service |
|------|---------|
| 03 | UPS Ground |
| 12 | UPS 3 Day Select |
| 02 | UPS 2nd Day Air |
| 59 | UPS 2nd Day Air A.M. |
| 13 | UPS Next Day Air Saver |
| 01 | UPS Next Day Air |
| 14 | UPS Next Day Air Early |

## Troubleshooting

### Rates not showing

1. Check WooCommerce → Status → Logs for `hmoon-ups-shipping` entries
2. Verify API credentials are correct
3. Ensure origin postal code is set
4. Disable test mode for production rates

### "Access token failed" error

- Verify Client ID and Secret are correct
- Check that your UPS developer app has Rating API enabled
- Try regenerating credentials at developer.ups.com

### Rates are too high

- Ensure your account number is correct (negotiated rates require valid account)
- Check that origin postal code matches your UPS account address

## Comparison: This vs. Premium Plugins

| Feature | H-Moon UPS | Premium ($100/yr) |
|---------|------------|-------------------|
| Live rates | ✅ | ✅ |
| Shipping zones | ✅ | ✅ |
| Negotiated rates | ✅ | ✅ |
| Label printing | ❌ | ✅ |
| Tracking emails | ❌ | ✅ |
| Pickup scheduling | ❌ | ✅ |

**For label printing**, consider ShipStation ($9/mo) which handles all carriers.

## Changelog

### 1.0.0
- Initial release
- OAuth 2.0 REST API integration
- All major UPS services supported
- Rate caching
- HPOS compatible

## License

GPL v2 or later
