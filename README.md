# Telegram Journal Bot

A Telegram bot that allows users to journal about their everyday life and query their entries using AI-powered semantic search.

## Features

- 📝 **Journal Entries**: Send any message to the bot to create a journal entry
- 🔍 **AI-Powered Queries**: Ask questions about your journal entries using natural language
- 📊 **Insights & Summaries**: Get AI-generated summaries of your journaling patterns
- 📈 **Statistics**: Track your journaling habits and progress
- 🧠 **Semantic Search**: Uses OpenAI embeddings for intelligent entry retrieval

## Tech Stack

- **Backend**: NestJS with TypeScript
- **Database**: PostgreSQL with pgvector extension
- **AI**: Mistral AI (chat & embeddings) or OpenAI (optional)
- **Bot**: Telegram Bot API
- **ORM**: TypeORM

## Setup Instructions

### Prerequisites

1. **PostgreSQL with pgvector**: You need a PostgreSQL database with the pgvector extension installed
2. **Telegram Bot Token**: Create a bot via [@BotFather](https://t.me/botfather) on Telegram
3. **AI Provider**: Choose one:
   - **Mistral AI** (Recommended): Get your API key from [Mistral](https://console.mistral.ai/) - Free tier available
   - **OpenAI** (Optional): Get your API key from [OpenAI](https://platform.openai.com/) - Requires paid plan

### Installation

1. **Clone and install dependencies**:
   ```bash
   git clone <your-repo>
   cd tele-journal
   npm install
   ```

2. **Environment Configuration**:
   ```bash
   cp .env.example .env
   ```

   Fill in your environment variables:
   ```env
   NODE_ENV=development
   PORT=3000

   # Get from @BotFather on Telegram
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

   # PostgreSQL with pgvector extension
   DATABASE_URL=postgresql://username:password@localhost:5432/tele_journal

   # Get from OpenAI
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   OPENAI_CHAT_MODEL=gpt-4o-mini
   ```

3. **Database Setup**:
   ```bash
   # Run migrations to set up tables and pgvector
   npm run migration:run
   ```

4. **Start the application**:
   ```bash
   # Development
   npm run start:dev

   # Production
   npm run start:prod
   ```

## Bot Deployment Modes

### 🔄 **Polling Mode (Default - Recommended for Development)**

The bot uses polling by default, which means:
- ✅ **No webhook setup required**
- ✅ **Works behind firewalls/NAT**
- ✅ **Perfect for development and testing**
- ✅ **Easy to set up**

Just leave `TELEGRAM_WEBHOOK_URL` empty in your `.env` file.

### 🌐 **Webhook Mode (Recommended for Production)**

For production deployments, you can use webhook mode:

1. **Set up your domain**: You need a public HTTPS domain
2. **Configure webhook URL**: Set `TELEGRAM_WEBHOOK_URL=https://yourdomain.com` in `.env`
3. **Deploy**: The bot will automatically set up the webhook

**Webhook Benefits:**
- ⚡ **Faster response times**
- 🔋 **Lower server resource usage**
- 📈 **Better for high-traffic bots**
- 🔒 **More secure (HTTPS required)**

**Webhook Requirements:**
- Public HTTPS domain (SSL certificate required)
- Port 443, 80, 88, or 8443
- Valid SSL certificate

### 🚀 **Quick Start (No Setup Required)**

For immediate testing, just:
1. Get your bot token from [@BotFather](https://t.me/botfather)
2. Add it to `.env` as `TELEGRAM_BOT_TOKEN=your_token`
3. Run `npm run start:dev`
4. Your bot is ready! 🎉

## Bot Commands

- `/start` - Initialize the bot and get welcome message
- `/help` - Show available commands and usage instructions
- `/query <question>` - Ask questions about your journal entries
- `/summary` - Get an AI-generated summary of recent entries
- `/stats` - View your journaling statistics

## Usage Examples

### Journaling
Just send any message to the bot:
```
"Had a great day at work today. Finished the project I've been working on for weeks!"
```

### Querying
Ask questions about your entries:
```
/query How was my mood last week?
/query What projects have I been working on?
/query Tell me about my recent achievements
```

## Database Schema

### Users Table
- `id` - Primary key
- `telegram_id` - Telegram user ID (unique)
- `username` - Telegram username
- `created_at` - Account creation timestamp

### Journal Table
- `id` - Primary key
- `user_id` - Foreign key to users
- `entry` - Journal entry text
- `tags` - Optional tags array
- `embeddings` - Vector embeddings for semantic search
- `created_at` - Entry creation timestamp

## Development

### Scripts
- `npm run start:dev` - Start in development mode with hot reload
- `npm run build` - Build the application
- `npm run test` - Run tests
- `npm run migration:generate` - Generate new migration
- `npm run migration:run` - Run pending migrations

### Project Structure
```
src/
├── modules/
│   ├── ai/           # OpenAI integration
│   ├── journal/      # Journal entries management
│   ├── telegram/     # Telegram bot service
│   └── users/        # User management
├── database/         # Database configuration
└── migrations/       # Database migrations
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
