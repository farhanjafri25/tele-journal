import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThan } from 'typeorm';
import { Reminder, ReminderStatus, ReminderType } from '../entities/reminder.entity';

@Injectable()
export class ReminderRepository {
  constructor(
    @InjectRepository(Reminder)
    private readonly reminderRepo: Repository<Reminder>,
  ) {}

  async create(reminderData: Partial<Reminder>): Promise<Reminder> {
    const reminder = this.reminderRepo.create(reminderData);
    return this.reminderRepo.save(reminder);
  }

  async findById(id: string): Promise<Reminder | null> {
    return this.reminderRepo.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async findByUserId(userId: string): Promise<Reminder[]> {
    return this.reminderRepo.find({
      where: { userId, status: ReminderStatus.ACTIVE },
      order: { nextExecution: 'ASC' },
    });
  }

  async findByChatRoomId(chatRoomId: string): Promise<Reminder[]> {
    return this.reminderRepo.find({
      where: { chatRoomId, status: ReminderStatus.ACTIVE },
      order: { nextExecution: 'ASC' },
    });
  }

  async findDueReminders(currentTime: Date = new Date()): Promise<Reminder[]> {
    return this.reminderRepo.find({
      where: {
        status: ReminderStatus.ACTIVE,
        nextExecution: LessThanOrEqual(currentTime),
      },
      relations: ['user'],
      order: { nextExecution: 'ASC' },
    });
  }

  async findUpcomingReminders(userId: string, hours: number = 24): Promise<Reminder[]> {
    const now = new Date();
    const futureTime = new Date(now.getTime() + hours * 60 * 60 * 1000);

    return this.reminderRepo.find({
      where: {
        userId,
        status: ReminderStatus.ACTIVE,
        nextExecution: MoreThan(now),
      },
      order: { nextExecution: 'ASC' },
      take: 10, // Limit to 10 upcoming reminders
    });
  }

  async update(id: string, updateData: Partial<Reminder>): Promise<Reminder | null> {
    await this.reminderRepo.update(id, updateData);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.reminderRepo.delete(id);
    return result.affected > 0;
  }

  async markAsExecuted(id: string, nextExecution?: Date): Promise<void> {
    const updateData: Partial<Reminder> = {
      lastExecutedAt: new Date(),
      executionCount: () => 'execution_count + 1',
    };

    if (nextExecution) {
      updateData.nextExecution = nextExecution;
    } else {
      // If no next execution, mark as completed for one-time reminders
      updateData.status = ReminderStatus.COMPLETED;
    }

    await this.reminderRepo.update(id, updateData as any);
  }

  async pauseReminder(id: string): Promise<void> {
    await this.reminderRepo.update(id, { status: ReminderStatus.PAUSED });
  }

  async resumeReminder(id: string): Promise<void> {
    await this.reminderRepo.update(id, { status: ReminderStatus.ACTIVE });
  }

  async cancelReminder(id: string): Promise<void> {
    await this.reminderRepo.update(id, { status: ReminderStatus.CANCELLED });
  }
}
