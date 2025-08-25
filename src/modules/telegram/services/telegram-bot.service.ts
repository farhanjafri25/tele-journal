import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { env } from '../../../../env';
import { UserService } from '../../users/services/user.service';
import { JournalService } from '../../journal/services/journal.service';
import { JournalQueryService } from '../../journal/services/journal-query.service';
import { AiService } from '../../ai/services/ai.service';
import { ReminderService } from '../../reminders/services/reminder.service';
import { ReminderSchedulerService } from '../../reminders/services/reminder-scheduler.service';
import * as fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';


@Injectable()
export class TelegramBotService implements OnModuleInit {
  private bot: TelegramBot;
  private readonly logger = new Logger(TelegramBotService.name);

  constructor(
    private readonly userService: UserService,
    private readonly journalService: JournalService,
    private readonly journalQueryService: JournalQueryService,
    private readonly aiService: AiService,
    private readonly reminderService: ReminderService,
    private readonly reminderSchedulerService: ReminderSchedulerService,
  ) {}

  onModuleInit() {
    this.initializeBot();
    // Connect scheduler with telegram bot service
    this.reminderSchedulerService.setTelegramBotService(this);
  }

  private initializeBot() {
    this.bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, {
      polling: {
        interval: 1000, // Check for updates every second
        autoStart: true,
        params: {
          timeout: 10, // Long polling timeout
        }
      },
    });

    this.logger.log('Telegram bot initialized with enhanced configuration');

    // Set up command handlers
    this.setupCommands();

    // Set up message handlers
    this.setupMessageHandlers();

    // Enhanced error handling with retry logic
    this.bot.on('polling_error', (error: any) => {
      this.logger.error('Polling error:', error);

      // Handle specific error types
      if (error.code === 'EFATAL' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        this.logger.warn('Network error detected, bot will automatically retry...');
        // The bot will automatically retry polling
      } else if (error.code === 'ETELEGRAM') {
        this.logger.warn('Telegram API error:', error.response?.body || error.message);
      } else {
        this.logger.error('Unexpected polling error:', error);
      }
    });

    // Handle webhook errors
    this.bot.on('webhook_error', (error: any) => {
      this.logger.error('Webhook error:', error);
    });
  }

  // Helper method to send messages with retry logic
  private async sendMessageWithRetry(chatId: number | string, text: string, options?: any, retries = 3): Promise<any> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.bot.sendMessage(chatId, text, options);
      } catch (error: any) {
        this.logger.warn(`Send message attempt ${attempt} failed:`, error.message);

        if (attempt === retries) {
          this.logger.error(`Failed to send message after ${retries} attempts:`, error);
          throw error;
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  private setupCommands() {
    // Start command
    this.bot.onText(/\/start/, async (msg) => {
      await this.handleStartCommand(msg);
    });

    // Help command
    this.bot.onText(/\/help/, async (msg) => {
      await this.handleHelpCommand(msg);
    });

    // Query command
    this.bot.onText(/\/query (.+)/, async (msg, match) => {
      if (match && match[1]) {
        await this.handleQueryCommand(msg, match[1]);
      }
    });

    // Summary command
    this.bot.onText(/\/summary/, async (msg) => {
      await this.handleSummaryCommand(msg);
    });

    // Stats command
    this.bot.onText(/\/stats/, async (msg) => {
      await this.handleStatsCommand(msg);
    });

    // Reminder commands
    this.bot.onText(/\/remind (.+)/, async (msg, match) => {
      await this.handleReminderCommand(msg, match);
    });

    this.bot.onText(/\/reminders/, async (msg) => {
      await this.handleListRemindersCommand(msg);
    });

    this.bot.onText(/\/cancel_reminder (.+)/, async (msg, match) => {
      await this.handleCancelReminderCommand(msg, match);
    });
  }

  private setupMessageHandlers() {
    // Handle regular text messages as journal entries
    this.bot.on('message', async (msg) => {
      // Skip if it's a command
      if (msg.text?.startsWith('/')) {
        return;
      }

      // Handle text messages
      if (msg.text) {
        await this.handleJournalEntry(msg);
        return;
      }

      // Handle voice messages
      if (msg.voice) {
        await this.handleVoiceMessage(msg);
        return;
      }

      // Handle audio messages (voice notes)
      if (msg.audio) {
        await this.handleAudioMessage(msg);
        return;
      }
    });
  }

  private async handleStartCommand(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    const username = msg.from?.username;

    if (!telegramId) {
      await this.bot.sendMessage(chatId, 'Sorry, I could not identify you. Please try again.');
      return;
    }

    try {
      // Create or find user
      await this.userService.findOrCreateUser(telegramId, username);
      
      const welcomeMessage = `
🌟 Welcome to your Personal Journal Bot! 🌟

I'm here to help you capture your thoughts, experiences, and reflections. Here's how I work:

📝 **Journaling**: Send me text messages or 🎤 voice messages - I'll save them as journal entries
🔍 **Querying**: Use /query <your question> to ask about your past entries
📊 **Summary**: Use /summary to get insights about your recent entries
📈 **Stats**: Use /stats to see your journaling statistics

Start by sharing what's on your mind today - type or speak! ✨
      `;
      
      await this.bot.sendMessage(chatId, welcomeMessage);
    } catch (error) {
      this.logger.error('Error in start command:', error);
      await this.bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again later.');
    }
  }

  private async handleHelpCommand(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    
    const helpMessage = `
🤖 **Journal Bot Commands**

📝 **Journaling**:
• Type any message to create a journal entry
• 🎤 Send voice messages - I'll transcribe them automatically!
• 🎵 Send audio files - I'll convert speech to text
• I'll automatically save and analyze your thoughts

🔍 **Querying**:
• /query <question> - Ask about your journal entries
• Example: "/query How was my mood last week?"

📊 **Insights**:
• /summary - Get a summary of your recent entries
• /stats - View your journaling statistics

⏰ **Reminders**:
• /remind [text] - Create a smart reminder (e.g., "remind me to call mom tomorrow at 3pm")
• /reminders - List all your active reminders
• /cancel_reminder [ID] - Cancel a specific reminder

❓ **Other**:
• /help - Show this help message
• /start - Restart the bot

💡 **Tips**:
• Be descriptive in your entries for better insights
• Voice messages are great for quick journaling on the go!
• Ask specific questions for more accurate responses
• Regular journaling helps me understand you better!
    `;
    
    await this.bot.sendMessage(chatId, helpMessage);
  }

  private async handleQueryCommand(msg: TelegramBot.Message, query: string) {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;

    if (!telegramId) {
      await this.bot.sendMessage(chatId, 'Sorry, I could not identify you.');
      return;
    }

    try {
      // Find user
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) {
        await this.bot.sendMessage(chatId, 'Please start the bot first with /start');
        return;
      }

      // Show typing indicator
      await this.bot.sendChatAction(chatId, 'typing');

      // Query journal entries
      const response = await this.journalQueryService.queryJournal(user.id, query);
      
      let replyMessage = `🤔 **Your Question**: ${query}\n\n`;
      replyMessage += `💭 **My Response**:\n${response.answer}`;
      
      if (response.relevantEntries.length > 0) {
        replyMessage += `\n\n📚 **Based on ${response.relevantEntries.length} relevant entries**`;
        replyMessage += `\n🎯 **Confidence**: ${response.confidence}%`;
      }

      await this.bot.sendMessage(chatId, replyMessage);
    } catch (error) {
      this.logger.error('Error in query command:', error);
      await this.bot.sendMessage(chatId, 'Sorry, I encountered an error while processing your query. Please try again.');
    }
  }

  private async handleSummaryCommand(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;

    if (!telegramId) {
      await this.bot.sendMessage(chatId, 'Sorry, I could not identify you.');
      return;
    }

    try {
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) {
        await this.bot.sendMessage(chatId, 'Please start the bot first with /start');
        return;
      }

      await this.bot.sendChatAction(chatId, 'typing');

      const summary = await this.journalQueryService.getJournalSummary(user.id);
      
      const replyMessage = `📖 **Your Journal Summary**\n\n${summary}`;
      
      await this.bot.sendMessage(chatId, replyMessage);
    } catch (error) {
      this.logger.error('Error in summary command:', error);
      await this.bot.sendMessage(chatId, 'Sorry, I encountered an error while generating your summary. Please try again.');
    }
  }

  private async handleStatsCommand(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;

    if (!telegramId) {
      await this.bot.sendMessage(chatId, 'Sorry, I could not identify you.');
      return;
    }

    try {
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) {
        await this.bot.sendMessage(chatId, 'Please start the bot first with /start');
        return;
      }

      const totalEntries = await this.journalService.getUserEntryCount(user.id);
      const recentEntries = await this.journalService.getUserEntries(user.id, 7);
      
      const statsMessage = `
📊 **Your Journaling Stats**

📝 **Total Entries**: ${totalEntries}
📅 **This Week**: ${recentEntries.length} entries
🗓️ **Member Since**: ${user.createdAt.toLocaleDateString()}

${totalEntries === 0 ? 
  '💡 Start journaling to see more detailed statistics!' : 
  '🌟 Keep up the great work with your journaling journey!'
}
      `;
      
      await this.bot.sendMessage(chatId, statsMessage);
    } catch (error) {
      this.logger.error('Error in stats command:', error);
      await this.bot.sendMessage(chatId, 'Sorry, I encountered an error while fetching your stats. Please try again.');
    }
  }

  private async handleJournalEntry(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    const text = msg.text;

    if (!telegramId || !text) {
      return;
    }

    try {
      const user = await this.userService.findOrCreateUser(telegramId, msg.from?.username);
      
      await this.journalService.createEntry(user.id, text);
      
      const confirmationMessages = [
        '✅ Journal entry saved!',
        '📝 Got it! Entry recorded.',
        '💾 Saved to your journal!',
        '🌟 Entry added successfully!',
        '📖 Recorded in your journal!',
      ];
      
      const randomMessage = confirmationMessages[Math.floor(Math.random() * confirmationMessages.length)];
      
      await this.bot.sendMessage(chatId, randomMessage);
    } catch (error) {
      this.logger.error('Error saving journal entry:', error);
      await this.bot.sendMessage(chatId, 'Sorry, I couldn\'t save your entry. Please try again.');
    }
  }

  async processUpdate(update: any) {
    try {
      this.bot.processUpdate(update);
    } catch (error) {
      this.logger.error('Error processing update:', error);
      throw error;
    }
  }

  private async handleVoiceMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;

    if (!telegramId || !msg.voice) {
      return;
    }

    try {
      // Show typing indicator
      await this.bot.sendChatAction(chatId, 'typing');

      // Send processing message
      const processingMsg = await this.bot.sendMessage(chatId, '🎤 Processing voice message...');

      // Download the voice file
      const fileId = msg.voice.file_id;
      const audioFilePath = await this.downloadAudioFile(fileId, 'voice');

      // Convert speech to text
      const transcribedText = await this.aiService.speechToText(audioFilePath);
      console.log(`Transcribed text: ${transcribedText}`);
      
      // Clean up the audio file
      await fs.remove(audioFilePath);

      if (!transcribedText.trim()) {
        await this.bot.editMessageText('❌ Could not transcribe the voice message. Please try again.', {
          chat_id: chatId,
          message_id: processingMsg.message_id,
        });
        return;
      }

      // Find or create user
      const user = await this.userService.findOrCreateUser(telegramId, msg.from?.username);

      // Save journal entry with transcribed text
      await this.journalService.createEntry(user.id, transcribedText);

      // Update the processing message with success
      await this.bot.editMessageText(
        `✅ Voice message saved!\n\n📝 Transcribed: "${transcribedText}"`,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
        }
      );
    } catch (error) {
      this.logger.error('Error processing voice message:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, I couldn\'t process your voice message. Please try again.');
    }
  }

  private async handleAudioMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;

    if (!telegramId || !msg.audio) {
      return;
    }

    try {
      // Show typing indicator
      await this.bot.sendChatAction(chatId, 'typing');

      // Send processing message
      const processingMsg = await this.bot.sendMessage(chatId, '🎵 Processing audio message...');

      // Download the audio file
      const fileId = msg.audio.file_id;
      const audioFilePath = await this.downloadAudioFile(fileId, 'audio');

      // Convert speech to text
      const transcribedText = await this.aiService.speechToText(audioFilePath);

      // Clean up the audio file
      await fs.remove(audioFilePath);

      if (!transcribedText.trim()) {
        await this.bot.editMessageText('❌ Could not transcribe the audio message. Please try again.', {
          chat_id: chatId,
          message_id: processingMsg.message_id,
        });
        return;
      }

      // Find or create user
      const user = await this.userService.findOrCreateUser(telegramId, msg.from?.username);

      // Save journal entry with transcribed text
      await this.journalService.createEntry(user.id, transcribedText);

      // Update the processing message with success
      await this.bot.editMessageText(
        `✅ Audio message saved!\n\n📝 Transcribed: "${transcribedText}"`,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
        }
      );
    } catch (error) {
      this.logger.error('Error processing audio message:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, I couldn\'t process your audio message. Please try again.');
    }
  }

  private async downloadAudioFile(fileId: string, type: 'voice' | 'audio'): Promise<string> {
    try {
      // Get file info from Telegram
      const file = await this.bot.getFile(fileId);

      if (!file.file_path) {
        throw new Error('File path not available');
      }

      // Download the file
      const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const response = await axios.get(fileUrl, { responseType: 'stream' });

      // Create temp directory if it doesn't exist
      const tempDir = path.join(process.cwd(), 'temp');
      await fs.ensureDir(tempDir);

      // Save the file directly (AssemblyAI can handle .ogg files)
      const extension = type === 'voice' ? 'ogg' : 'mp3';
      const fileName = `${type}_${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
      const filePath = path.join(tempDir, fileName);

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          this.logger.log(`Audio file downloaded: ${filePath}`);
          resolve(filePath);
        });
        writer.on('error', reject);
      });
    } catch (error) {
      this.logger.error('Error downloading audio file:', error);
      throw new Error('Failed to download audio file');
    }
  }

  // Reminder command handlers
  private async handleReminderCommand(msg: TelegramBot.Message, match: RegExpExecArray | null) {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;

    if (!telegramId || !match || !match[1]) {
      await this.bot.sendMessage(chatId, 'Please provide a reminder description. Example: /remind take medicine tomorrow at 8am');
      return;
    }

    try {
      // Find or create user
      const user = await this.userService.findOrCreateUser(telegramId, msg.from?.username);

      // Show typing indicator
      await this.bot.sendChatAction(chatId, 'typing');

      // Parse reminder request with AI
      const reminderText = match[1];
      console.log(`reminderText`, reminderText);
      const aiResponse = await this.aiService.parseReminderRequest(reminderText);
      console.log(`aiResponse`, JSON.stringify(aiResponse, null, 2));

      // Check if AI returned tool calls - handle different response formats
      const message = aiResponse.choices?.[0]?.message;
      const toolCalls = message?.tool_calls || message?.toolCalls;

      console.log(`message`, message);
      console.log(`toolCalls`, toolCalls);

      if (toolCalls && toolCalls.length > 0) {
        const toolCall = toolCalls[0];
        console.log(`toolCall`, toolCall);
        const toolResult = await this.aiService.handleReminderToolCall(toolCall, user.id, chatId.toString());
        console.log(`toolResult`, toolResult);
        if (toolResult.action === 'create_reminder') {
          // Create the reminder
          const reminder = await this.reminderService.createReminder(
            user.id,
            chatId.toString(),
            toolResult.params
          );

          const scheduledTime = new Date(toolResult.params.scheduledAt).toLocaleString();
          await this.bot.sendMessage(
            chatId,
            `✅ Reminder created!\n\n📝 **${reminder.title}**\n📅 Scheduled for: ${scheduledTime}\n🔄 Type: ${reminder.type}\n\n🆔 ID: \`${reminder.id}\``
          );
        }
      } else {
        // Fallback: Try to parse manually or use AI response text
        console.log('No tool calls found, trying fallback parsing...');

        const aiText = aiResponse.choices?.[0]?.message?.content;
        console.log('AI response text:', aiText);

        // Try simple manual parsing as fallback
        const fallbackReminder = this.parseReminderFallback(reminderText);
        if (fallbackReminder) {
          const reminder = await this.reminderService.createReminder(
            user.id,
            chatId.toString(),
            fallbackReminder
          );

          const scheduledTime = new Date(fallbackReminder.scheduledAt).toLocaleString();
          await this.bot.sendMessage(
            chatId,
            `✅ Reminder created (fallback parsing)!\n\n📝 **${reminder.title}**\n📅 Scheduled for: ${scheduledTime}\n🔄 Type: ${reminder.type}\n\n🆔 ID: \`${reminder.id}\``
          );
        } else {
          // AI couldn't parse the reminder
          await this.bot.sendMessage(
            chatId,
            '❌ I couldn\'t understand your reminder request. Please try again with more details.\n\nExample: "Remind me to call mom tomorrow at 3pm"'
          );
        }
      }
    } catch (error) {
      this.logger.error('Error creating reminder:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, I couldn\'t create your reminder. Please try again.');
    }
  }

  private async handleListRemindersCommand(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;

    if (!telegramId) {
      return;
    }

    try {
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) {
        await this.bot.sendMessage(chatId, 'Please start the bot first with /start');
        return;
      }

      const reminders = await this.reminderService.getUserReminders(user.id);
      const message = await this.reminderService.formatRemindersList(reminders);

      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      this.logger.error('Error listing reminders:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, I couldn\'t retrieve your reminders. Please try again.');
    }
  }

  private async handleCancelReminderCommand(msg: TelegramBot.Message, match: RegExpExecArray | null) {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;

    if (!telegramId || !match || !match[1]) {
      await this.bot.sendMessage(chatId, 'Please provide a reminder ID. Example: /cancel_reminder abc123');
      return;
    }

    try {
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) {
        await this.bot.sendMessage(chatId, 'Please start the bot first with /start');
        return;
      }

      const reminderId = match[1];
      const success = await this.reminderService.deleteReminder(reminderId);

      if (success) {
        await this.bot.sendMessage(chatId, '✅ Reminder cancelled successfully!');
      } else {
        await this.bot.sendMessage(chatId, '❌ Reminder not found or already cancelled.');
      }
    } catch (error) {
      this.logger.error('Error cancelling reminder:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, I couldn\'t cancel your reminder. Please try again.');
    }
  }

  // Fallback parsing method for simple reminders
  private parseReminderFallback(text: string): any | null {
    try {
      console.log('Fallback parsing input:', text);

      // Simple regex patterns for common reminder formats
      const patterns = [
        /remind me to (.+) (today|tomorrow) at (\d{1,2}):(\d{2})\s*(am|pm)/i,
        /remind me to (.+) at (\d{1,2}):(\d{2})\s*(am|pm)/i,
        /remind me to (.+) (today|tomorrow)/i,
        /remind me to (.+)/i
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        console.log('Pattern match:', pattern, match);

        if (match) {
          const title = match[1].trim();
          let scheduledAt = new Date();

          // Ensure we have a valid date
          if (isNaN(scheduledAt.getTime())) {
            scheduledAt = new Date();
          }

          if (match[2] === 'tomorrow') {
            scheduledAt.setDate(scheduledAt.getDate() + 1);
          }

          if (match[3] && match[4] && match[5]) { // Has time with AM/PM
            let hours = parseInt(match[3]);
            const minutes = parseInt(match[4]);
            const ampm = match[5].toLowerCase();

            console.log('Parsing time:', hours, minutes, ampm);

            // Validate parsed values
            if (isNaN(hours) || isNaN(minutes)) {
              console.log('Invalid time values, using default');
              scheduledAt.setHours(9, 0, 0, 0);
            } else {
              if (ampm === 'pm' && hours !== 12) hours += 12;
              if (ampm === 'am' && hours === 12) hours = 0;

              scheduledAt.setHours(hours, minutes, 0, 0);
            }
          } else {
            // Default to 9 AM if no time specified
            scheduledAt.setHours(9, 0, 0, 0);
          }

          // Final validation
          if (isNaN(scheduledAt.getTime())) {
            console.error('Invalid date created, using current time + 1 hour');
            scheduledAt = new Date();
            scheduledAt.setHours(scheduledAt.getHours() + 1);
          }

          const result = {
            title,
            type: 'once',
            scheduledAt: scheduledAt.toISOString()
          };

          console.log('Fallback parsing result:', result);
          return result;
        }
      }

      console.log('No pattern matched');
      return null;
    } catch (error) {
      console.error('Fallback parsing error:', error);
      return null;
    }
  }

  // Method to send reminder notifications (called by scheduler)
  async sendReminderNotification(reminder: any) {
    try {
      const chatId = reminder.chatRoomId;
      let message = `🔔 **Reminder**\n\n📝 ${reminder.title}`;

      if (reminder.description) {
        message += `\n\n${reminder.description}`;
      }

      message += `\n\n⏰ Scheduled for: ${reminder.scheduledAt.toLocaleString()}`;

      await this.sendMessageWithRetry(chatId, message, { parse_mode: 'Markdown' });
      this.logger.log(`Sent reminder notification: ${reminder.id}`);
    } catch (error) {
      this.logger.error(`Error sending reminder notification for ${reminder.id}:`, error);
    }
  }
}
