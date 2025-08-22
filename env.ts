import 'dotenv/config';

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 3000,
  TELEGRAM_BOT_TOKEN: required('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_WEBHOOK_URL: process.env.TELEGRAM_WEBHOOK_URL, // optional if using long polling
  DATABASE_URL: required('DATABASE_URL'),

  // AI Provider Configuration
  AI_PROVIDER: process.env.AI_PROVIDER ?? 'mistral', // 'openai' or 'mistral'
  SPEECH_PROVIDER: process.env.SPEECH_PROVIDER ?? 'huggingface', // 'openai', 'huggingface'

  // OpenAI Configuration (optional - only needed if using OpenAI for speech/chat/embeddings)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY, // Optional: only for OpenAI speech-to-text
  OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  OPENAI_CHAT_MODEL: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',

  // Hugging Face Configuration (free speech-to-text)
  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY, // Optional: for faster inference

  // AssemblyAI Configuration (speech-to-text)
  ASSEMBLYAI_API_KEY: process.env.ASSEMBLYAI_API_KEY, // Required for speech-to-text

  // Mistral Configuration
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  MISTRAL_CHAT_MODEL: process.env.MISTRAL_CHAT_MODEL ?? 'mistral-small-latest',
  MISTRAL_EMBEDDING_MODEL: process.env.MISTRAL_EMBEDDING_MODEL ?? 'mistral-embed',
}

function required(key: string): string {
    const v = process.env[key];
    if (!v) throw new Error(`Missing env: ${key}`);
    return v;
  }