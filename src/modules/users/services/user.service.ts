import { Injectable } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async findOrCreateUser(telegramId: number, userName?: string): Promise<UserEntity> {
    return this.userRepository.findOrCreate(telegramId, userName);
  }

  async findByTelegramId(telegramId: number): Promise<UserEntity | null> {
    return this.userRepository.findByTelegramId(telegramId);
  }

  async updateUsername(telegramId: number, userName: string): Promise<void> {
    return this.userRepository.updateUsername(telegramId, userName);
  }

  async findById(id: number): Promise<UserEntity | null> {
    return this.userRepository.findById(id);
  }
}
