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
            'create a reminder'
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