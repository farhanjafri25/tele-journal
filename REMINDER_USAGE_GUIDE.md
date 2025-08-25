# 🔔 Reminder System Usage Guide

## 🚀 **Complete Reminder Functionality**

Your Telegram journaling bot now has a fully functional AI-powered reminder system!

## 📱 **How to Use Reminders**

### **1. Create Reminders with Natural Language**
```
/remind take medicine tomorrow at 8am
/remind call mom every Sunday at 3pm
/remind pay rent on the 1st of every month
/remind backup files every 2 weeks on Friday at 6pm
/remind mom's birthday on March 15th every year
```

### **2. List Your Reminders**
```
/reminders
```
Shows all your active reminders with:
- Title and description
- Next execution time
- Recurrence type
- Reminder ID for cancellation

### **3. Cancel Reminders**
```
/cancel_reminder abc123-def456-ghi789
```
Use the ID from the `/reminders` list to cancel specific reminders.

## 🤖 **AI-Powered Parsing Examples**

The AI understands various natural language patterns:

### **Time Expressions**
- "tomorrow at 3pm"
- "next Monday at 9am"
- "in 2 hours"
- "at 8:30am"

### **Recurring Patterns**
- "every day at 8am"
- "every Monday and Wednesday"
- "every 2 weeks"
- "on the 15th of every month"
- "every year on December 25th"

### **Complex Examples**
```
/remind water plants every Tuesday and Thursday at 7am
→ Creates weekly reminder for days 2,4 at 07:00

/remind team meeting every other Monday at 10am for 6 months
→ Creates bi-weekly reminder with end date

/remind take vitamins daily at 8am except weekends
→ Creates weekday-only daily reminder
```

## 🔄 **How It Works Behind the Scenes**

1. **User Input**: You type a natural language reminder
2. **AI Parsing**: Mistral AI extracts time, recurrence, and details
3. **Tool Calling**: AI calls `create_reminder` function with structured data
4. **Storage**: Reminder saved to database with calculated next execution
5. **Scheduling**: Background service checks every minute for due reminders
6. **Notification**: Bot sends reminder message to your chat

## 📅 **Reminder Types Supported**

- **Once**: Single occurrence reminders
- **Daily**: Every day at specified time
- **Weekly**: Specific days of the week
- **Monthly**: Specific day of month
- **Yearly**: Annual reminders
- **Custom**: Complex patterns with intervals

## 🔔 **Notification Format**

When a reminder triggers, you'll receive:
```
🔔 **Reminder**

📝 Take medicine

⏰ Scheduled for: 2024-01-15 08:00:00
```

## ⚙️ **Advanced Features**

### **Timezone Support**
- Reminders respect your local timezone
- Times are stored and displayed correctly

### **Flexible Recurrence**
- End dates for recurring reminders
- Maximum occurrence limits
- Custom intervals (every 2 weeks, every 3 months, etc.)

### **Smart Scheduling**
- Automatic next execution calculation
- Handles edge cases (month-end dates, leap years)
- Execution tracking and history

## 🛠️ **Setup Required**

1. **Run Migration**: `npm run migration:run`
2. **Start Bot**: Your reminder system is ready!

## 📋 **Available Commands**

- `/remind [text]` - Create smart reminder
- `/reminders` - List active reminders  
- `/cancel_reminder [ID]` - Cancel reminder
- `/help` - Show all commands

## 🎯 **Ready to Use!**

Your reminder system is now complete with:
- ✅ AI-powered natural language parsing
- ✅ Flexible scheduling and recurrence
- ✅ Automatic notifications via Telegram
- ✅ Background processing
- ✅ Complete CRUD operations

Start creating reminders with natural language! 🚀
