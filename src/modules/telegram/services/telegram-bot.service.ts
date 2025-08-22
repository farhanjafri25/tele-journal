import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { env } from '../../../../env';
import { UserService } from '../../users/services/user.service';
import { JournalService } from '../../journal/services/journal.service';
import { JournalQueryService } from '../../journal/services/journal-query.service';
import { AiService } from '../../ai/services/ai.service';
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
  ) {}

  onModuleInit() {
    this.initializeBot();
  }

  private initializeBot() {
    this.bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: true });
    
    this.logger.log('Telegram bot initialized');
    
    // Set up command handlers
    this.setupCommands();
    
    // Set up message handlers
    this.setupMessageHandlers();
    
    // Error handling
    this.bot.on('polling_error', (error) => {
      this.logger.error('Polling error:', error);
    });
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
}
