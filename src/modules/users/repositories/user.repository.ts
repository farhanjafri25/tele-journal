import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async findByTelegramId(telegramId: number): Promise<UserEntity | null> {
    return this.userRepository.findOne({
      where: { telegramId },
      relations: ['journals'],
    });
  }

  async create(telegramId: number, userName?: string): Promise<UserEntity> {
    const user = this.userRepository.create({
      telegramId,
      userName,
    });
    return this.userRepository.save(user);
  }

  async findOrCreate(telegramId: number, userName?: string): Promise<UserEntity> {
    let user = await this.findByTelegramId(telegramId);
    if (!user) {
      user = await this.create(telegramId, userName);
    }
    return user;
  }

  async updateUsername(telegramId: number, userName: string): Promise<void> {
    await this.userRepository.update({ telegramId }, { userName });
  }

  async findById(id: number): Promise<UserEntity | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['journals'],
    });
  }
}
