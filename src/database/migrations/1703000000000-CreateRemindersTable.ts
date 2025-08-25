import { MigrationInterface, QueryRunner, Table, Index, ForeignKey } from 'typeorm';

export class CreateRemindersTable1703000000000 implements MigrationInterface {
  name = 'CreateRemindersTable1703000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'reminders',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'chatRoomId',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'title',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['once', 'daily', 'weekly', 'monthly', 'yearly', 'custom'],
            default: "'once'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'paused', 'completed', 'cancelled'],
            default: "'active'",
          },
          {
            name: 'scheduledAt',
            type: 'timestamp with time zone',
            isNullable: false,
          },
          {
            name: 'nextExecution',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'recurrencePattern',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'executionCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'lastExecutedAt',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'preferences',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes for better performance
    await queryRunner.createIndex(
      'reminders',
      new Index('IDX_REMINDERS_USER_ID', ['userId']),
    );

    await queryRunner.createIndex(
      'reminders',
      new Index('IDX_REMINDERS_CHAT_ROOM_ID', ['chatRoomId']),
    );

    await queryRunner.createIndex(
      'reminders',
      new Index('IDX_REMINDERS_NEXT_EXECUTION', ['nextExecution']),
    );

    await queryRunner.createIndex(
      'reminders',
      new Index('IDX_REMINDERS_STATUS', ['status']),
    );

    await queryRunner.createIndex(
      'reminders',
      new Index('IDX_REMINDERS_TYPE', ['type']),
    );

    // Create foreign key constraint
    await queryRunner.createForeignKey(
      'reminders',
      new ForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('reminders');
  }
}
