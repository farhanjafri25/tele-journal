import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { postGresConfig } from './database/typeorm.config';
import { JournalModule } from './modules/journal/journal.module';
import { UserModule } from './modules/users/user.module';
import { AiModule } from './modules/ai/ai.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { RemindersModule } from './modules/reminders/reminders.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(postGresConfig),
    JournalModule,
    UserModule,
    AiModule,
    TelegramModule,
    RemindersModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
