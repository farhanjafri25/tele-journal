export const DEFAULT_MESSAGE_FOR_WRONG_COMMAND = `
🚨 Uh oh!, looks like you've entered an invalid command. Please try again with one of the following commands:

📝 **Journaling**:
• Type any message to create a journal entry
• 🎤 Send voice messages \\- I'll transcribe them automatically\\!
• 🎵 Send audio files \\- I'll convert speech to text
• I'll automatically save and analyze your thoughts

🔍 **Querying**:
• /query <question> \\- Ask about your journal entries
• Example: "/query How was my mood last week\\?"

📊 **Insights**:
• /summary \\- Get a summary of your recent entries
• /stats \\- View your journaling statistics

⏰ **Reminders**:
• /remind [text] \\- Create a smart reminder \\(e\\.g\\., "remind me to call mom tomorrow at 3pm"\\) 
• /reminders \\- List all your active reminders
• /delete\\_reminder [reminder description] \\- Cancel a specific reminder \\(e\\.g\\., "Delete my Reminder to go for groceries today at 6pm"\\) 

❓ **Other**:
• /help \\- Show this help message
• /start \\- Restart the bot

💡 **Tips**:
• Be descriptive in your entries for better insights
• Voice messages are great for quick journaling on the go\\!
• Ask specific questions for more accurate responses
• Regular journaling helps me understand you better\\!
    `;

export const QUERY_COMMANDS = ["/query", "/start", "/help", "/summary", "/stats", "/remind", "/reminders", "/delete_reminder", "/cancel_reminder"];