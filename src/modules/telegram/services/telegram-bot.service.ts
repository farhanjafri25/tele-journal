import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as TelegramBot from 'node-telegram-bot-api';
import { env } from '../../../../env';
import { UserService } from '../../users/services/user.service';
import { JournalService } from '../../journal/services/journal.service';
import { JournalQueryService } from '../../journal/services/journal-query.service';
import { AiService } from '../../ai/services/ai.service';
import { ReminderService } from '../../reminders/services/reminder.service';
import { ReminderSchedulerService } from '../../reminders/services/reminder-scheduler.service';
import { ReminderMatcherService } from '../../reminders/services/reminder-matcher.service';
import { RecurringDeletionService } from '../../reminders/services/recurring-deletion.service';
import { TimezoneUtils } from '../../reminders/utils/timezone.utils';
import * as fs from 'fs-extra';
import * as path from 'path';
import axios from 'axios';
import { DEFAULT_MESSAGE_FOR_WRONG_COMMAND, MULTIPLE_COMMANDS_ERROR, QUERY_COMMANDS } from 'src/constants/constants';

// Helper function to escape markdown characters for Telegram
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}


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
    private readonly reminderMatcherService: ReminderMatcherService,
    private readonly recurringDeletionService: RecurringDeletionService,
  ) { }

  onModuleInit() {
    setTimeout(() => {
      this.initializeBot();
      // Connect scheduler with telegram bot service
      this.reminderSchedulerService.setTelegramBotService(this);
      this.logger.log('Telegram bot initialized (staggered)');
    }, 3000);
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

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log('Telegram bot initialized');
    }

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

  // Helper method to check if message contains multiple commands
  private hasMultipleCommands(msgText: string | undefined): boolean {
    return msgText ? msgText.split('/').length > 2 : false;
  }

  // Helper method to safely execute commands with multiple commands check
  private async executeCommandSafely(msg: TelegramBot.Message, commandHandler: () => Promise<any>): Promise<void> {
    if (this.hasMultipleCommands(msg.text)) {
      await this.bot.sendMessage(msg.chat.id, MULTIPLE_COMMANDS_ERROR, { parse_mode: 'Markdown' });
      return;
    }
    await commandHandler();
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
      await this.executeCommandSafely(msg, () => this.handleStartCommand(msg));
    });

    // Help command
    this.bot.onText(/\/help/, async (msg) => {
      await this.executeCommandSafely(msg, () => this.handleHelpCommand(msg));
    });

    // Query command
    this.bot.onText(/\/query (.+)/, async (msg, match) => {
      await this.executeCommandSafely(msg, async () => {
        if (match && match[1]) {
          await this.handleQueryCommand(msg, match[1]);
        }
      });
    });

    // Summary command
    this.bot.onText(/\/summary/, async (msg) => {
      await this.executeCommandSafely(msg, () => this.handleSummaryCommand(msg));
    });

    // Stats command
    this.bot.onText(/\/stats/, async (msg) => {
      await this.executeCommandSafely(msg, () => this.handleStatsCommand(msg));
    });

    // Reminder commands
    this.bot.onText(/\/remind (.+)/, async (msg, match) => {
      await this.executeCommandSafely(msg, () => this.handleReminderCommand(msg, match));
    });

    this.bot.onText(/\/reminders/, async (msg) => {
      await this.executeCommandSafely(msg, () => this.handleListRemindersCommand(msg));
    });

    this.bot.onText(/\/cancel_reminder (.+)/, async (msg, match) => {
      await this.executeCommandSafely(msg, () => this.handleCancelReminderCommand(msg, match));
    });

    // Smart reminder deletion command
    this.bot.onText(/\/delete_reminder (.+)/, async (msg, match) => {
      await this.executeCommandSafely(msg, () => this.handleSmartDeleteReminderCommand(msg, match));
    });
  }

  private setupMessageHandlers() {
    // Handle regular text messages as journal entries
    this.bot.on('message', async (msg) => {
      // Check for invalid commands
      if (msg?.text?.startsWith('/')) {
        const command = msg?.text?.split(' ')[0];
        if (!QUERY_COMMANDS.includes(command)) {
          await this.bot.sendMessage(msg.chat.id, DEFAULT_MESSAGE_FOR_WRONG_COMMAND, { parse_mode: 'Markdown' });
          return;
        }
        return;
      }

      // Handle text messages
      if (msg.text) {
        await this.processTextMessages(msg, msg.text);
        return;
      }

      // Handle voice messages
      if (msg.voice) {
        if(msg.voice?.duration && msg.voice.duration > 120) {
          await this.bot.sendMessage(msg.chat.id, 'Sorry, I can\'t process voice messages longer than 120 seconds yet.', { parse_mode: 'Markdown' });
          return;
        }
        await this.handleVoiceMessage(msg);
        return;
      }

      // Handle audio messages (voice notes)
      if (msg.audio) {
        if(msg.audio?.duration && msg.audio.duration > 120) {
          await this.bot.sendMessage(msg.chat.id, 'Sorry, I can\'t process audio messages longer than 120 seconds yet.', { parse_mode: 'Markdown' });
          return;
        }
        await this.handleAudioMessage(msg);
        return;
      }
    });
  }

 async processTextMessages(msg: TelegramBot.Message, msgText: string) {
    if(msg?.text?.length && msg?.text?.length > 400) {
      await this.bot.sendMessage(msg.chat.id, 'Sorry, I can\'t process messages longer than 400 characters yet.', { parse_mode: 'Markdown' });
      return;
    }

    // Detect message intent
    const intent = await this.aiService.detectMessageIntent(msgText);
    this.logger.debug(`Message intent: ${JSON.stringify(intent)}`);

    // Lower confidence threshold for better intent detection
    const confidenceThreshold = 0.3;

    if (intent.isJournalEntry && intent.confidence > confidenceThreshold) {
      // Save as journal entry and provide conversational response
      await this.handleJournalEntry(msg);
      if (intent.suggestedResponse) {
        await this.bot.sendMessage(msg.chat.id, intent.suggestedResponse, { parse_mode: 'Markdown' });
      }
    } else if (intent.isQuestion && intent.confidence > confidenceThreshold) {
      // Handle as a question/query
      await this.handleQueryCommand(msg, msgText);
      // await this.handleQuestion(msg, intent);
    } else if (intent.isCasualChat && intent.confidence > confidenceThreshold) {
      // Handle as casual chat
      if (intent.suggestedResponse) {
        await this.bot.sendMessage(msg.chat.id, intent.suggestedResponse, { parse_mode: 'Markdown' });
      }
    } else if (intent.isReminder && intent.confidence > confidenceThreshold) {
      // Handle as reminder request
      await this.handleReminderCommand(msg, msgText, intent?.suggestedResponse);  
    } else if (intent.isDeleteReminder && intent.confidence > confidenceThreshold) {

      await this.handleSmartDeleteReminderCommand(msg, msgText, intent?.suggestedResponse);
    }
     else {
      // Smart fallback based on intent hints and confidence
      await this.handleLowConfidenceMessage(msg, intent);
    }
    return;
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
🌟 Welcome to your Personal Journal Bot\\! 🌟

I'm here to help you capture your thoughts, experiences, and reflections\\. Here's how I work:

📝 **Journaling**: Send me text messages or 🎤 voice messages \\- I'll save them as journal entries
🔍 **Querying**: Ask about your past entries
⏰ **Reminders**: Set reminders for yourself

Start by sharing what's on your mind today \\- type or speak\\! ✨
      `;

      await this.bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
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
• 🎤 Send voice messages \\- I'll transcribe them automatically\\!
• 🎵 Send audio files \\- I'll convert speech to text
• I'll automatically save and analyze your thoughts

🔍 **Querying**:
• Ask about your journal entries
• Example: "How was my mood last week\\?"

⏰ **Reminders**:
• Create a smart reminder \\(e\\.g\\., "remind me to call mom tomorrow at 3pm"\\) 
• List all your active reminders
• Cancel a specific reminder \\(e\\.g\\., "Delete my Reminder to go for groceries today at 6pm"\\) 

❓ **Other**:
• /help \\- Show this help message
• /start \\- Restart the bot

💡 **Tips**:
• Be descriptive in your entries for better insights
• Voice messages are great for quick journaling on the go\\!
• Ask specific questions for more accurate responses
• Regular journaling helps me understand you better\\!
    `;

    await this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
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

      // Escape special characters in the query for markdown
      const escapedQuery = escapeMarkdown(query);

      let replyMessage = `🤔 **Your Question**: ${escapedQuery}\n\n`;
      replyMessage += `💭 **My Response**:\n${response.answer}`;

      if (response.relevantEntries.length > 0) {
        replyMessage += `\n\n📚 **Based on ${response.relevantEntries.length} relevant entries**`;
        replyMessage += `\n🎯 **Confidence**: ${response.confidence}%`;
      }

      await this.bot.sendMessage(chatId, replyMessage, { parse_mode: 'Markdown' });
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

      await this.bot.sendMessage(chatId, replyMessage, { parse_mode: 'Markdown' });
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

      await this.bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
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

  private async handleQuestion(msg: TelegramBot.Message, intent: any) {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    const messageText = msg.text;

    if (!telegramId || !messageText) {
      await this.bot.sendMessage(chatId, 'Sorry, I could not process your question. Please try again.');
      return;
    }

    try {
      // Find user
      const user = await this.userService.findOrCreateUser(telegramId, msg.from?.username);

      // Check if it's a question about their journal entries
      if (messageText.toLowerCase().includes('journal') || 
          messageText.toLowerCase().includes('entry') || 
          messageText.toLowerCase().includes('wrote') ||
          messageText.toLowerCase().includes('said') ||
          messageText.toLowerCase().includes('thought')) {
        
        // Use the existing query functionality
        await this.handleQueryCommand(msg, messageText);
        return;
      }

      // For general questions, provide a helpful response
      const response = intent.suggestedResponse || 
        `🤖 **I'm your Personal Journal Bot!** 

I'm here to help you with your journaling journey. Here are the things I can do:

📝 **Journaling**:
• Type any message to create a journal entry
• 🎤 Send voice messages - I'll transcribe them automatically!
• 🎵 Send audio files - I'll convert speech to text

🔍 **Querying Your Journal**:
• Ask about your past entries
• Example: "How was my mood last week?"

⏰ **Reminders**:
• Set reminders for yourself

What would you like to know about your journaling or how can I help you today?`;

      await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });

    } catch (error) {
      this.logger.error('Error handling question:', error);
      await this.bot.sendMessage(chatId, 'Sorry, there was an error processing your question. Please try again.');
    }
  }

  private async handleLowConfidenceMessage(msg: TelegramBot.Message, intent: any) {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;
    const messageText = msg.text;

    if (!telegramId || !messageText) {
      return;
    }

    try {
      // Find user
      const user = await this.userService.findOrCreateUser(telegramId, msg.from?.username);

      // Smart fallback logic based on intent hints and message content
      const messageLower = messageText.toLowerCase();
      
      // Check for obvious question indicators
      const hasQuestionMark = messageText.includes('?');
      const hasQuestionWords = /\b(what|how|why|when|where|who|which|can|could|would|will|do|does|is|are|was|were)\b/i.test(messageText);
      
      // Check for casual chat indicators
      const hasGreetingWords = /\b(hello|hi|hey|good morning|good afternoon|good evening|thanks|thank you|bye|goodbye)\b/i.test(messageText);
      
      // Check for journal-like content (personal pronouns, feelings, experiences)
      const hasPersonalContent = /\b(i|me|my|mine|myself|we|us|our|ours|ourselves)\b/i.test(messageText);
      const hasFeelingWords = /\b(feel|felt|feeling|happy|sad|angry|excited|worried|anxious|calm|peaceful|stressed|relaxed|tired|energetic|confused|clear|sure|unsure|doubt|hope|wish|want|need|like|love|hate|miss|remember|forget)\b/i.test(messageText);

      // Determine the most likely intent based on content analysis
      let finalIntent = 'journal';
      let confidence = intent.confidence;
      let response = '';

      if (hasQuestionMark || hasQuestionWords) {
        finalIntent = 'question';
        confidence = Math.max(confidence, 0.6);
        response = intent.suggestedResponse || `🤖 **I'm your Personal Journal Bot!** 

I'm here to help you with your journaling journey. Here are the things I can do:

📝 **Journaling**:
• Type any message to create a journal entry
• 🎤 Send voice messages - I'll transcribe them automatically!
• 🎵 Send audio files - I'll convert speech to text

🔍 **Querying Your Journal**:
• Ask about your past entries
• Example: "How was my mood last week?"

⏰ **Reminders**:
• Set reminders for yourself

What would you like to know about your journaling or how can I help you today?`;
      } else if (hasGreetingWords) {
        finalIntent = 'casual';
        confidence = Math.max(confidence, 0.6);
        response = intent.suggestedResponse || `👋 **Hello! I'm your Personal Journal Bot!** 

I'm here to help you capture your thoughts, experiences, and reflections. Here's what I can do:

📝 **Journaling**: Send me text messages or voice messages - I'll save them as journal entries
🔍 **Querying**: Ask about your past entries  
⏰ **Reminders**: Set reminders for yourself

Start by sharing what's on your mind today - type or speak! ✨

How can I help you with your journaling today?`;
      } else if (hasPersonalContent && hasFeelingWords) {
        finalIntent = 'journal';
        confidence = Math.max(confidence, 0.7);
        response = intent.suggestedResponse || "Thank you for sharing that with me. I've saved it as a journal entry.";
      }

      // Log the improved intent detection
      this.logger.debug(`Improved intent detection: ${finalIntent} (confidence: ${confidence}) for message: "${messageText}"`);

      // Handle based on improved intent
      if (finalIntent === 'question') {
        await this.handleQuestion(msg, { ...intent, confidence, suggestedResponse: response });
      } else if (finalIntent === 'casual') {
        await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      } else {
        // Default to journal entry
        await this.handleJournalEntry(msg);
        await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      }

    } catch (error) {
      this.logger.error('Error handling low confidence message:', error);
      // Final fallback: save as journal entry
      await this.handleJournalEntry(msg);
      await this.bot.sendMessage(chatId, `📝 **I've saved that as a journal entry!** 

I'm your Personal Journal Bot and I'm here to help you capture your thoughts and experiences. Here's what I can do:

📝 **Journaling**: Send me any message to create journal entries
🔍 **Querying**: Ask about your past entries
⏰ **Reminders**: Set reminders for yourself

Feel free to ask me questions or just share your thoughts! ✨`, { parse_mode: 'Markdown' });
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
      let transcribedText = '';
      try {
        transcribedText = await this.aiService.speechToText(audioFilePath);
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Transcribed text length: ${transcribedText.length}`);
        }
      } finally {
        await fs.remove(audioFilePath).catch(() => { });
      }

      if (!transcribedText.trim()) {
        await this.bot.editMessageText('❌ Could not transcribe the voice message. Please try again.', {
          chat_id: chatId,
          message_id: processingMsg.message_id,
        });
        return;
      }


      await this.processTextMessages(msg, transcribedText);

      return;
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
      await fs.remove(audioFilePath).catch(() => { });

      if (!transcribedText.trim()) {
        await this.bot.editMessageText('❌ Could not transcribe the audio message. Please try again.', {
          chat_id: chatId,
          message_id: processingMsg.message_id,
        });
        return;
      }

      await this.processTextMessages(msg, transcribedText);

      return;
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
          if (process.env.NODE_ENV !== 'production') {
            this.logger.log(`Audio file downloaded: ${filePath}`);
          }
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
  private async handleReminderCommand(msg: TelegramBot.Message, match: any | null, suggestedResponse?: string) {
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
      const reminderText = match;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`reminderText`, reminderText);
      }

      // Get user's timezone (default to Asia/Kolkata for now, can be made configurable later)
      const userTimezone = 'Asia/Kolkata'; // TODO: Get from user preferences
      const aiResponse = await this.aiService.parseReminderRequest(reminderText, userTimezone);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`aiResponse received`, aiResponse);
      }

      // Check if AI returned tool calls - handle different response formats
      const message = aiResponse.choices?.[0]?.message;
      const toolCalls = message?.tool_calls || message?.toolCalls;

      if (process.env.NODE_ENV !== 'production') {
        console.log(`toolCalls count`, toolCalls?.length || 0);
      }

      if (toolCalls && toolCalls.length > 0) {
        const toolCall = toolCalls[0];
        const toolResult = await this.aiService.handleReminderToolCall(toolCall, user.id, chatId.toString());
        if (toolResult.action === 'create_reminder') {
          // Create the reminder
          const reminder = await this.reminderService.createReminder(
            user.id,
            chatId.toString(),
            toolResult.params
          );
          console.log(`toolResult`, toolResult.params);
          
          const scheduledTime = new Date(toolResult.params.scheduledAt).toLocaleString();
          await this.bot.sendMessage(
            chatId,
            `✅ Reminder created!\n\n📝 *${escapeMarkdown(suggestedResponse ?? reminder.title)}*\n📅 Scheduled for: ${escapeMarkdown(toolResult?.params?.recurrencePattern?.timeOfDay)}\n🔄 Type: ${escapeMarkdown(reminder.type)}`,
            { parse_mode: 'Markdown' }
          );
        } else if (toolResult.action === 'match_reminders_for_deletion') {
          // Handle smart reminder matching for deletion
          const userReminders = await this.reminderService.getUserReminders(user.id);
          const matches = await this.reminderMatcherService.matchReminders(
            userReminders,
            toolResult.params,
            userTimezone
          );

          if (matches.length === 0) {
            await this.bot.sendMessage(
              chatId,
              '❌ No matching reminders found. Use /list_reminders to see all your reminders.'
            );
          } else if (matches.length === 1 && matches[0].score >= 70) {
            // High confidence single match - delete directly
            const reminder = matches[0].reminder;
            await this.reminderService.deleteReminder(reminder.id);
            await this.bot.sendMessage(
              chatId,
              `✅ Deleted reminder: **${escapeMarkdown(reminder.title)}**\n\n🔍 Match confidence: ${Math.round(matches[0].score)}%\n📝 Reasons: ${matches[0].reasons.join(', ')}`,
              { parse_mode: 'Markdown' }
            );
          } else {
            // Multiple matches or low confidence - show options
            const categorized = this.reminderMatcherService.categorizeMatches(matches);
            let message = '🔍 **Found multiple matching reminders:**\n\n';

            if (categorized.high.length > 0) {
              message += '**High confidence matches:**\n';
              categorized.high.forEach((match, index) => {
                const nextTime = match.reminder.nextExecution
                  ? TimezoneUtils.formatDateInTimezone(match.reminder.nextExecution, userTimezone)
                  : 'Completed';
                message += `${index + 1}. **${escapeMarkdown(match.reminder.title)}** (${Math.round(match.score)}%)\n`;
                message += `   📅 Next: ${nextTime}\n`;
                message += `   🆔 ID: \`${match.reminder.id}\`\n\n`;
              });
            }

            if (categorized.medium.length > 0) {
              message += '**Medium confidence matches:**\n';
              categorized.medium.forEach((match, index) => {
                const nextTime = match.reminder.nextExecution
                  ? TimezoneUtils.formatDateInTimezone(match.reminder.nextExecution, userTimezone)
                  : 'Completed';
                message += `${index + 1}. **${escapeMarkdown(match.reminder.title)}** (${Math.round(match.score)}%)\n`;
                message += `   📅 Next: ${nextTime}\n`;
              });
            }

            message += '\n💡 Use `/cancel_reminder [ID]` to delete a specific reminder.';
            await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
          }
        }
      } else {
        // Fallback: Try to parse manually or use AI response text
        if (process.env.NODE_ENV !== 'production') {
          console.log('No tool calls found, trying fallback parsing...');
        }

        const aiText = aiResponse.choices?.[0]?.message?.content;

        // Try simple manual parsing as fallback
        const fallbackReminder = this.parseReminderFallback(reminderText, userTimezone);
        if (fallbackReminder) {
          const reminder = await this.reminderService.createReminder(
            user.id,
            chatId.toString(),
            fallbackReminder
          );

          const scheduledTime = new Date(fallbackReminder.scheduledAt).toLocaleString();
          await this.bot.sendMessage(
            chatId,
            `✅ Reminder created \\(fallback parsing\\)\\!\n\n📝 **${escapeMarkdown(reminder.title)}**\n📅 Scheduled for: ${scheduledTime}\n🔄 Type: ${reminder.type}\n\n🆔 ID: \`${reminder.id}\``,
            { parse_mode: 'Markdown' }
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

  private async handleSmartDeleteReminderCommand(msg: TelegramBot.Message, match: any | null, suggestedResponse: string | null = null ) {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id;

    if (!telegramId || !match || !match[1]) {
      await this.bot.sendMessage(chatId, 'Please describe the reminder you want to delete.\n\nExamples:\n- `/delete_reminder call mom today`\n- `/delete_reminder medicine reminder`\n- `/delete_reminder the 6pm meeting`');
      return;
    }

    try {
      const user = await this.userService.findByTelegramId(telegramId);
      if (!user) {
        await this.bot.sendMessage(chatId, 'Please start the bot first with /start');
        return;
      }

      await this.bot.sendChatAction(chatId, 'typing');

      const deletionDescription = match;
      const userTimezone = 'Asia/Kolkata'; // TODO: Get from user preferences

      if (process.env.NODE_ENV !== 'production') {
        console.log(`Smart deletion request: "${deletionDescription}"`);
      }

      // Parse deletion request with AI
      const aiResponse = await this.aiService.parseSmartDeletionRequest(deletionDescription, userTimezone);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`smart deletion aiResponse received`);
      }

      // Check if AI returned tool calls
      const message = aiResponse.choices?.[0]?.message;
      const toolCalls = message?.tool_calls || message?.toolCalls;

      if (process.env.NODE_ENV !== 'production') {
        console.log(`smart deletion toolCalls count`, toolCalls?.length || 0);
      }

      if (toolCalls && toolCalls.length > 0) {
        const toolCall = toolCalls[0];

        const toolResult = await this.aiService.handleReminderToolCall(toolCall, user.id, chatId.toString());

        if (toolResult.action === 'match_reminders_for_deletion') {
          // Get user's reminders and match them
          const userReminders = await this.reminderService.getUserReminders(user.id);

          if (userReminders.length === 0) {
            await this.bot.sendMessage(chatId, '📝 You don\'t have any reminders to delete.');
            return;
          }

          const matches = await this.reminderMatcherService.matchReminders(
            userReminders,
            toolResult.params,
            userTimezone
          );

          if (process.env.NODE_ENV !== 'production') {
            console.log(`Found ${matches.length} matches:`, matches.map(m => ({
              title: m.reminder.title,
              score: m.score,
              isRecurring: m.isRecurring
            })));
          }

          if (matches.length === 0) {
            await this.bot.sendMessage(
              chatId,
              `❌ No reminders found matching "${deletionDescription}".\n\nUse /list_reminders to see all your reminders, or try being more specific.`
            );
          } else if (matches.length === 1 && matches[0].score >= 70) {
            // High confidence single match - handle based on recurring status and scope
            const match = matches[0];
            const reminder = match.reminder;

            if (!match.isRecurring) {
              // Simple one-time reminder deletion
              await this.reminderService.deleteReminder(reminder.id);

              const nextTime = reminder.nextExecution
                ? TimezoneUtils.formatDateInTimezone(reminder.nextExecution, userTimezone)
                : 'Completed';

              await this.bot.sendMessage(
                chatId,
                `✅ **Deleted reminder successfully\\!**\n\n📝 **${escapeMarkdown(suggestedResponse ?? reminder.title)}**\n📅 Was scheduled for: ${nextTime}\n\n🔍 Match confidence: ${Math.round(match.score)}%\n📋 Reasons: ${match.reasons.join(', ')}`,
                { parse_mode: 'Markdown' }
              );
            } else {
              // Recurring reminder - handle based on deletion scope
              const deletionParams = toolResult.params;

              if (deletionParams.deletionScope === 'ambiguous') {
                // Show options for recurring reminder
                const optionsMessage = this.reminderMatcherService.formatRecurringOptions(reminder, userTimezone);
                await this.bot.sendMessage(chatId, optionsMessage, { parse_mode: 'Markdown' });
              } else {
                // Execute deletion with specified scope
                const scope = {
                  type: deletionParams.deletionScope as 'single' | 'series' | 'from_date',
                  targetDate: deletionParams.scopeDate ? new Date(deletionParams.scopeDate) : undefined,
                  fromDate: deletionParams.scopeDate ? new Date(deletionParams.scopeDate) : undefined
                };

                const deletionResult = await this.recurringDeletionService.deleteWithScope(
                  reminder,
                  scope,
                  userTimezone
                );

                if (deletionResult.success) {
                  await this.bot.sendMessage(
                    chatId,
                    `✅ **${deletionResult.message}**\n\n🔍 Match confidence: ${Math.round(match.score)}%\n📋 Reasons: ${match.reasons.join(', ')}`,
                    { parse_mode: 'Markdown' }
                  );
                } else {
                  // Handle specific failure cases with appropriate icons and messages
                  const icon = deletionResult.message.includes('already occurred') ? '⏰' : '❌';
                  await this.bot.sendMessage(
                    chatId,
                    `${icon} **${deletionResult.message}**\n\n🔍 Match confidence: ${Math.round(match.score)}%\n📋 Reasons: ${match.reasons.join(', ')}\n\n💡 **Tip:** You can only delete future reminders or reminders that haven't occurred yet.`,
                    { parse_mode: 'Markdown' }
                  );
                }
              }
            }
          } else {
            // Multiple matches or low confidence - show options with recurring information
            const categorized = this.reminderMatcherService.categorizeMatches(matches);
            let responseMessage = `🔍 **Found ${matches.length} matching reminders for "${deletionDescription}":**\n\n`;

            if (categorized.high.length > 0) {
              responseMessage += '**🎯 High confidence matches:**\n';
              categorized.high.forEach((match, index) => {
                const nextTime = match.reminder.nextExecution
                  ? TimezoneUtils.formatDateInTimezone(match.reminder.nextExecution, userTimezone)
                  : 'Completed';

                const recurringIcon = match.isRecurring ? '🔄' : '📅';
                const recurringText = match.isRecurring ? ` (${match.reminder.type} recurring)` : ' (one-time)';

                responseMessage += `${index + 1}. **${escapeMarkdown(match.reminder.title)}** (${Math.round(match.score)}% match)\n`;
                responseMessage += `   ${recurringIcon} Next: ${nextTime}${recurringText}\n`;
                responseMessage += `   🔍 Why: ${match.reasons.join(', ')}\n`;

                if (match.isRecurring && match.suggestedScope) {
                  const scopeText = {
                    'single': 'single occurrence',
                    'series': 'entire series',
                    'from_date': 'from specific date'
                  }[match.suggestedScope];
                  responseMessage += `   💡 Suggested: Delete ${scopeText}\n`;
                }

                responseMessage += `   🆔 ID: \`${match.reminder.id}\`\n\n`;
              });
            }

            if (categorized.medium.length > 0) {
              responseMessage += '**🤔 Medium confidence matches:**\n';
              categorized.medium.forEach((match, index) => {
                const nextTime = match.reminder.nextExecution
                  ? TimezoneUtils.formatDateInTimezone(match.reminder.nextExecution, userTimezone)
                  : 'Completed';

                const recurringIcon = match.isRecurring ? '🔄' : '📅';
                const recurringText = match.isRecurring ? ` (${match.reminder.type})` : '';

                responseMessage += `${index + 1}. **${escapeMarkdown(match.reminder.title)}** (${Math.round(match.score)}% match)\n`;
                responseMessage += `   ${recurringIcon} Next: ${nextTime}${recurringText}\n`;
                responseMessage += `   🆔 ID: \`${match.reminder.id}\`\n\n`;
              });
            }

            responseMessage += '\n💡 **To delete a specific reminder:**\n';
            responseMessage += '• Use `/cancel_reminder [ID]` with the ID above\n';
            responseMessage += '• For recurring reminders, be specific:\n';
            responseMessage += '  - `today\'s [reminder]` for single occurrence\n';
            responseMessage += '  - `all [reminder] reminders` for entire series\n';
            responseMessage += '• Or try being more specific in your description';

            await this.bot.sendMessage(chatId, responseMessage, { parse_mode: 'Markdown' });
          }
        } else {
          if (process.env.NODE_ENV !== 'production') {
            console.log(`Unknown tool result action: ${toolResult.action}`);
          }
          await this.bot.sendMessage(
            chatId,
            `❌ I couldn't process the deletion request. Please try again or use /list_reminders to see your reminders.`
          );
        }
      } else {
        // AI couldn't parse the deletion request or no tool calls found
        if (process.env.NODE_ENV !== 'production') {
          console.log(`No tool calls found in AI response`);
        }

        // Try to provide a helpful response based on the AI's text response
        const aiText = message?.content;
        if (aiText) {
          await this.bot.sendMessage(
            chatId,
            `❌ I couldn't understand your deletion request: "${deletionDescription}"\n\n🤖 AI Response: ${aiText}\n\n💡 **Try these formats:**\n• \`/delete_reminder call mom today\`\n• \`/delete_reminder medicine reminder\`\n• \`/delete_reminder the 6pm meeting\`\n• \`/delete_reminder tomorrow's workout\`\n\nOr use \`/list_reminders\` to see all your reminders.`,
            { parse_mode: 'Markdown' }
          );
        } else {
          await this.bot.sendMessage(
            chatId,
            `❌ I couldn't understand your deletion request: "${deletionDescription}"\n\n💡 **Try these formats:**\n• \`/delete_reminder call mom today\`\n• \`/delete_reminder medicine reminder\`\n• \`/delete_reminder the 6pm meeting\`\n• \`/delete_reminder tomorrow's workout\`\n\nOr use \`/list_reminders\` to see all your reminders.`,
            { parse_mode: 'Markdown' }
          );
        }
      }
    } catch (error) {
      this.logger.error('Error in smart delete reminder:', error);
      await this.bot.sendMessage(chatId, '❌ Sorry, I couldn\'t process your deletion request. Please try again or use /list_reminders to see your reminders.');
    }
  }

  private async handleTestRemindersCommand(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;

    try {
      await this.bot.sendMessage(chatId, '🔍 Testing reminder system...');

      // Manually trigger the reminder scheduler
      await this.reminderSchedulerService.triggerDueReminders();

      await this.bot.sendMessage(chatId, '✅ Reminder check completed! Check logs for details.');
    } catch (error) {
      this.logger.error('Error testing reminders:', error);
      await this.bot.sendMessage(chatId, '❌ Error testing reminders.');
    }
  }

  // Fallback parsing method for simple reminders
  private parseReminderFallback(text: string, timezone: string = 'Asia/Kolkata'): any | null {
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.log('Fallback parsing input:', text);
      }

      // Simple regex patterns for common reminder formats
      const patterns = [
        /remind me to (.+) (today|tomorrow) at (\d{1,2}):(\d{2})\s*(am|pm)/i,
        /remind me to (.+) at (\d{1,2}):(\d{2})\s*(am|pm)/i,
        /remind me to (.+) (today|tomorrow)/i,
        /remind me to (.+)/i
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (process.env.NODE_ENV !== 'production') {
          console.log('Pattern match:', pattern, match);
        }

        if (match) {
          const title = match[1].trim();

          // Get current date in user's timezone
          const now = new Date();
          const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

          let targetDate = new Date(localNow);

          if (match[2] === 'tomorrow') {
            targetDate.setDate(targetDate.getDate() + 1);
          }

          if (match[3] && match[4] && match[5]) { // Has time with AM/PM
            let hours = parseInt(match[3]);
            const minutes = parseInt(match[4]);
            const ampm = match[5].toLowerCase();

            if (process.env.NODE_ENV !== 'production') {
              console.log('Parsing time:', hours, minutes, ampm);
            }

            // Validate parsed values
            if (isNaN(hours) || isNaN(minutes)) {
              if (process.env.NODE_ENV !== 'production') {
                console.log('Invalid time values, using default');
              }
              hours = 9;
            } else {
              if (ampm === 'pm' && hours !== 12) hours += 12;
              if (ampm === 'am' && hours === 12) hours = 0;
            }

            targetDate.setHours(hours, minutes || 0, 0, 0);
          } else {
            // Default to 9 AM if no time specified
            targetDate.setHours(9, 0, 0, 0);
          }

          // Convert local time to UTC for storage
          // For Asia/Kolkata (UTC+5:30), subtract 5.5 hours to get UTC
          let utcDate: Date;
          if (timezone === 'Asia/Kolkata') {
            utcDate = new Date(targetDate.getTime() - (5.5 * 60 * 60 * 1000));
          } else {
            utcDate = targetDate; // Fallback to original time
          }

          if (process.env.NODE_ENV !== 'production') {
            console.log('Local target time:', targetDate.toString());
            console.log('UTC time for storage:', utcDate.toISOString());
            console.log('Verification - UTC back to local:', utcDate.toLocaleString('en-US', { timeZone: timezone }));
          }

          const result = {
            title,
            type: 'once',
            scheduledAt: utcDate.toISOString(),
            recurrencePattern: {
              timezone: timezone
            }
          };

          if (process.env.NODE_ENV !== 'production') {
            console.log('Fallback parsing result:', result);
          }
          return result;
        }
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log('No pattern matched');
      }
      return null;
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Fallback parsing error:', error);
      }
      return null;
    }
  }

  // Method to send reminder notifications (called by scheduler)
  async sendReminderNotification(reminder: any) {
    try {
      const chatId = reminder.chatRoomId;
      let message = `🔔 **Reminder**\n\n📝 ${escapeMarkdown(reminder.title)}`;

      if (reminder.description) {
        message += `\n\n${escapeMarkdown(reminder.description)}`;
      }

      // Format time in user's timezone
      const timezone = reminder.recurrencePattern?.timezone || 'Asia/Kolkata';
      const localTime = TimezoneUtils.formatDateInTimezone(reminder.scheduledAt, timezone);
      message += `\n\n⏰ Scheduled for: ${localTime}`;

      await this.sendMessageWithRetry(chatId, message, { parse_mode: 'Markdown' });
      this.logger.log(`Sent reminder notification: ${reminder.id}`);
    } catch (error) {
      this.logger.error(`Error sending reminder notification for ${reminder.id}:`, error);
    }
  }
}
