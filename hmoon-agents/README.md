# H-Moon Hydro Agents

A VS Code extension that registers custom GitHub Copilot chat participants for the H-Moon Hydro migration pipeline.

## Available Agents

| Agent | Chat Command | Purpose |
|-------|--------------|---------|
| Product Health Auditor | `@health-auditor` | Score products and generate prioritized enrichment tasks |
| POS-Shopify Matcher | `@pos-matcher` | Align POS inventory to Shopify variants with fuzzy matching |
| Brand Normalizer | `@brand-normalizer` | Detect and normalize brand names from 250+ registry |
| Category Classifier | `@category-classifier` | Assign products to categories with priority conflict resolution |
| Safe Shopify Operator | `@safe-operator` | Execute Shopify mutations with dry-run guardrails |
| Variant Consolidator | `@variant-consolidator` | Convert WooCommerce grouped to Shopify multi-variant |
| Liquid Theme Helper | `@theme-helper` | Assist with Shopify Horizon theme development |
| Repo Archeologist | `@repo-archeologist` | Index existing tooling to prevent redundant work |
| Shopify Compliance Auditor | `@compliance-auditor` | Final gate for Shopify compliance and accessibility |

## Installation

### Development Mode

1. Navigate to the extension folder:
   ```bash
   cd hmoon-agents
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Press `F5` in VS Code to launch the Extension Development Host

### Usage

Once activated, use the agents in Copilot Chat:

```
@health-auditor What products need work?
@pos-matcher Match SKU ABC-123 to POS inventory
@brand-normalizer Is "fox farms" a valid brand?
@safe-operator Show me a dry-run of the enrichment script
```

## Agent Instructions

Each agent reads its instructions from the `agents/` folder in the workspace root:

```
agents/
├── product-health-auditor.agent.md
├── pos-shopify-matcher.agent.md
├── brand-normalizer.agent.md
├── category-classifier.agent.md
├── safe-shopify-operator.agent.md
├── variant-consolidator.agent.md
├── liquid-theme-helper.agent.md
├── repo-archeologist.agent.md
└── shopify-compliance-auditor.agent.md
```

To modify agent behavior, edit the corresponding `.agent.md` file.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  VS Code Chat                                                │
│    @health-auditor "What needs work?"                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  hmoon-agents Extension                                      │
│    ├── Loads agents/*.agent.md instructions                 │
│    ├── Creates chat participant handlers                    │
│    └── Injects instructions as system prompt                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub Copilot Language Model                               │
│    ├── Receives: System instructions + User prompt          │
│    └── Returns: Streamed markdown response                  │
└─────────────────────────────────────────────────────────────┘
```

## Handoffs Between Agents

To hand off to another agent, simply mention them in your follow-up:

```
@health-auditor Audit products with missing vendors

[Agent responds with list]

@brand-normalizer Normalize the vendors for the products listed above
```

The chat history is preserved across agent switches.

## Requirements

- VS Code 1.93.0 or later
- GitHub Copilot extension
- GitHub Copilot Chat extension
