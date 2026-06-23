export interface AgentOutput {
  agentId: string;
  content: string;
  confidence: number;
  sources: Array<{ type: string; reference: string; freshness: string }>;
  tokensUsed: number;
}

export abstract class BaseAgent {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;

  abstract execute(query: string, context: any): Promise<AgentOutput>;

  protected buildDisclaimer(): string {
    return '\n\n*This analysis is for educational and informational purposes only. It does not constitute financial advice.*';
  }
}
