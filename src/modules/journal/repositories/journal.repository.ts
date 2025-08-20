import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalEntity } from '../entites/journal.entity';

export interface CreateJournalDto {
  userId: number;
  entry: string;
  tags?: string[];
  embeddings?: number[];
}

@Injectable()
export class JournalRepository {
  constructor(
    @InjectRepository(JournalEntity)
    private readonly journalRepository: Repository<JournalEntity>,
  ) {}

  async create(data: CreateJournalDto): Promise<JournalEntity> {
    const journal = this.journalRepository.create(data);
    return this.journalRepository.save(journal);
  }

  async findByUserId(userId: number, limit = 50): Promise<JournalEntity[]> {
    return this.journalRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async findById(id: number): Promise<JournalEntity | null> {
    return this.journalRepository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async findByUserIdWithEmbeddings(userId: number): Promise<JournalEntity[]> {
    return this.journalRepository.find({
      where: { userId },
      select: ['id', 'entry', 'embeddings', 'tags', 'createdAt'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateEmbeddings(id: number, embeddings: number[]): Promise<void> {
    await this.journalRepository.update(id, { embeddings });
  }

  async searchSimilar(embeddings: number[], userId: number, limit = 10): Promise<JournalEntity[]> {
    // Using raw SQL for vector similarity search
    // This assumes you're using pgvector extension in PostgreSQL
    const vectorString = `[${embeddings.join(',')}]`;

    const query = `
      SELECT j.*,
             1 - (j.embeddings::vector <=> $1::vector) as similarity
      FROM journal j
      WHERE j.user_id = $2
        AND j.embeddings IS NOT NULL
      ORDER BY j.embeddings::vector <=> $1::vector
      LIMIT $3
    `;

    return this.journalRepository.query(query, [
      vectorString,
      userId,
      limit,
    ]);
  }

  async delete(id: number): Promise<void> {
    await this.journalRepository.delete(id);
  }

  async count(userId: number): Promise<number> {
    return this.journalRepository.count({ where: { userId } });
  }
}
