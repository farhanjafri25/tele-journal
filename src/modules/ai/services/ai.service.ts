import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { Mistral } from "@mistralai/mistralai";
import { AssemblyAI } from 'assemblyai';
import { env } from "../../../../env";
import * as fs from 'fs-extra';
import { reminderTools, CreateReminderParams, ListRemindersParams, UpdateReminderParams, DeleteReminderParams, MatchRemindersForDeletionParams } from '../../reminders/tools/reminder-tools';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

@Injectable()
export class AiService {
    private readonly logger = new Logger(AiService.name);
    private openAi?: OpenAI;
    private mistral?: Mistral;
    private assemblyAI?: AssemblyAI;

    constructor(
    ) {
        this.initializeProviders();
    }

    private initializeProviders() {
        if (env.AI_PROVIDER === 'openai' && env.OPENAI_API_KEY) {
            this.openAi = new OpenAI({ apiKey: env.OPENAI_API_KEY });
            this.logger.log('OpenAI provider initialized');
        } else if (env.AI_PROVIDER === 'mistral' && env.MISTRAL_API_KEY) {
            this.mistral = new Mistral({ apiKey: env.MISTRAL_API_KEY });
            this.logger.log('Mistral provider initialized');
        } else {
            throw new Error(`Invalid AI provider configuration. Provider: ${env.AI_PROVIDER}`);
        }
    }

    async embedText(text: string): Promise<number[]> {
        if (env.AI_PROVIDER === 'openai' && this.openAi) {
            return this.embedWithOpenAI(text);
        } else if (env.AI_PROVIDER === 'mistral' && this.mistral) {
            return this.embedWithMistral(text);
        } else {
            throw new Error('No embedding provider available');
        }
    }

    async chat(messages: ChatMessage[]): Promise<string> {
        if (env.AI_PROVIDER === 'openai' && this.openAi) {
            return this.chatWithOpenAI(messages);
        } else if (env.AI_PROVIDER === 'mistral' && this.mistral) {
            return this.chatWithMistral(messages);
        } else {
            throw new Error('No chat provider available');
        }
    }

    async speechToText(audioFilePath: string): Promise<string> {
        return this.speechToTextWithAssemblyAI(audioFilePath);
    }

    async isReminderIntent(text: string): Promise<{ isReminder: boolean; confidence: number; rationale?: string }> {
        const hay = text.toLowerCase();
        const keywordMatches = [
            'remind me',
            'set a reminder',
            "don't let me forget",
            'do not let me forget',
            'i need to remember',
            'make a reminder',
            'create a reminder',
            'schedule a task',
            'schedule a meeting',
            'schedule a call',
            'schedule a reminder',
            'schedule a'
        ];

        const matched = keywordMatches.some(k => hay.includes(k));
        if (matched) {
            return { isReminder: true, confidence: 0.9, rationale: 'Matched reminder phrase keyword' };
        }

        try {
            const prompt = [
                { role: 'system', content: 'You classify if the user intends to create a reminder. Answer strictly as JSON: {"isReminder": boolean, "confidence": number, "reason": string}.' },
                { role: 'user', content: `Text: "${text}"\nIs the intent to create a reminder?` }
            ];
            const res = await this.chat(prompt as any);
            try {
                const parsed = JSON.parse(res);
                return { isReminder: !!parsed.isReminder, confidence: Number(parsed.confidence) || 0.5, rationale: parsed.reason };
            } catch {
                const yes = /\byes\b|reminder/i.test(res);
                return { isReminder: yes, confidence: yes ? 0.6 : 0.2, rationale: 'LLM heuristic fallback' };
            }
        } catch (err) {
            this.logger.warn('Intent classification fallback due to error', err as any);
            return { isReminder: false, confidence: 0.0 };
        }
    }

    async detectMessageIntent(text: string): Promise<{ 
        isJournalEntry: boolean; 
        isQuestion: boolean; 
        isCasualChat: boolean;
        isReminder: boolean;
        isDeleteReminder: boolean;
        confidence: number; 
        rationale?: string;
        suggestedResponse?: string;
    }> {
        try {
            const prompt = [
                { 
                    role: 'system', 
                    content: `You are an AI assistant that classifies user messages into four categories:
1. JOURNAL_ENTRY: Personal reflections, experiences, feelings, daily events, thoughts, memories
2. QUESTION: Direct questions, requests for summary in regards to personal life, help with regards to his personal experience or journal, or advice
3. CASUAL_CHAT: Greetings, casual conversation, small talk, thanks
4. REMINDER: Direct Reminders, Requests to set reminders, or alarms, or schedule tasks
5. DELETE_REMINDER: Delete Reminders, Cancel Reminders, Remove Reminders, Cancel scheduled tasks
Always choose the most appropriate single category that best fits the user's intent. If multiple categories seem relevant, prioritize in this order: QUESTION > REMINDER > CASUAL_CHAT > JOURNAL_ENTRY.

Respond strictly as JSON: {
  "intent": "JOURNAL_ENTRY|QUESTION|CASUAL_CHAT|REMINDER|DELETE_REMINDER",
  "confidence": number (0-1),
  "reason": "brief explanation",
  "response": "appropriate conversational response"
}`
                },
                { 
                    role: 'user', 
                    content: `Classify this message: "${text}"`
                }
            ];
            
            const res = await this.chat(prompt as any); 
            console.log(`response`, res);
                       
            try {
                let content = res.replace(/```json|```/g, '').trim();

                const parsed = JSON.parse(content);
                console.log(`parsed response`, parsed);
                
                return {
                    isJournalEntry: parsed.intent === 'JOURNAL_ENTRY',
                    isQuestion: parsed.intent === 'QUESTION',
                    isCasualChat: parsed.intent === 'CASUAL_CHAT',
                    isReminder: parsed.intent === 'REMINDER',
                    isDeleteReminder: parsed.intent === 'DELETE_REMINDER',
                    confidence: Number(parsed.confidence) || 0.5,
                    rationale: parsed.reason,
                    suggestedResponse: parsed.response
                };
            } catch {
                // Enhanced fallback to simple heuristics if AI response parsing fails
                const hay = text.toLowerCase();
                
                // More comprehensive question detection
                const hasQuestionMark = /\?$/.test(text);
                // More intelligent question word detection - avoid common words that appear in statements
                const hasQuestionWords = /\b(what|how|why|when|where|who|which|can|could|would|will)\b/i.test(text);
                // Check for question patterns like "do you", "are you", "is this", etc.
                const hasQuestionPatterns = /\b(do you|are you|is this|are they|can you|would you|could you|will you|have you|did you|does this|is that|are those)\b/i.test(text);
                const isQuestion = hasQuestionMark || hasQuestionWords || hasQuestionPatterns;
                
                // More comprehensive casual chat detection
                const hasGreetingWords = /\b(hello|hi|hey|good morning|good afternoon|good evening|morning|afternoon|evening)\b/i.test(text);
                const hasThanksWords = /\b(thanks|thank you|thx|ty|appreciate|grateful)\b/i.test(text);
                const hasFarewellWords = /\b(bye|goodbye|see you|later|take care|good night|night)\b/i.test(text);
                const isCasual = hasGreetingWords || hasThanksWords || hasFarewellWords;
                
                // Enhanced journal entry detection
                const hasPersonalPronouns = /\b(i|me|my|mine|myself|we|us|our|ours|ourselves)\b/i.test(text);
                const hasFeelingWords = /\b(feel|felt|feeling|happy|sad|angry|excited|worried|anxious|calm|peaceful|stressed|relaxed|tired|energetic|confused|clear|sure|unsure|doubt|hope|wish|want|need|like|love|hate|miss|remember|forget)\b/i.test(text);
                const hasExperienceWords = /\b(today|yesterday|tomorrow|week|month|year|morning|afternoon|evening|night|experience|happened|went|did|saw|heard|thought|realized|learned|discovered|trip|travel|visited|explored|saw|enjoyed|had|spent|time|ocean|beach|nature|place|location|city|town|village|country)\b/i.test(text);
                
                // More intelligent journal entry detection
                const isJournalEntry = !isQuestion && !isCasual && (
                    hasPersonalPronouns || 
                    hasFeelingWords || 
                    hasExperienceWords ||
                    // Additional check for personal narrative structure
                    (/\b(so|then|after|while|when|as|because|since)\b/i.test(text) && hasPersonalPronouns)
                );
                
                // Calculate confidence based on indicators
                let confidence = 0.4;
                if (hasQuestionMark) confidence += 0.2;
                if (hasQuestionWords) confidence += 0.1;
                if (hasQuestionPatterns) confidence += 0.15;
                if (hasGreetingWords || hasThanksWords || hasFarewellWords) confidence += 0.2;
                if (hasPersonalPronouns) confidence += 0.15;
                if (hasFeelingWords) confidence += 0.15;
                if (hasExperienceWords) confidence += 0.15;
                
                // Boost confidence for clearly personal content
                if (hasPersonalPronouns && hasExperienceWords) confidence += 0.1;
                if (/\b(so|then|after|while|when|as|because|since)\b/i.test(text) && hasPersonalPronouns) confidence += 0.1;
                
                confidence = Math.min(confidence, 0.9); // Cap at 0.9
                
                return {
                    isJournalEntry: isJournalEntry,
                    isQuestion: isQuestion,
                    isCasualChat: isCasual,
                    isReminder: false,
                    isDeleteReminder: false,
                    confidence: confidence,
                    rationale: 'AI parsing failed, using enhanced fallback heuristics',
                    suggestedResponse: isQuestion ? this.getQuestionResponse() : 
                                      isCasual ? this.getCasualChatResponse() : 
                                      this.generateJournalResponse(text)
                };
            }
        } catch (err) {
            this.logger.warn('Intent classification failed', err as any);
            
            // Enhanced final fallback with content analysis
            const textLower = text.toLowerCase();
            
            // Check for obvious indicators even in error cases
            const hasQuestionMark = text.includes('?');
            // More intelligent question word detection - avoid common words that appear in statements
            const hasQuestionWords = /\b(what|how|why|when|where|who|which|can|could|would|will)\b/i.test(text);
            // Check for question patterns like "do you", "are you", "is this", etc.
            const hasQuestionPatterns = /\b(do you|are you|is this|are they|can you|would you|could you|will you|have you|did you|does this|is that|are those)\b/i.test(text);
            const hasGreetingWords = /\b(hello|hi|hey|good morning|good afternoon|good evening|morning|afternoon|evening)\b/i.test(text);
            const hasThanksWords = /\b(thanks|thank you|thx|ty|appreciate|grateful)\b/i.test(text);
            
            let isQuestion = hasQuestionMark || hasQuestionWords || hasQuestionPatterns;
            let isCasual = hasGreetingWords || hasThanksWords;
            let isJournal = !isQuestion && !isCasual;
            
            // Calculate confidence based on available indicators
            let confidence = 0.3;
            if (hasQuestionMark) confidence += 0.2;
            if (hasQuestionWords) confidence += 0.1;
            if (hasGreetingWords || hasThanksWords) confidence += 0.2;
            
            confidence = Math.min(confidence, 0.6); // Cap at 0.6 for error cases
            
            return {
                isJournalEntry: isJournal,
                isQuestion: isQuestion,
                isCasualChat: isCasual,
                isReminder: false,
                isDeleteReminder: false,
                confidence: confidence,
                rationale: 'Classification failed, using emergency fallback with content analysis',
                suggestedResponse: isQuestion ? this.getQuestionResponse() : 
                                  isCasual ? this.getCasualChatResponse() : 
                                  this.generateJournalResponse(text)
            };
        }
    }

    private generateJournalResponse(text: string): string {
        // Memory-efficient response selection using simple array
        const responses = [
            "Thank you for sharing that with me.",
            "I appreciate you taking the time to reflect.",
            "That's a meaningful reflection.",
            "Thank you for your honesty.",
            "I hear you.",
            "That's an interesting perspective.",
            "Thank you for sharing.",
            "I appreciate your reflection.",
            "That sounds like a significant experience.",
            "Thank you for being open."
        ];
        
        return responses[Math.floor(Math.random() * responses.length)];
    }

    private getQuestionResponse(): string {
        return `🤖 **I'm your Personal Journal Bot!** 

I'm here to help you with your journaling journey. Here are the things I can do:

📝 **Journaling**:
• Type any message to create a journal entry
• 🎤 Send voice messages - I'll transcribe them automatically!
• 🎵 Send audio files - I'll convert speech to text

🔍 **Querying Your Journal**:
• /query <question> - Ask about your past entries
• Example: "/query How was my mood last week?"

📊 **Insights & Analytics**:
• /summary - Get a summary of your recent entries
• /stats - View your journaling statistics

⏰ **Reminders**:
• /remind <what> <when> - Set reminders for yourself

What would you like to know about your journaling or how can I help you today?`;
    }

    private getCasualChatResponse(): string {
        return `👋 **Hello! I'm your Personal Journal Bot!** 

I'm here to help you capture your thoughts, experiences, and reflections. Here's what I can do:

📝 **Journaling**: Send me text messages or voice messages - I'll save them as journal entries
🔍 **Querying**: Use /query <your question> to ask about your past entries  
📊 **Summary**: Use /summary to get insights about your recent entries
📈 **Stats**: Use /stats to see your journaling statistics
⏰ **Reminders**: Use /remind to set reminders for yourself

Start by sharing what's on your mind today - type or speak! ✨

How can I help you with your journaling today?`;
    }

    private async speechToTextWithAssemblyAI(audioFilePath: string): Promise<string> {
        if (!env.ASSEMBLYAI_API_KEY) {
            throw new Error('AssemblyAI API key required for speech-to-text');
        }

        if (!this.assemblyAI) {
            this.assemblyAI = new AssemblyAI({ apiKey: env.ASSEMBLYAI_API_KEY });
        }

        try {
            this.logger.log('Starting AssemblyAI transcription...');

            // Upload and transcribe the audio file
            const transcript = await this.assemblyAI.transcripts.transcribe({
                audio: audioFilePath,
                speech_model: 'best', // Use the best available model
            });

            if (transcript.status === 'error') {
                throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
            }

            if (!transcript.text) {
                throw new Error('No transcription text returned from AssemblyAI');
            }

            this.logger.log('AssemblyAI transcription completed successfully', transcript.text);
            return transcript.text;
        } catch (error) {
            this.logger.error('Error in AssemblyAI speech-to-text:', error);
            throw new Error('Failed to convert speech to text with AssemblyAI');
        }
    }

    async parseReminderRequest(userMessage: string, userTimezone: string = 'Asia/Kolkata'): Promise<any> {
        if (!this.mistral) {
            throw new Error('Mistral AI not initialized');
        }

        try {
            const currentLocalTime = new Date().toLocaleString('en-US', { timeZone: userTimezone });
            const systemPrompt = `You are a helpful assistant that parses natural language reminder requests and converts them into structured data.

Current date and time in user's timezone (${userTimezone}): ${currentLocalTime}
Current UTC time: ${new Date().toISOString()}

IMPORTANT: When creating scheduledAt times, convert the user's local time to UTC for storage.
For example, if user says "6:15 PM" and they're in Asia/Kolkata (UTC+5:30),
then 6:15 PM local = 12:45 PM UTC, so scheduledAt should be the UTC time.

Parse the user's reminder request and determine:
1. What they want to be reminded about (title and description)
2. When they want to be reminded (date and time in their local timezone)
3. Convert the local time to UTC for the scheduledAt field
4. If it's recurring (daily, weekly, monthly, etc.)
5. Any specific patterns (days of week, time of day, etc.)

Always include the user's timezone in the recurrencePattern.timezone field.

Use the create_reminder function to structure the reminder data. Be intelligent about parsing relative times like "tomorrow", "next week", "every Monday", etc.

Examples:
- "Remind me to call mom tomorrow at 3pm" → once reminder for tomorrow 3pm LOCAL TIME (convert to UTC)
- "Remind me to take medicine every day at 8am" → daily recurring at 8am LOCAL TIME (convert to UTC)
- "Remind me about the meeting every Monday at 10am" → weekly recurring on Mondays at 10am LOCAL TIME (convert to UTC)
- "Remind me to pay rent on the 1st of every month" → monthly recurring on 1st day`;

            const response = await this.mistral.chat.complete({
                model: env.MISTRAL_CHAT_MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                tools: reminderTools,
                toolChoice: 'auto'
            });

            if (process.env.NODE_ENV !== 'production') {
                console.log('Mistral API response (truncated)');
            }
            return response;
        } catch (error) {
            this.logger.error('Error parsing reminder request:', error);
            throw new Error('Failed to parse reminder request');
        }
    }

    async parseSmartDeletionRequest(userMessage: string, userTimezone: string = 'Asia/Kolkata'): Promise<any> {
        try {
            const currentLocalTime = new Date().toLocaleString('en-US', { timeZone: userTimezone });
            const systemPrompt = `You are a helpful assistant that parses natural language requests to find and delete reminders with granular control over recurring reminders.

Current date and time in user's timezone (${userTimezone}): ${currentLocalTime}

The user wants to delete a reminder based on their description. You MUST use the match_reminders_for_deletion function to parse their request.

Parse their request and extract:
1. Key words or phrases that describe the reminder content
2. Time context (today, tomorrow, specific times, etc.)
3. Deletion scope for recurring reminders
4. Your confidence level in the match

IMPORTANT: For recurring reminders, determine the user's intent:
- SINGLE OCCURRENCE: "delete today's medicine reminder", "cancel just this morning's workout"
- ENTIRE SERIES: "delete all medicine reminders", "remove the medicine reminder series", "cancel all my workout reminders"
- FROM DATE: "delete medicine reminders from tomorrow onwards", "stop my workout reminders from next week"
- AMBIGUOUS: When unclear, mark as ambiguous for user clarification

ALWAYS call the match_reminders_for_deletion function with these parameters:
- description: The original user request
- keywords: Array of key words from the reminder description
- timeContext: Time references like "today", "tomorrow", etc.
- deletionScope: "single" | "series" | "from_date" | "ambiguous"
- recurringIntent: "single_occurrence" | "entire_series" | "future_from_date" | "unclear"
- scopeDate: ISO date for single occurrence or start date for from_date scope
- confidence: "high" | "medium" | "low"

Examples:
- "delete my call mom reminder for today" → match_reminders_for_deletion(description="delete my call mom reminder for today", keywords=["call", "mom"], timeContext="today", deletionScope="single", recurringIntent="single_occurrence", scopeDate="2025-08-26", confidence="high")
- "remove all medicine reminders" → match_reminders_for_deletion(description="remove all medicine reminders", keywords=["medicine"], deletionScope="series", recurringIntent="entire_series", confidence="high")
- "delete the medicine reminder" → match_reminders_for_deletion(description="delete the medicine reminder", keywords=["medicine"], deletionScope="ambiguous", recurringIntent="unclear", confidence="medium")

You MUST call the function for every deletion request.`;

            const userMessageFormatted = `Please help me delete this reminder: "${userMessage}"`;

            // Debug: Check available tools
            if (process.env.NODE_ENV !== 'production') {
                console.log('Available reminder tools:', reminderTools.map(tool => tool.function.name));
                console.log('Looking for match_reminders_for_deletion tool...');
            }
            const deletionTool = reminderTools.find(tool => tool.function.name === 'match_reminders_for_deletion');
            if (process.env.NODE_ENV !== 'production') {
                console.log('Deletion tool found:', !!deletionTool);
            }

            // Try with forced tool choice first
            let response: any;
            try {
                response = await this.mistral?.chat.complete({
                    model: env.MISTRAL_CHAT_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessageFormatted }
                    ],
                    tools: reminderTools,
                    toolChoice: {
                        type: 'function',
                        function: { name: 'match_reminders_for_deletion' }
                    }
                });
            } catch (toolChoiceError) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log('Forced tool choice failed, trying with auto:', toolChoiceError);
                }
                // Fallback to auto tool choice
                response = await this.mistral?.chat.complete({
                    model: env.MISTRAL_CHAT_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessageFormatted }
                    ],
                    tools: reminderTools,
                    toolChoice: 'auto'
                });
            }

            if (process.env.NODE_ENV !== 'production') {
                console.log('Mistral smart deletion response (truncated)');
            }
            return response;
        } catch (error) {
            this.logger.error('Error parsing smart deletion request:', error);
            throw new Error('Failed to parse smart deletion request');
        }
    }

    async handleReminderToolCall(toolCall: any, userId: number, chatRoomId: string): Promise<any> {
        const { name, arguments: args } = toolCall.function;
        if (process.env.NODE_ENV !== 'production') {
            console.log(`toolCall.function`, toolCall.function);
            console.log(`raw args:`, args, typeof args);
        }

        // Parse arguments if they're a string
        let parsedArgs: any;
        if (typeof args === 'string') {
            try {
                parsedArgs = JSON.parse(args);
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`parsed args:`, parsedArgs);
                }
            } catch (error) {
                console.error('Error parsing tool call arguments:', error);
                throw new Error('Invalid tool call arguments format');
            }
        } else {
            parsedArgs = args;
        }

        switch (name) {
            case 'create_reminder':
                return {
                    action: 'create_reminder',
                    params: parsedArgs as CreateReminderParams,
                    userId,
                    chatRoomId
                };

            case 'list_reminders':
                return {
                    action: 'list_reminders',
                    params: parsedArgs as ListRemindersParams,
                    userId,
                    chatRoomId
                };

            case 'update_reminder':
                return {
                    action: 'update_reminder',
                    params: parsedArgs as UpdateReminderParams,
                    userId,
                    chatRoomId
                };

            case 'delete_reminder':
                return {
                    action: 'delete_reminder',
                    params: parsedArgs as DeleteReminderParams,
                    userId,
                    chatRoomId
                };

            case 'match_reminders_for_deletion':
                return {
                    action: 'match_reminders_for_deletion',
                    params: parsedArgs as MatchRemindersForDeletionParams,
                    userId,
                    chatRoomId
                };

            default:
                throw new Error(`Unknown tool call: ${name}`);
        }
    }



    private async embedWithOpenAI(text: string): Promise<number[]> {
        const res = await this.openAi!.embeddings.create({
            model: env.OPENAI_EMBEDDING_MODEL,
            input: text,
        });
        return res.data[0].embedding as number[];
    }

    private async embedWithMistral(text: string): Promise<number[]> {
        const res = await this.mistral!.embeddings.create({
            model: env.MISTRAL_EMBEDDING_MODEL,
            inputs: [text],
        });
        return res.data[0].embedding as number[];
    }

    private async chatWithOpenAI(messages: ChatMessage[]): Promise<string> {
        const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map(msg => ({
            role: msg.role,
            content: msg.content,
        }));

        const res = await this.openAi!.chat.completions.create({
            model: env.OPENAI_CHAT_MODEL,
            messages: openAiMessages,
        });
        return res.choices[0]?.message?.content ?? '';
    }

    private async chatWithMistral(messages: ChatMessage[]): Promise<string> {
        const mistralMessages = messages.map(msg => ({
            role: msg.role,
            content: msg.content,
        }));

        const res = await this.mistral!.chat.complete({
            model: env.MISTRAL_CHAT_MODEL,
            messages: mistralMessages,
        });

        const content = res.choices?.[0]?.message?.content;
        return typeof content === 'string' ? content : '';
    }
}