import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { Reminder } from '../entities/reminder.entity';

@Injectable()
export class ReminderSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private schedulerInterval: NodeJS.Timeout;

  constructor(
    private readonly reminderService: ReminderService,
  ) {}

  // Method to set telegram bot service (will be called from telegram module)
  private telegramBotService: any;

  setTelegramBotService(telegramBotService: any) {
    this.telegramBotService = telegramBotService;
  }

  onModuleInit() {
    this.startScheduler();
  }

  private startScheduler() {
    // Check for due reminders every minute
    this.schedulerInterval = setInterval(async () => {
      try {
        await this.processDueReminders();
      } catch (error) {
        this.logger.error('Error processing due reminders:', error);
      }
    }, 60000); // 1 minute

    this.logger.log('Reminder scheduler started');
  }

  private async processDueReminders() {
    try {
      const dueReminders = await this.reminderService.getDueReminders();
      
      if (dueReminders.length === 0) {
        return;
      }

      this.logger.log(`Processing ${dueReminders.length} due reminders`);

      for (const reminder of dueReminders) {
        await this.executeReminder(reminder);
      }
    } catch (error) {
      this.logger.error('Error in processDueReminders:', error);
    }
  }

  private async executeReminder(reminder: Reminder) {
    try {
      this.logger.log(`Executing reminder: ${reminder.id} - ${reminder.title}`);

      // Send notification via Telegram bot if available
      if (this.telegramBotService) {
        await this.telegramBotService.sendReminderNotification(reminder);
      } else {
        this.logger.warn('Telegram bot service not available for reminder notification');
      }

      // Mark as executed and calculate next execution
      await this.reminderService.markReminderAsExecuted(reminder);

    } catch (error) {
      this.logger.error(`Error executing reminder ${reminder.id}:`, error);
    }
  }

  async stopScheduler() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.logger.log('Reminder scheduler stopped');
    }
  }

  // Manual trigger for testing
  async triggerDueReminders() {
    await this.processDueReminders();
  }
}
