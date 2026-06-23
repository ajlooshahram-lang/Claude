import { Injectable } from '@nestjs/common';
import { AgentOutput } from '../agents/base-agent';

export interface MergedResponse {
  content: string;
  confidence: number;
  agentsUsed: string[];
  sources: Array<{ type: string; reference: string; freshness: string }>;
  suggestedFollowups: string[];
}

@Injectable()
export class ResponseMerger {
  /**
   * Merge multiple agent outputs into a single coherent response.
   * In production, when multiple agents contribute, a merger LLM call
   * synthesizes a unified narrative. For single-agent responses, the
   * output is used directly. Confidence is a relevance-weighted average.
   */
  async merge(outputs: AgentOutput[], originalQuery: string): Promise<MergedResponse> {
    if (outputs.length === 1) {
      return this.singleAgentResponse(outputs[0]);
    }

    // Multi-agent: combine content sections by agent
    const sections = outputs.map((output) => {
      const agentLabel = this.agentLabel(output.agentId);
      return `### ${agentLabel}\n\n${output.content}`;
    });

    const content = sections.join('\n\n');

    return {
      content,
      confidence: this.computeConfidence(outputs),
      agentsUsed: outputs.map((o) => o.agentId),
      sources: this.collectSources(outputs),
      suggestedFollowups: this.generateFollowups(outputs, originalQuery),
    };
  }

  private singleAgentResponse(output: AgentOutput): MergedResponse {
    return {
      content: output.content,
      confidence: output.confidence,
      agentsUsed: [output.agentId],
      sources: output.sources,
      suggestedFollowups: this.generateFollowups([output], ''),
    };
  }

  private computeConfidence(outputs: AgentOutput[]): number {
    // Equal weighting for now; production weights by relevance score
    const sum = outputs.reduce((acc, o) => acc + o.confidence, 0);
    return Math.round(sum / outputs.length);
  }

  private collectSources(outputs: AgentOutput[]): MergedResponse['sources'] {
    const seen = new Set<string>();
    const sources: MergedResponse['sources'] = [];
    for (const output of outputs) {
      for (const source of output.sources) {
        const key = `${source.type}:${source.reference}`;
        if (!seen.has(key)) {
          seen.add(key);
          sources.push(source);
        }
      }
    }
    return sources;
  }

  private generateFollowups(outputs: AgentOutput[], query: string): string[] {
    // Static suggestions based on which agents contributed.
    // Production generates these dynamically from response content.
    const followups: string[] = [];
    const agentIds = new Set(outputs.map((o) => o.agentId));

    if (agentIds.has('agent.investment_analyst')) {
      followups.push('What are the main risks to this thesis?');
      followups.push('How does it compare to its closest competitor?');
    }
    if (agentIds.has('agent.technical_analyst')) {
      followups.push('What are the key support and resistance levels?');
    }
    if (agentIds.has('agent.quantitative')) {
      followups.push('How would this affect my portfolio risk?');
    }

    return followups.slice(0, 3);
  }

  private agentLabel(agentId: string): string {
    const labels: Record<string, string> = {
      'agent.investment_analyst': 'Fundamental Analysis',
      'agent.technical_analyst': 'Technical Analysis',
      'agent.quantitative': 'Quantitative Analysis',
      'agent.news_intelligence': 'News & Sentiment',
      'agent.macro_economics': 'Macroeconomic Context',
      'agent.portfolio_advisor': 'Portfolio Perspective',
      'agent.education': 'Explanation',
    };
    return labels[agentId] ?? agentId;
  }
}
