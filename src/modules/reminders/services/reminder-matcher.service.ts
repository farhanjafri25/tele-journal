import { Injectable, Logger } from '@nestjs/common';
import { Reminder } from '../entities/reminder.entity';
import { MatchRemindersForDeletionParams } from '../tools/reminder-tools';
import { TimezoneUtils } from '../utils/timezone.utils';

export interface ReminderMatch {
  reminder: Reminder;
  score: number;
  reasons: string[];
  isRecurring: boolean;
  suggestedScope?: 'single' | 'series' | 'from_date';
}

@Injectable()
export class ReminderMatcherService {
  private readonly logger = new Logger(ReminderMatcherService.name);

  /**
   * Match reminders based on AI-parsed criteria
   */
  async matchReminders(
    userReminders: Reminder[],
    matchParams: MatchRemindersForDeletionParams,
    timezone: string = 'Asia/Kolkata'
  ): Promise<ReminderMatch[]> {
    const matches: ReminderMatch[] = [];

    for (const reminder of userReminders) {
      const match = this.scoreReminder(reminder, matchParams, timezone);
      if (match.score > 0) {
        matches.push(match);
      }
    }

    // Sort by score (highest first)
    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Score a single reminder against the match criteria
   */
  private scoreReminder(
    reminder: Reminder,
    matchParams: MatchRemindersForDeletionParams,
    timezone: string
  ): ReminderMatch {
    let score = 0;
    const reasons: string[] = [];

    // 1. Keyword matching in title and description
    const titleScore = this.calculateKeywordScore(
      reminder.title.toLowerCase(),
      matchParams.keywords
    );
    if (titleScore > 0) {
      score += titleScore * 40; // Title matches are weighted heavily
      reasons.push(`Title contains: ${matchParams.keywords.join(', ')}`);
    }

    if (reminder.description) {
      const descScore = this.calculateKeywordScore(
        reminder.description.toLowerCase(),
        matchParams.keywords
      );
      if (descScore > 0) {
        score += descScore * 20; // Description matches are weighted less
        reasons.push(`Description contains: ${matchParams.keywords.join(', ')}`);
      }
    }

    // 2. Time context matching
    if (matchParams.timeContext) {
      const timeScore = this.calculateTimeScore(reminder, matchParams.timeContext, timezone);
      if (timeScore > 0) {
        score += timeScore * 30; // Time matches are important
        reasons.push(`Time matches: ${matchParams.timeContext}`);
      }
    }

    // 3. Exact phrase matching
    const exactScore = this.calculateExactPhraseScore(reminder, matchParams.description);
    if (exactScore > 0) {
      score += exactScore * 50; // Exact phrases get highest weight
      reasons.push(`Exact phrase match found`);
    }

    // 4. Semantic similarity (simple word overlap)
    const semanticScore = this.calculateSemanticScore(reminder, matchParams.description);
    if (semanticScore > 0) {
      score += semanticScore * 15;
      reasons.push(`Similar content detected`);
    }

    const isRecurring = reminder.type !== 'once';
    let suggestedScope: 'single' | 'series' | 'from_date' | undefined;

    // Suggest scope based on match criteria
    if (isRecurring) {
      if (matchParams.timeContext && (
        matchParams.timeContext.includes('today') ||
        matchParams.timeContext.includes('tomorrow') ||
        matchParams.timeContext.includes('this')
      )) {
        suggestedScope = 'single';
      } else if (matchParams.description.toLowerCase().includes('all') ||
                 matchParams.description.toLowerCase().includes('entire')) {
        suggestedScope = 'series';
      } else if (matchParams.timeContext && (
        matchParams.timeContext.includes('onwards') ||
        matchParams.timeContext.includes('from')
      )) {
        suggestedScope = 'from_date';
      }
    }

    return {
      reminder,
      score: Math.min(score, 100), // Cap at 100
      reasons,
      isRecurring,
      suggestedScope
    };
  }

  /**
   * Calculate keyword matching score
   */
  private calculateKeywordScore(text: string, keywords: string[]): number {
    let matches = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matches++;
      }
    }
    return keywords.length > 0 ? matches / keywords.length : 0;
  }

  /**
   * Calculate time context matching score
   */
  private calculateTimeScore(reminder: Reminder, timeContext: string, timezone: string): number {
    if (!reminder.nextExecution) return 0;

    const now = new Date();
    const today = new Date(now.toDateString());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const timeContextLower = timeContext.toLowerCase();

    // Check for specific time patterns
    if (timeContextLower.includes('today')) {
      const reminderDate = new Date(reminder.nextExecution.toDateString());
      return reminderDate.getTime() === today.getTime() ? 1 : 0;
    }

    if (timeContextLower.includes('tomorrow')) {
      const reminderDate = new Date(reminder.nextExecution.toDateString());
      return reminderDate.getTime() === tomorrow.getTime() ? 1 : 0;
    }

    // Check for specific times (6pm, 18:00, etc.)
    const timeMatch = timeContextLower.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
    if (timeMatch) {
      const reminderHour = reminder.nextExecution.getHours();
      let targetHour = parseInt(timeMatch[1]);
      
      if (timeMatch[3]) {
        const period = timeMatch[3].toLowerCase();
        if (period === 'pm' && targetHour !== 12) targetHour += 12;
        if (period === 'am' && targetHour === 12) targetHour = 0;
      }

      return reminderHour === targetHour ? 1 : 0;
    }

    // Check for time periods
    if (timeContextLower.includes('morning')) {
      const hour = reminder.nextExecution.getHours();
      return (hour >= 6 && hour < 12) ? 0.8 : 0;
    }

    if (timeContextLower.includes('afternoon')) {
      const hour = reminder.nextExecution.getHours();
      return (hour >= 12 && hour < 17) ? 0.8 : 0;
    }

    if (timeContextLower.includes('evening')) {
      const hour = reminder.nextExecution.getHours();
      return (hour >= 17 && hour < 21) ? 0.8 : 0;
    }

    if (timeContextLower.includes('night')) {
      const hour = reminder.nextExecution.getHours();
      return (hour >= 21 || hour < 6) ? 0.8 : 0;
    }

    return 0;
  }

  /**
   * Calculate exact phrase matching score
   */
  private calculateExactPhraseScore(reminder: Reminder, description: string): number {
    const descLower = description.toLowerCase();
    const titleLower = reminder.title.toLowerCase();
    const reminderDescLower = reminder.description?.toLowerCase() || '';

    // Check for exact phrase matches
    const phrases = descLower.split(' ').filter(word => word.length > 2);
    let matches = 0;

    for (const phrase of phrases) {
      if (titleLower.includes(phrase) || reminderDescLower.includes(phrase)) {
        matches++;
      }
    }

    return phrases.length > 0 ? matches / phrases.length : 0;
  }

  /**
   * Calculate semantic similarity score (simple word overlap)
   */
  private calculateSemanticScore(reminder: Reminder, description: string): number {
    const descWords = description.toLowerCase().split(' ').filter(word => word.length > 2);
    const titleWords = reminder.title.toLowerCase().split(' ').filter(word => word.length > 2);
    const reminderDescWords = reminder.description?.toLowerCase().split(' ').filter(word => word.length > 2) || [];

    const allReminderWords = [...titleWords, ...reminderDescWords];
    let commonWords = 0;

    for (const word of descWords) {
      if (allReminderWords.includes(word)) {
        commonWords++;
      }
    }

    return descWords.length > 0 ? commonWords / descWords.length : 0;
  }

  /**
   * Categorize matches by confidence level
   */
  categorizeMatches(matches: ReminderMatch[]): {
    high: ReminderMatch[];
    medium: ReminderMatch[];
    low: ReminderMatch[];
  } {
    return {
      high: matches.filter(m => m.score >= 70),
      medium: matches.filter(m => m.score >= 40 && m.score < 70),
      low: matches.filter(m => m.score >= 20 && m.score < 40)
    };
  }

  /**
   * Format match results for display with recurring information
   */
  formatMatchResults(matches: ReminderMatch[], timezone: string = 'Asia/Kolkata'): string {
    if (matches.length === 0) {
      return "❌ No matching reminders found.";
    }

    let message = `🔍 **Found ${matches.length} matching reminder(s):**\n\n`;

    matches.forEach((match, index) => {
      const nextTime = match.reminder.nextExecution
        ? TimezoneUtils.formatDateInTimezone(match.reminder.nextExecution, timezone)
        : 'Completed';

      const recurringIcon = match.isRecurring ? '🔄' : '📅';
      const recurringText = match.isRecurring ? ` (${match.reminder.type} recurring)` : ' (one-time)';

      message += `${index + 1}. **${match.reminder.title}** (${Math.round(match.score)}% match)\n`;
      message += `   ${recurringIcon} Next: ${nextTime}${recurringText}\n`;
      message += `   🔍 Reasons: ${match.reasons.join(', ')}\n`;

      if (match.isRecurring && match.suggestedScope) {
        const scopeText = {
          'single': 'single occurrence',
          'series': 'entire series',
          'from_date': 'from specific date'
        }[match.suggestedScope];
        message += `   💡 Suggested: Delete ${scopeText}\n`;
      }

      message += `   🆔 ID: \`${match.reminder.id}\`\n\n`;
    });

    return message;
  }

  /**
   * Format recurring reminder deletion options
   */
  formatRecurringOptions(reminder: Reminder, timezone: string = 'Asia/Kolkata'): string {
    const nextTime = reminder.nextExecution
      ? TimezoneUtils.formatDateInTimezone(reminder.nextExecution, timezone)
      : 'Completed';

    return `🔄 **"${reminder.title}" is a recurring reminder**\n\n` +
           `📅 Next occurrence: ${nextTime}\n` +
           `🔄 Type: ${reminder.type}\n\n` +
           `**Choose deletion scope:**\n` +
           `1️⃣ Delete only next occurrence\n` +
           `2️⃣ Delete entire recurring series\n` +
           `3️⃣ Stop from specific date onwards\n\n` +
           `💡 Use:\n` +
           `• \`/delete_reminder today's ${reminder.title.toLowerCase()}\` for single occurrence\n` +
           `• \`/delete_reminder all ${reminder.title.toLowerCase()} reminders\` for entire series\n` +
           `• \`/cancel_reminder ${reminder.id}\` for precise control`;
  }
}
