import { Module } from '@nestjs/common';
import { TelegramBotService } from './services/telegram-bot.service';
import { WebhookController } from './controllers/webhook.controller';
import { UserModule } from '../users/user.module';
import { JournalModule } from '../journal/journal.module';
import { AiModule } from '../ai/ai.module';
import { RemindersModule } from '../reminders/reminders.module';

@Module({
  imports: [UserModule, JournalModule, AiModule, RemindersModule],
  controllers: [WebhookController],
  providers: [TelegramBotService],
  exports: [TelegramBotService],
})
export class TelegramModule {}
