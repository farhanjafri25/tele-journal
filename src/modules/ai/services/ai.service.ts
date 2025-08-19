import { Injectable } from "@nestjs/common";
import { AiRepository } from "../repositories/ai.connection";
import OpenAI from "openai";
import { env } from "../../../../env";

@Injectable()
export class AiService {
    constructor(
        private readonly aiRepository: AiRepository,
    ) {}
    private openAi =  new OpenAI({ apiKey: env.OPENAI_API_KEY });

    async embedText(text: string): Promise<number[]> {
        const res = await this.openAi.embeddings.create({
            model: env.OPENAI_EMBEDDING_MODEL,
            input: text,
        })
        return res.data[0].embedding as number[];
    }

    async chat(messages: OpenAI.Chat.ChatCompletionMessageParam[]): Promise<string> {
        const res = await this.openAi.chat.completions.create({
            model: env.OPENAI_CHAT_MODEL,
            messages,
        });
        return res.choices[0]?.message?.content ?? ''; 
    }
}