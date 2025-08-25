import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { Mistral } from "@mistralai/mistralai";
import { AssemblyAI } from 'assemblyai';
import { env } from "../../../../env";
import * as fs from 'fs-extra';
import { reminderTools, CreateReminderParams, ListRemindersParams, UpdateReminderParams, DeleteReminderParams } from '../../reminders/tools/reminder-tools';

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

    async parseReminderRequest(userMessage: string, userTimezone: string = 'UTC'): Promise<any> {
        if (!this.mistral) {
            throw new Error('Mistral AI not initialized');
        }

        try {
            const systemPrompt = `You are a helpful assistant that parses natural language reminder requests and converts them into structured data.

Current date and time: ${new Date().toISOString()}
User timezone: ${userTimezone}

Parse the user's reminder request and determine:
1. What they want to be reminded about (title and description)
2. When they want to be reminded (date and time)
3. If it's recurring (daily, weekly, monthly, etc.)
4. Any specific patterns (days of week, time of day, etc.)

Use the create_reminder function to structure the reminder data. Be intelligent about parsing relative times like "tomorrow", "next week", "every Monday", etc.

Examples:
- "Remind me to call mom tomorrow at 3pm" → once reminder for tomorrow 3pm
- "Remind me to take medicine every day at 8am" → daily recurring at 8am
- "Remind me about the meeting every Monday at 10am" → weekly recurring on Mondays at 10am
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

            console.log('Mistral API response:', JSON.stringify(response, null, 2));
            return response;
        } catch (error) {
            this.logger.error('Error parsing reminder request:', error);
            throw new Error('Failed to parse reminder request');
        }
    }

    async handleReminderToolCall(toolCall: any, userId: number, chatRoomId: string): Promise<any> {
        const { name, arguments: args } = toolCall.function;
        console.log(`toolCall.function`, toolCall.function);
        
        switch (name) {
            case 'create_reminder':
                return {
                    action: 'create_reminder',
                    params: args as CreateReminderParams,
                    userId,
                    chatRoomId
                };

            case 'list_reminders':
                return {
                    action: 'list_reminders',
                    params: args as ListRemindersParams,
                    userId,
                    chatRoomId
                };

            case 'update_reminder':
                return {
                    action: 'update_reminder',
                    params: args as UpdateReminderParams,
                    userId,
                    chatRoomId
                };

            case 'delete_reminder':
                return {
                    action: 'delete_reminder',
                    params: args as DeleteReminderParams,
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