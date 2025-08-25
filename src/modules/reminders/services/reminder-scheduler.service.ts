import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { Reminder } from '../entities/reminder.entity';

@Injectable()
export class ReminderSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private schedulerInterval: NodeJS.Timeout;

  constructor(
    private readonly reminderService: ReminderService,
  ) {}

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

      // This will be handled by the Telegram bot service
      // For now, we just mark it as executed and calculate next execution
      await this.reminderService.markReminderAsExecuted(reminder);

      // Emit event or call telegram service to send reminder
      // This will be implemented when we integrate with telegram
      
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
