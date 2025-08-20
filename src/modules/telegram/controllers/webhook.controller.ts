import { Controller, Post, Body, Param, Logger } from '@nestjs/common';
import { TelegramBotService } from '../services/telegram-bot.service';

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly telegramBotService: TelegramBotService) {}

  @Post(':token')
  async handleWebhook(@Param('token') token: string, @Body() update: any) {
    this.logger.log('Received webhook update');
    
    if (token !== process.env.TELEGRAM_BOT_TOKEN) {
      this.logger.warn('Invalid webhook token received');
      return { status: 'error', message: 'Invalid token' };
    }

    try {
      await this.telegramBotService.processUpdate(update);
      return { status: 'ok' };
    } catch (error) {
      this.logger.error('Error processing webhook update:', error);
      return { status: 'error', message: 'Failed to process update' };
    }
  }
}
