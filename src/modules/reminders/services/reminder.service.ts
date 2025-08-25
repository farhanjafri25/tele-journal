import { Injectable, Logger } from '@nestjs/common';
import { ReminderRepository } from '../repositories/reminder.repository';
import { Reminder, ReminderType, ReminderStatus } from '../entities/reminder.entity';
import { CreateReminderParams, UpdateReminderParams } from '../tools/reminder-tools';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly reminderRepository: ReminderRepository,
  ) {}

  async createReminder(
    userId: number,
    chatRoomId: string,
    params: CreateReminderParams
  ): Promise<Reminder> {
    try {
      console.log(`params`, params);
      console.log('Raw scheduledAt:', params.scheduledAt, typeof params.scheduledAt);

      // Handle different date formats
      let scheduledAt: Date;
      const dateInput = params.scheduledAt as any;

      if (dateInput instanceof Date) {
        scheduledAt = dateInput;
      } else if (typeof dateInput === 'string') {
        // Try different parsing methods
        scheduledAt = new Date(dateInput);

        // If that fails, try parsing as ISO string
        if (isNaN(scheduledAt.getTime())) {
          scheduledAt = new Date(dateInput.replace(/['"]/g, ''));
        }

        // If still fails, try manual parsing
        if (isNaN(scheduledAt.getTime())) {
          const isoMatch = dateInput.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
          if (isoMatch) {
            scheduledAt = new Date(
              parseInt(isoMatch[1]), // year
              parseInt(isoMatch[2]) - 1, // month (0-based)
              parseInt(isoMatch[3]), // day
              parseInt(isoMatch[4]), // hour
              parseInt(isoMatch[5]), // minute
              parseInt(isoMatch[6])  // second
            );
          }
        }
      } else {
        scheduledAt = new Date();
        this.logger.warn('Unexpected scheduledAt type, using current time');
      }

      console.log('Parsed scheduledAt:', scheduledAt, 'Valid:', !isNaN(scheduledAt.getTime()));

      // Validate the date
      if (isNaN(scheduledAt.getTime())) {
        this.logger.error('Invalid scheduledAt date after all parsing attempts:', dateInput);
        // Use current time + 1 hour as fallback
        scheduledAt = new Date();
        scheduledAt.setHours(scheduledAt.getHours() + 1);
        this.logger.warn('Using fallback time:', scheduledAt);
      }

      // Ensure the date is in the future
      if (scheduledAt < new Date()) {
        this.logger.warn('Scheduled date is in the past, adjusting to future');
        scheduledAt.setTime(Date.now() + 60000); // Add 1 minute
      }

      const nextExecution = this.calculateNextExecution(scheduledAt, params.type as ReminderType, params.recurrencePattern);

      const reminderData: Partial<Reminder> = {
        userId,
        chatRoomId,
        title: params.title,
        description: params.description,
        type: params.type as ReminderType,
        scheduledAt,
        nextExecution: nextExecution ?? undefined,
        recurrencePattern: params.recurrencePattern,
        preferences: params.preferences,
        status: ReminderStatus.ACTIVE,
      };

      const reminder = await this.reminderRepository.create(reminderData);
      this.logger.log(`Created reminder: ${reminder.id} for user: ${userId}`);
      
      return reminder;
    } catch (error) {
      this.logger.error('Error creating reminder:', error);
      throw new Error('Failed to create reminder');
    }
  }

  async getUserReminders(userId: number): Promise<Reminder[]> {
    return this.reminderRepository.findByUserId(userId);
  }

  async getChatRoomReminders(chatRoomId: string): Promise<Reminder[]> {
    return this.reminderRepository.findByChatRoomId(chatRoomId);
  }

  async updateReminder(id: string, params: UpdateReminderParams): Promise<Reminder | null> {
    const updateData: Partial<Reminder> = {};

    if (params.title) updateData.title = params.title;
    if (params.status) updateData.status = params.status as ReminderStatus;
    if (params.scheduledAt) {
      const newScheduledAt = new Date(params.scheduledAt);
      updateData.scheduledAt = newScheduledAt;
      updateData.nextExecution = newScheduledAt;
    }

    return this.reminderRepository.update(id, updateData);
  }

  async deleteReminder(id: string): Promise<boolean> {
    return this.reminderRepository.delete(id);
  }

  async pauseReminder(id: string): Promise<void> {
    await this.reminderRepository.pauseReminder(id);
  }

  async resumeReminder(id: string): Promise<void> {
    await this.reminderRepository.resumeReminder(id);
  }

  async getDueReminders(): Promise<Reminder[]> {
    return this.reminderRepository.findDueReminders();
  }

  async markReminderAsExecuted(reminder: Reminder): Promise<void> {
    const nextExecution = this.calculateNextExecution(
      reminder.nextExecution,
      reminder.type,
      reminder.recurrencePattern
    );

    await this.reminderRepository.markAsExecuted(reminder.id, nextExecution ?? undefined);
  }

  private calculateNextExecution(
    currentTime: Date,
    type: ReminderType,
    pattern?: any
  ): Date | null {
    if (type === ReminderType.ONCE) {
      return null; // One-time reminders don't have next execution
    }

    const next = new Date(currentTime);

    switch (type) {
      case ReminderType.DAILY:
        next.setDate(next.getDate() + (pattern?.interval || 1));
        break;

      case ReminderType.WEEKLY:
        if (pattern?.daysOfWeek && pattern.daysOfWeek.length > 0) {
          // Find next occurrence of specified days
          const currentDay = next.getDay();
          const sortedDays = pattern.daysOfWeek.sort((a: number, b: number) => a - b);

          let nextDay = sortedDays.find((day: number) => day > currentDay);
          if (!nextDay) {
            nextDay = sortedDays[0];
            next.setDate(next.getDate() + 7); // Next week
          }
          
          const daysToAdd = nextDay - currentDay;
          next.setDate(next.getDate() + daysToAdd);
        } else {
          next.setDate(next.getDate() + 7 * (pattern?.interval || 1));
        }
        break;

      case ReminderType.MONTHLY:
        if (pattern?.dayOfMonth) {
          next.setMonth(next.getMonth() + (pattern?.interval || 1));
          next.setDate(pattern.dayOfMonth);
        } else {
          next.setMonth(next.getMonth() + (pattern?.interval || 1));
        }
        break;

      case ReminderType.YEARLY:
        next.setFullYear(next.getFullYear() + (pattern?.interval || 1));
        break;

      default:
        return null;
    }

    // Set time of day if specified
    if (pattern?.timeOfDay) {
      const [hours, minutes] = pattern.timeOfDay.split(':').map(Number);
      next.setHours(hours, minutes, 0, 0);
    }

    // Check if we've exceeded max occurrences or end date
    if (pattern?.maxOccurrences && pattern.maxOccurrences <= 0) {
      return null;
    }

    if (pattern?.endDate && next > new Date(pattern.endDate)) {
      return null;
    }

    return next;
  }

  async formatRemindersList(reminders: Reminder[]): Promise<string> {
    if (reminders.length === 0) {
      return "📅 You don't have any active reminders.";
    }

    let message = "📅 **Your Active Reminders:**\n\n";
    
    reminders.forEach((reminder, index) => {
      const nextTime = reminder.nextExecution 
        ? reminder.nextExecution.toLocaleString()
        : 'Completed';
      
      message += `${index + 1}. **${reminder.title}**\n`;
      message += `   📅 Next: ${nextTime}\n`;
      message += `   🔄 Type: ${reminder.type}\n`;
      if (reminder.description) {
        message += `   📝 ${reminder.description}\n`;
      }
      message += `   🆔 ID: \`${reminder.id}\`\n\n`;
    });

    return message;
  }
}
