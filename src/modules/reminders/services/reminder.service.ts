import { Injectable, Logger } from '@nestjs/common';
import { ReminderRepository } from '../repositories/reminder.repository';
import { Reminder, ReminderType, ReminderStatus } from '../entities/reminder.entity';
import { CreateReminderParams, UpdateReminderParams } from '../tools/reminder-tools';
import { TimezoneUtils } from '../utils/timezone.utils';

// Helper function to escape markdown characters for Telegram
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

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
      if (process.env.NODE_ENV !== 'production') {
        console.log(`params`, params);
        console.log('Raw scheduledAt:', params.scheduledAt, typeof params.scheduledAt);
      }

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

      if (process.env.NODE_ENV !== 'production') {
        console.log('Parsed scheduledAt:', scheduledAt, 'Valid:', !isNaN(scheduledAt.getTime()));
      }

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
        // scheduledAt.setTime(Date.now() + 60000); // Add 1 minute
      }

      const nextExecution = this.calculateNextExecution(scheduledAt, params.type as ReminderType, params.recurrencePattern, true);

      if (process.env.NODE_ENV !== 'production') {
        console.log('Reminder creation debug:');
        console.log('- scheduledAt:', scheduledAt);
        console.log('- nextExecution:', nextExecution);
        console.log('- type:', params.type);
      }

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
      if (process.env.NODE_ENV !== 'production') {
        console.log('Created reminder with nextExecution:', reminder.nextExecution);
      }
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
    console.log(`Marking reminder as executed: ${reminder}`);
    
    const nextExecution = this.calculateNextExecution(
      reminder.nextExecution,
      reminder.type,
      reminder.recurrencePattern,
      false
    );

    await this.reminderRepository.markAsExecuted(reminder.id, nextExecution ?? undefined, reminder.type as ReminderType | null);
  }

  private calculateNextExecution(
    currentTime: Date,
    type: ReminderType,
    pattern?: any,
    isInitialScheduling: boolean = false
  ): Date | null {
    console.log(`inside calculateNextExecution`, currentTime, type, pattern, isInitialScheduling);
    
    if (type === ReminderType.ONCE) {
      // For one-time reminders, the next execution is the scheduled time itself
      return new Date(currentTime);
    }

    // For initial scheduling, check if we can schedule for today first
    if (isInitialScheduling) {
      return this.calculateInitialRecurringExecution(currentTime, type, pattern);
    }

    // For subsequent executions after a reminder has fired
    return this.calculateSubsequentExecution(currentTime, type, pattern);
  }

  /**
   * Calculate the first execution time for a new recurring reminder
   */
  private calculateInitialRecurringExecution(
    scheduledTime: Date,
    type: ReminderType,
    pattern?: any
  ): Date | null {
    const now = new Date();
    const candidate = new Date(scheduledTime);
    
    // Set the time of day if specified in pattern
    // if (pattern?.timeOfDay) {
    //   const [hours, minutes] = pattern.timeOfDay.split(':').map(Number);
    //   candidate.setHours(hours, minutes, 0, 0);
    // }
    

    switch (type) {
      case ReminderType.DAILY:
        // If the time hasn't passed today, schedule for today
        if (candidate > now) {
          return candidate;
        }
        // Otherwise, schedule for tomorrow
        candidate.setDate(candidate.getDate() + (pattern?.interval || 1));
        return candidate;

      case ReminderType.WEEKLY:
        if (pattern?.daysOfWeek && pattern.daysOfWeek.length > 0) {
          const currentDay = candidate.getDay();
          const sortedDays = pattern.daysOfWeek.sort((a: number, b: number) => a - b);

          // Check if today is one of the scheduled days and time hasn't passed
          if (sortedDays.includes(currentDay) && candidate > now) {
            return candidate;
          }

          // Find next scheduled day
          let nextDay = sortedDays.find((day: number) => day > currentDay);
          if (!nextDay) {
            nextDay = sortedDays[0];
            candidate.setDate(candidate.getDate() + 7); // Next week
          }

          const daysToAdd = nextDay - currentDay;
          candidate.setDate(candidate.getDate() + daysToAdd);
          return candidate;
        } else {
          // If time hasn't passed today, schedule for today
          if (candidate > now) {
            return candidate;
          }
          // Otherwise, schedule for next week
          candidate.setDate(candidate.getDate() + 7 * (pattern?.interval || 1));
          return candidate;
        }

      case ReminderType.MONTHLY:
        if (pattern?.dayOfMonth) {
          const targetDay = pattern.dayOfMonth;
          const currentDay = candidate.getDate();

          // If it's the target day and time hasn't passed, schedule for today
          if (currentDay === targetDay && candidate > now) {
            return candidate;
          }

          // Otherwise, schedule for next month
          candidate.setMonth(candidate.getMonth() + (pattern?.interval || 1));
          candidate.setDate(targetDay);
          return candidate;
        } else {
          // If time hasn't passed today, schedule for today
          if (candidate > now) {
            return candidate;
          }
          // Otherwise, schedule for next month
          candidate.setMonth(candidate.getMonth() + (pattern?.interval || 1));
          return candidate;
        }

      case ReminderType.YEARLY:
        // If time hasn't passed today, schedule for today
        if (candidate > now) {
          return candidate;
        }
        // Otherwise, schedule for next year
        candidate.setFullYear(candidate.getFullYear() + (pattern?.interval || 1));
        return candidate;

      default:
        return null;
    }
  }

  /**
   * Calculate the next execution time after a reminder has been executed
   */
  private calculateSubsequentExecution(
    currentTime: Date,
    type: ReminderType,
    pattern?: any
  ): Date | null {
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
      let nextTime = 'Completed';

      if (reminder.nextExecution) {
        // Get timezone from reminder or default to Asia/Kolkata
        const timezone = reminder.recurrencePattern?.timezone || 'Asia/Kolkata';
        nextTime = TimezoneUtils.formatDateInTimezone(reminder.nextExecution, timezone);
      }

      message += `${index + 1}. **${escapeMarkdown(reminder.title)}**\n`;
      message += `   📅 Next: ${nextTime}\n`;
      message += `   🔄 Type: ${reminder.type}\n`;
      if (reminder.description) {
        message += `   📝 ${escapeMarkdown(reminder.description)}\n`;
      }
    });

    return message;
  }
}
