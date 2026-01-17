import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Agent instruction files location - relative to extension
function getAgentsDir(extensionUri: vscode.Uri): string {
  // Go up from out/ to extension root, then up to workspace, then into agents/
  return path.join(extensionUri.fsPath, '..', 'agents');
}

interface AgentConfig {
  id: string;
  name: string;
  instructionFile: string;
  description: string;
}

const AGENTS: AgentConfig[] = [
  {
    id: 'hmoon.product-health-auditor',
    name: 'health-auditor',
    instructionFile: 'product-health-auditor.agent.md',
    description: 'Score products and generate prioritized enrichment tasks'
  },
  {
    id: 'hmoon.pos-shopify-matcher',
    name: 'pos-matcher',
    instructionFile: 'pos-shopify-matcher.agent.md',
    description: 'Align POS inventory to Shopify variants with fuzzy matching'
  },
  {
    id: 'hmoon.brand-normalizer',
    name: 'brand-normalizer',
    instructionFile: 'brand-normalizer.agent.md',
    description: 'Detect and normalize brand names from 250+ registry'
  },
  {
    id: 'hmoon.category-classifier',
    name: 'category-classifier',
    instructionFile: 'category-classifier.agent.md',
    description: 'Assign products to categories with priority conflict resolution'
  },
  {
    id: 'hmoon.safe-shopify-operator',
    name: 'safe-operator',
    instructionFile: 'safe-shopify-operator.agent.md',
    description: 'Execute Shopify mutations with dry-run guardrails'
  },
  {
    id: 'hmoon.variant-consolidator',
    name: 'variant-consolidator',
    instructionFile: 'variant-consolidator.agent.md',
    description: 'Convert WooCommerce grouped to Shopify multi-variant'
  },
  {
    id: 'hmoon.liquid-theme-helper',
    name: 'theme-helper',
    instructionFile: 'liquid-theme-helper.agent.md',
    description: 'Assist with Shopify Horizon theme development'
  },
  {
    id: 'hmoon.repo-archeologist',
    name: 'repo-archeologist',
    instructionFile: 'repo-archeologist.agent.md',
    description: 'Index existing tooling to prevent redundant work'
  },
  {
    id: 'hmoon.shopify-compliance-auditor',
    name: 'compliance-auditor',
    instructionFile: 'shopify-compliance-auditor.agent.md',
    description: 'Final gate for Shopify compliance and accessibility'
  }
];

/**
 * Load agent instructions from markdown file
 */
function loadAgentInstructions(agentsDir: string, filename: string): string {
  try {
    const filePath = path.join(agentsDir, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Remove YAML frontmatter if present
    const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
    if (frontmatterMatch) {
      return content.slice(frontmatterMatch[0].length).trim();
    }
    return content.trim();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // Use output channel instead of console for VS Code extensions
    vscode.window.showWarningMessage(`Failed to load agent instructions from ${filename}: ${message}`);
    return '';
  }
}

/**
 * Create a chat request handler for an agent
 */
function createAgentHandler(agentsDir: string, config: AgentConfig): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    
    // Load agent instructions
    const instructions = loadAgentInstructions(agentsDir, config.instructionFile);
    
    if (!instructions) {
      stream.markdown(`⚠️ Could not load instructions for ${config.name}. Check that \`agents/${config.instructionFile}\` exists.`);
      return {};
    }

    // Build the prompt with agent instructions
    const systemPrompt = `You are the ${config.name} agent. Follow these instructions exactly:

${instructions}

---
Now respond to the user's request following the above instructions.`;

    try {
      // Get a language model
      const models = await vscode.lm.selectChatModels({ 
        vendor: 'copilot', 
        family: 'gpt-4o' 
      });

      if (models.length === 0) {
        stream.markdown('❌ No language model available. Please ensure GitHub Copilot is active.');
        return {};
      }

      const model = models[0];

      // Build messages array
      const messages: vscode.LanguageModelChatMessage[] = [
        vscode.LanguageModelChatMessage.User(systemPrompt),
        vscode.LanguageModelChatMessage.User(request.prompt)
      ];

      // Send request and stream response
      const chatResponse = await model.sendRequest(messages, {}, token);
      
      for await (const fragment of chatResponse.text) {
        stream.markdown(fragment);
      }

    } catch (err: unknown) {
      if (err instanceof vscode.LanguageModelError) {
        stream.markdown(`❌ Language model error: ${err.message}`);
      } else {
        throw err;
      }
    }

    return {};
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const agentsDir = getAgentsDir(context.extensionUri);

  // Register each agent as a chat participant
  for (const agentConfig of AGENTS) {
    const handler = createAgentHandler(agentsDir, agentConfig);
    const participant = vscode.chat.createChatParticipant(agentConfig.id, handler);
    
    context.subscriptions.push(participant);
  }
}

export function deactivate(): void {
  // Cleanup if needed
}
