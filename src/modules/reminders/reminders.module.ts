import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reminder } from './entities/reminder.entity';
import { ReminderRepository } from './repositories/reminder.repository';
import { ReminderService } from './services/reminder.service';
import { ReminderSchedulerService } from './services/reminder-scheduler.service';
import { ReminderMatcherService } from './services/reminder-matcher.service';
import { RecurringDeletionService } from './services/recurring-deletion.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reminder]),
  ],
  providers: [
    ReminderRepository,
    ReminderService,
    ReminderSchedulerService,
    ReminderMatcherService,
    RecurringDeletionService,
  ],
  exports: [
    ReminderService,
    ReminderSchedulerService,
    ReminderMatcherService,
    RecurringDeletionService,
  ],
})
export class RemindersModule {}
