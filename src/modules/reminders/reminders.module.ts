import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reminder } from './entities/reminder.entity';
import { ReminderRepository } from './repositories/reminder.repository';
import { ReminderService } from './services/reminder.service';
import { ReminderSchedulerService } from './services/reminder-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reminder]),
  ],
  providers: [
    ReminderRepository,
    ReminderService,
    ReminderSchedulerService,
  ],
  exports: [
    ReminderService,
    ReminderSchedulerService,
  ],
})
export class RemindersModule {}
