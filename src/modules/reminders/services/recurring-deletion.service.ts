import { Injectable, Logger } from '@nestjs/common';
import { Reminder, ReminderType, ReminderStatus } from '../entities/reminder.entity';
import { ReminderRepository } from '../repositories/reminder.repository';
import { TimezoneUtils } from '../utils/timezone.utils';

export interface DeletionResult {
  success: boolean;
  deletionType: 'single' | 'series' | 'from_date';
  deletedCount: number;
  affectedReminders: string[];
  message: string;
}

export interface DeletionScope {
  type: 'single' | 'series' | 'from_date';
  targetDate?: Date;
  fromDate?: Date;
}

@Injectable()
export class RecurringDeletionService {
  private readonly logger = new Logger(RecurringDeletionService.name);

  constructor(private readonly reminderRepository: ReminderRepository) {}

  /**
   * Delete reminder with granular control over recurring reminders
   */
  async deleteWithScope(
    reminder: Reminder,
    scope: DeletionScope,
    timezone: string = 'Asia/Kolkata'
  ): Promise<DeletionResult> {
    try {
      if (reminder.type === ReminderType.ONCE) {
        // One-time reminders are always deleted entirely
        await this.reminderRepository.delete(reminder.id);
        return {
          success: true,
          deletionType: 'single',
          deletedCount: 1,
          affectedReminders: [reminder.id],
          message: `Deleted one-time reminder: "${reminder.title}"`
        };
      }

      // Handle recurring reminders based on scope
      switch (scope.type) {
        case 'single':
          return await this.deleteSingleOccurrence(reminder, scope.targetDate, timezone);
        
        case 'series':
          return await this.deleteEntireSeries(reminder);
        
        case 'from_date':
          return await this.deleteFromDate(reminder, scope.fromDate, timezone);
        
        default:
          throw new Error(`Unknown deletion scope: ${scope.type}`);
      }
    } catch (error) {
      this.logger.error('Error in deleteWithScope:', error);
      return {
        success: false,
        deletionType: scope.type,
        deletedCount: 0,
        affectedReminders: [],
        message: `Failed to delete reminder: ${error.message}`
      };
    }
  }

  /**
   * Delete a single occurrence of a recurring reminder
   */
  private async deleteSingleOccurrence(
    reminder: Reminder,
    targetDate?: Date,
    timezone: string = 'Asia/Kolkata'
  ): Promise<DeletionResult> {
    // For single occurrence deletion, we need to add an exclusion date
    // or create a new reminder series that skips this occurrence
    
    const exclusionDate = targetDate || reminder.nextExecution || new Date();
    
    // Add exclusion date to the reminder's recurrence pattern
    const updatedPattern = {
      ...reminder.recurrencePattern,
      exclusionDates: [
        ...(reminder.recurrencePattern?.exclusionDates || []),
        exclusionDate.toISOString()
      ]
    };

    await this.reminderRepository.update(reminder.id, {
      recurrencePattern: updatedPattern
    });

    // Recalculate next execution to skip the excluded date
    const nextExecution = this.calculateNextExecutionSkippingExclusions(
      reminder,
      updatedPattern,
      timezone
    );

    if (nextExecution) {
      await this.reminderRepository.update(reminder.id, {
        nextExecution
      });
    } else {
      // No more future occurrences, mark as completed
      await this.reminderRepository.update(reminder.id, {
        status: ReminderStatus.COMPLETED
      });
    }

    const formattedDate = TimezoneUtils.formatDateInTimezone(exclusionDate, timezone);
    
    return {
      success: true,
      deletionType: 'single',
      deletedCount: 1,
      affectedReminders: [reminder.id],
      message: `Deleted single occurrence of "${reminder.title}" for ${formattedDate}. Future occurrences remain active.`
    };
  }

  /**
   * Delete entire recurring series
   */
  private async deleteEntireSeries(reminder: Reminder): Promise<DeletionResult> {
    await this.reminderRepository.delete(reminder.id);
    
    return {
      success: true,
      deletionType: 'series',
      deletedCount: 1,
      affectedReminders: [reminder.id],
      message: `Deleted entire recurring series: "${reminder.title}". All future occurrences cancelled.`
    };
  }

  /**
   * Delete all occurrences from a specific date onwards
   */
  private async deleteFromDate(
    reminder: Reminder,
    fromDate?: Date,
    timezone: string = 'Asia/Kolkata'
  ): Promise<DeletionResult> {
    const cutoffDate = fromDate || new Date();
    
    if (!reminder.nextExecution || reminder.nextExecution < cutoffDate) {
      // Reminder already past the cutoff date, delete entirely
      return await this.deleteEntireSeries(reminder);
    }

    // Update the reminder to end before the cutoff date
    const updatedPattern = {
      ...reminder.recurrencePattern,
      endDate: cutoffDate.toISOString()
    };

    await this.reminderRepository.update(reminder.id, {
      recurrencePattern: updatedPattern,
      status: ReminderStatus.COMPLETED
    });

    const formattedDate = TimezoneUtils.formatDateInTimezone(cutoffDate, timezone);
    
    return {
      success: true,
      deletionType: 'from_date',
      deletedCount: 1,
      affectedReminders: [reminder.id],
      message: `Stopped recurring reminder "${reminder.title}" from ${formattedDate} onwards. Past occurrences remain in history.`
    };
  }

  /**
   * Calculate next execution while skipping exclusion dates
   */
  private calculateNextExecutionSkippingExclusions(
    reminder: Reminder,
    pattern: any,
    timezone: string
  ): Date | null {
    if (!reminder.nextExecution) return null;

    const exclusionDates = pattern.exclusionDates || [];
    const exclusionTimes = exclusionDates.map((date: string) => new Date(date).getTime());
    
    let nextExecution = new Date(reminder.nextExecution);
    const maxIterations = 100; // Prevent infinite loops
    let iterations = 0;

    while (iterations < maxIterations) {
      const currentTime = nextExecution.getTime();
      
      // Check if current date is excluded
      const isExcluded = exclusionTimes.some(excludedTime => {
        const dayDiff = Math.abs(currentTime - excludedTime) / (1000 * 60 * 60 * 24);
        return dayDiff < 1; // Same day
      });

      if (!isExcluded) {
        return nextExecution;
      }

      // Move to next occurrence based on reminder type
      switch (reminder.type) {
        case ReminderType.DAILY:
          nextExecution.setDate(nextExecution.getDate() + 1);
          break;
        case ReminderType.WEEKLY:
          nextExecution.setDate(nextExecution.getDate() + 7);
          break;
        case ReminderType.MONTHLY:
          nextExecution.setMonth(nextExecution.getMonth() + 1);
          break;
        default:
          return null;
      }

      iterations++;
    }

    return null; // No valid next execution found
  }

  /**
   * Analyze deletion intent from user description
   */
  analyzeDeletionIntent(description: string, timeContext?: string): {
    scope: 'single' | 'series' | 'from_date' | 'ambiguous';
    confidence: 'high' | 'medium' | 'low';
    reasons: string[];
  } {
    const descLower = description.toLowerCase();
    const timeLower = timeContext?.toLowerCase() || '';
    const reasons: string[] = [];

    // Single occurrence indicators
    const singleIndicators = [
      'today', 'tomorrow', 'this morning', 'this evening', 'tonight',
      'this occurrence', 'just today', 'only today', 'just this time'
    ];

    // Series indicators
    const seriesIndicators = [
      'all', 'entire', 'complete', 'whole', 'every', 'series',
      'all of them', 'everything', 'permanently'
    ];

    // From-date indicators
    const fromDateIndicators = [
      'from now on', 'from tomorrow', 'from next week', 'onwards',
      'going forward', 'in the future', 'from today onwards'
    ];

    let singleScore = 0;
    let seriesScore = 0;
    let fromDateScore = 0;

    // Check for single occurrence indicators
    for (const indicator of singleIndicators) {
      if (descLower.includes(indicator) || timeLower.includes(indicator)) {
        singleScore += 2;
        reasons.push(`Contains single occurrence indicator: "${indicator}"`);
      }
    }

    // Check for series indicators
    for (const indicator of seriesIndicators) {
      if (descLower.includes(indicator)) {
        seriesScore += 2;
        reasons.push(`Contains series indicator: "${indicator}"`);
      }
    }

    // Check for from-date indicators
    for (const indicator of fromDateIndicators) {
      if (descLower.includes(indicator)) {
        fromDateScore += 2;
        reasons.push(`Contains from-date indicator: "${indicator}"`);
      }
    }

    // Determine scope and confidence
    const maxScore = Math.max(singleScore, seriesScore, fromDateScore);
    
    if (maxScore === 0) {
      return { scope: 'ambiguous', confidence: 'low', reasons: ['No clear deletion scope indicators found'] };
    }

    let scope: 'single' | 'series' | 'from_date' | 'ambiguous';
    if (singleScore === maxScore) {
      scope = 'single';
    } else if (seriesScore === maxScore) {
      scope = 'series';
    } else {
      scope = 'from_date';
    }

    const confidence = maxScore >= 4 ? 'high' : maxScore >= 2 ? 'medium' : 'low';

    return { scope, confidence, reasons };
  }
}
