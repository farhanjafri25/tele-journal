import 'dotenv/config';

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  TELEGRAM_BOT_TOKEN: required('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_WEBHOOK_URL: process.env.TELEGRAM_WEBHOOK_URL,
  DATABASE_URL: required('DATABASE_URL'),

  AI_PROVIDER: process.env.AI_PROVIDER ?? 'mistral', 
  SPEECH_PROVIDER: process.env.SPEECH_PROVIDER ?? 'huggingface',

  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  OPENAI_CHAT_MODEL: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',

  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY, 

  ASSEMBLYAI_API_KEY: process.env.ASSEMBLYAI_API_KEY, 

  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  MISTRAL_CHAT_MODEL: process.env.MISTRAL_CHAT_MODEL ?? 'mistral-small-latest',
  MISTRAL_EMBEDDING_MODEL: process.env.MISTRAL_EMBEDDING_MODEL ?? 'mistral-embed',
}

function required(key: string): string {
    const v = process.env[key];
    if (!v) throw new Error(`Missing env: ${key}`);
    return v;
  }