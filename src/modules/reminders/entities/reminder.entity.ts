import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

export enum ReminderType {
  ONCE = 'once',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  CUSTOM = 'custom'
}

export enum ReminderStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

@Entity('reminders')
export class Reminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'bigint' })
  userId: number;

  @Column({ type: 'bigint' })
  chatRoomId: string; // Telegram chat ID

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: ReminderType,
    default: ReminderType.ONCE
  })
  type: ReminderType;

  @Column({
    type: 'enum',
    enum: ReminderStatus,
    default: ReminderStatus.ACTIVE
  })
  status: ReminderStatus;

  // When the reminder should trigger
  @Column({ type: 'timestamp with time zone' })
  scheduledAt: Date;

  // For recurring reminders - next execution time
  @Column({ type: 'timestamp with time zone', nullable: true })
  nextExecution: Date;

  // Recurrence pattern (JSON)
  @Column({ type: 'jsonb', nullable: true })
  recurrencePattern: {
    interval?: number; // e.g., every 2 weeks
    daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
    dayOfMonth?: number; // 1-31
    monthOfYear?: number; // 1-12
    timeOfDay?: string; // HH:mm format
    timezone?: string; // User's timezone
    endDate?: string; // When to stop recurring
    maxOccurrences?: number; // Max number of times to repeat
    exclusionDates?: string[]; // ISO dates to exclude from recurring series
  };

  // Execution tracking
  @Column({ type: 'int', default: 0 })
  executionCount: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastExecutedAt: Date;

  // User preferences
  @Column({ type: 'jsonb', nullable: true })
  preferences: {
    snoozeMinutes?: number; // How long to snooze
    maxSnoozes?: number; // Max snoozes allowed
    reminderMessage?: string; // Custom message template
    priority?: 'low' | 'medium' | 'high';
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;
}
