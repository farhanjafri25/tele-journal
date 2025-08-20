import { Injectable } from '@nestjs/common';
import { JournalService } from './journal.service';
import { AiService, ChatMessage } from '../../ai/services/ai.service';
import { JournalEntity } from '../entites/journal.entity';

export interface QueryResponse {
  answer: string;
  relevantEntries: JournalEntity[];
  confidence: number;
}

@Injectable()
export class JournalQueryService {
  constructor(
    private readonly journalService: JournalService,
    private readonly aiService: AiService,
  ) {}

  async queryJournal(userId: number, query: string): Promise<QueryResponse> {
    const relevantEntries = await this.journalService.searchSimilarEntries(
      query,
      userId,
      10, 
    );
    console.log(`relevantEntries`, relevantEntries);
    

    if (relevantEntries.length === 0) {
      return {
        answer: "I couldn't find any relevant journal entries to answer your question. Try adding more journal entries or rephrasing your question.",
        relevantEntries: [],
        confidence: 0,
      };
    }

    const context = this.prepareContext(relevantEntries);
    console.log(`context prepared for journal query`, context);
    
    const answer = await this.generateAnswer(query, context);
    
    const confidence = this.calculateConfidence(relevantEntries);

    return {
      answer,
      relevantEntries: relevantEntries.slice(0, 5), 
      confidence,
    };
  }

  private prepareContext(entries: JournalEntity[] | any[]): string {
    const contextEntries = entries.map((entry, index) => {
      const date = entry?.createdAt?.toLocaleDateString() || entry.created_at?.toLocaleDateString();
      const tags = entry.tags && entry.tags.length > 0 ? ` [Tags: ${entry.tags.join(', ')}]` : '';
      return `Entry ${index + 1} (${date})${tags}:\n${entry.entry || entry.journal_entry}`;
    });

    return contextEntries.join('\n\n---\n\n');
  }

  private async generateAnswer(query: string, context: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a helpful AI assistant that helps users understand and reflect on their journal entries.

        Your role is to:
        1. Answer questions about the user's journal entries based on the provided context
        2. Provide insights, patterns, and reflections from their journaling
        3. Be empathetic and supportive in your responses
        4. Reference specific entries when relevant
        5. If the context doesn't contain enough information to answer the question, say so honestly

        Always respond in a warm, understanding tone as if you're a thoughtful friend who has been following their journey.`,
      },
      {
        role: 'user',
        content: `Based on my journal entries below, please answer this question: "${query}"

Context from my journal entries:
${context}`,
      },
    ];

    return this.aiService.chat(messages);
  }

  private calculateConfidence(entries: JournalEntity[]): number {
    if (entries.length === 0) return 0;
    const baseConfidence = Math.min(entries.length / 5, 1); 
    return Math.round(baseConfidence * 100);
  }

  async getJournalSummary(userId: number, days?: number): Promise<string> {
    const entries = await this.journalService.getUserEntries(userId, days ? days : 30);
    
    if (entries.length === 0) {
      return "You haven't written any journal entries yet. Start journaling to get insights about your thoughts and experiences!";
    }

    const context = this.prepareContext(entries);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a helpful AI assistant that provides thoughtful summaries of journal entries.
        Create a warm, insightful summary that highlights:
        1. Main themes and patterns
        2. Emotional journey
        3. Notable events or experiences
        4. Growth or changes over time
        5. Positive observations and encouragement

        Keep the summary concise but meaningful, like a caring friend reflecting on their journey.`,
      },
      {
        role: 'user',
        content: `Please provide a summary of my recent journal entries:

${context}`,
      },
    ];

    return this.aiService.chat(messages);
  }
}
