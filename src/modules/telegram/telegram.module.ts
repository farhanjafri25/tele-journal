import { Module } from '@nestjs/common';
import { TelegramBotService } from './services/telegram-bot.service';
import { WebhookController } from './controllers/webhook.controller';
import { UserModule } from '../users/user.module';
import { JournalModule } from '../journal/journal.module';

@Module({
  imports: [UserModule, JournalModule],
  controllers: [WebhookController],
  providers: [TelegramBotService],
  exports: [TelegramBotService],
})
export class TelegramModule {}
