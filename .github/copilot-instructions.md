# Shopify Horizon Theme - AI Coding Guide

## Architecture Overview

This is a **Shopify Horizon theme** (v3.0.1) - a modern, component-based theme with advanced web standards. Key architectural patterns:

- **Section Groups**: Header/footer use JSON group files (`header-group.json`, `footer-group.json`) that compose multiple sections
- **Component-Based JS**: All JS follows ES6 modules with import maps defined in `snippets/scripts.liquid`
- **Block-Based Sections**: Sections use Liquid blocks (`_block-name.liquid`) for modular content composition
- **TypeScript-Ready**: Full type definitions in `assets/global.d.ts` with `jsconfig.json` configuration

## Critical File Structure

```
assets/
  component.js           # Base Component class for all custom elements
  utilities.js          # Core utilities (view transitions, performance)
  critical.js           # Critical rendering scripts
  global.d.ts           # TypeScript definitions for Shopify/Theme globals
blocks/
  _*.liquid            # Reusable content blocks (prefix with underscore)
sections/
  *-group.json         # Section group compositions
snippets/
  section.liquid       # Universal section wrapper with background/overlay logic
templates/
  *.json              # Page templates using section references
```

## JavaScript Patterns

### Component Architecture
All interactive elements extend the `Component` class from `assets/component.js`:

```javascript
import { Component } from '@theme/component';

class MyComponent extends Component {
  connectedCallback() {
    super.connectedCallback();
    // Component logic here
  }
}
```

### Module Import System
Use import maps defined in `snippets/scripts.liquid`. Always import from `@theme/` namespace:
- `@theme/utilities` - Core utility functions
- `@theme/component` - Base component class
- `@theme/events` - Event handling utilities

### Performance Patterns
- Use `requestIdleCallback` from utilities for non-critical tasks
- Implement view transitions with `startViewTransition()` for smooth page changes
- Check `isLowPowerDevice()` before enabling heavy animations

## Liquid Development

### Section Structure
Every section should use the `section.liquid` snippet wrapper:
```liquid
{% render 'section', section: section %}
  <!-- Section content here -->
{% endrender %}
```

### Block Composition
Create reusable blocks in `/blocks/` with underscore prefix. Reference in sections:
```liquid
{% for block in section.blocks %}
  {% render block.type, block: block %}
{% endfor %}
```

### Settings Schema
Settings use nested structure with type presets. Common patterns:
- `color_scheme` for consistent theming
- `section_width` options: `page-width`, `full-width`
- `padding-block-start/end` for consistent spacing

## Theme-Specific Conventions

### Color Schemes
- Use `color-{{ section.settings.color_scheme }}` classes
- Scheme names: `scheme-1`, `scheme-4`, etc.
- Support inverse color schemes for overlays

### Responsive Design
- Mobile-first approach with `mobile_*` setting variants
- Use CSS custom properties for responsive values
- Container queries for component-level responsiveness

### View Transitions API
This theme uses native View Transitions API:
- Enable with `settings.page_transition_enabled`
- Product-specific transitions via `settings.transition_to_main_product`
- Custom transition types in `utilities.js` (e.g., 'product-grid')

## Development Workflow

### Asset Development
- JavaScript uses ES6 modules with strict TypeScript checking
- CSS uses modern features (container queries, custom properties)
- Import maps handle module resolution

### Section Development
1. Create section file in `/sections/`
2. Add blocks in `/blocks/` if reusable
3. Define schema with proper settings structure
4. Use `section.liquid` wrapper for consistency

### Testing Patterns
- Test with `request.design_mode` for Shopify editor
- Check `Shopify.designMode` in JavaScript
- Use `data-testid="ui-test-*"` attributes for testing

## Key Integrations

### Shopify Features
- Section Groups for header/footer composition
- Predictive Search with dedicated endpoints
- Cart API with drawer implementation
- Product recommendations engine

### Performance Features
- Critical CSS/JS loading patterns
- Lazy loading for non-critical components
- Resource hints and preloading
- View transitions for smooth navigation

### Accessibility
- Proper focus management via `@theme/focus`
- Skip links and ARIA patterns
- Reduced motion support throughout

## Common Tasks

- **Add new section**: Create in `/sections/`, add schema, render blocks
- **Create component**: Extend `Component` class, register custom element
- **Style updates**: Use CSS custom properties, follow color scheme patterns
- **Performance optimization**: Use utilities for idle callbacks and low-power detection

This theme prioritizes modern web standards, component reusability, and performance optimization while maintaining Shopify theme conventions.