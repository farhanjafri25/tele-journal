import { Injectable } from '@nestjs/common';
import { JournalRepository, CreateJournalDto } from '../repositories/journal.repository';
import { JournalEntity } from '../entites/journal.entity';
import { AiService } from '../../ai/services/ai.service';

@Injectable()
export class JournalService {
  constructor(
    private readonly journalRepository: JournalRepository,
    private readonly aiService: AiService,
  ) {}

  async createEntry(userId: number, entry: string, tags?: string[]): Promise<JournalEntity> {
    const embeddings = await this.aiService.embedText(entry);
    
    const journalData: CreateJournalDto = {
      userId,
      entry,
      tags,
      embeddings,
    };

    return this.journalRepository.create(journalData);
  }

  async getUserEntries(userId: number, limit = 50): Promise<JournalEntity[]> {
    return this.journalRepository.findByUserId(userId, limit);
  }

  async getEntryById(id: number): Promise<JournalEntity | null> {
    return this.journalRepository.findById(id);
  }

  async deleteEntry(id: number): Promise<void> {
    return this.journalRepository.delete(id);
  }

  async getUserEntryCount(userId: number): Promise<number> {
    return this.journalRepository.count(userId);
  }

  async searchSimilarEntries(query: string, userId: number, limit = 5): Promise<JournalEntity[]> {
    const queryEmbeddings = await this.aiService.embedText(query);
    return this.journalRepository.searchSimilar(queryEmbeddings, userId, limit);
  }

  async regenerateEmbeddings(entryId: number): Promise<void> {
    const entry = await this.journalRepository.findById(entryId);
    if (!entry) {
      throw new Error('Journal entry not found');
    }

    const embeddings = await this.aiService.embedText(entry.entry);
    await this.journalRepository.updateEmbeddings(entryId, embeddings);
  }
}
