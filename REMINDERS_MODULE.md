# 📅 Reminders Module

## Overview
The Reminders Module provides intelligent reminder functionality for your Telegram journaling bot using AI-powered natural language parsing with Mistral AI.

## 🎯 Features

### ✅ **Reminder Types**
- **Once**: Single occurrence reminders
- **Daily**: Every day at specified time
- **Weekly**: Specific days of the week
- **Monthly**: Specific day of month
- **Yearly**: Annual reminders
- **Custom**: Complex patterns

### ✅ **AI-Powered Parsing**
- Natural language input processing
- Intelligent time/date extraction
- Automatic recurrence pattern detection
- Tool calling with Mistral AI

### ✅ **Flexible Scheduling**
- Timezone support
- End date limits
- Maximum occurrence limits
- Snooze functionality
- Priority levels

## 🗄️ Database Schema

### Reminders Table
```sql
- id (UUID, Primary Key)
- userId (UUID, Foreign Key to users)
- chatRoomId (BIGINT, Telegram chat ID)
- title (TEXT, Reminder title)
- description (TEXT, Optional description)
- type (ENUM: once, daily, weekly, monthly, yearly, custom)
- status (ENUM: active, paused, completed, cancelled)
- scheduledAt (TIMESTAMP, First execution time)
- nextExecution (TIMESTAMP, Next execution time)
- recurrencePattern (JSONB, Recurrence configuration)
- executionCount (INT, Number of times executed)
- lastExecutedAt (TIMESTAMP, Last execution time)
- preferences (JSONB, User preferences)
- createdAt/updatedAt (TIMESTAMP)
```

## 🤖 AI Tool Functions

### 1. **create_reminder**
Creates new reminders from natural language input.

**Example inputs:**
- "Remind me to call mom tomorrow at 3pm"
- "Remind me to take medicine every day at 8am"
- "Remind me about the meeting every Monday at 10am"
- "Remind me to pay rent on the 1st of every month"

### 2. **list_reminders**
Lists user's active reminders with details.

### 3. **update_reminder**
Updates existing reminder properties.

### 4. **delete_reminder**
Removes a reminder by ID.

## 🔄 Scheduler Service

### Background Processing
- Runs every minute to check due reminders
- Automatic execution and next occurrence calculation
- Handles recurring patterns intelligently
- Logs execution history

### Recurrence Patterns
```json
{
  "interval": 2,           // Every 2 weeks
  "daysOfWeek": [1, 3, 5], // Monday, Wednesday, Friday
  "dayOfMonth": 15,        // 15th of each month
  "timeOfDay": "09:30",    // 9:30 AM
  "timezone": "UTC",       // User timezone
  "endDate": "2024-12-31", // Stop date
  "maxOccurrences": 10     // Max repetitions
}
```

## 🚀 Usage Examples

### Natural Language Examples
```
User: "Remind me to water plants every Tuesday and Thursday at 7am"
AI: Creates weekly reminder for days 2,4 at 07:00

User: "Remind me about mom's birthday on March 15th every year"
AI: Creates yearly reminder for March 15th

User: "Remind me to backup files every 2 weeks on Friday at 6pm"
AI: Creates custom reminder with 2-week interval on Fridays
```

## 🔧 Integration Steps

### Step 1: Run Migration
```bash
npm run migration:run
```

### Step 2: Update Telegram Bot
The module is ready to integrate with your Telegram bot service for:
- Processing reminder commands
- Sending reminder notifications
- Handling user interactions

### Step 3: AI Integration
The AI service now includes:
- `parseReminderRequest()` - Parse natural language
- `handleReminderToolCall()` - Process tool calls

## 📋 Next Steps

1. **Integrate with Telegram Bot**: Add reminder command handlers
2. **Add Notification System**: Send reminders via Telegram
3. **Add Snooze Functionality**: Allow users to postpone reminders
4. **Add Reminder Templates**: Pre-defined reminder patterns
5. **Add Analytics**: Track reminder completion rates

## 🎯 Ready for Integration!

The reminders module is now complete with:
- ✅ Database schema and migrations
- ✅ AI-powered natural language parsing
- ✅ Flexible scheduling system
- ✅ Background scheduler service
- ✅ Tool calling integration with Mistral AI

Ready to integrate with your Telegram bot! 🚀
