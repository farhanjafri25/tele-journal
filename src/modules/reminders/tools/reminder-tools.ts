export const reminderTools = [
  {
    type: "function" as const,
    function: {
      name: "create_reminder",
      description: "Create a new reminder for the user based on their natural language input",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Brief title for the reminder"
          },
          description: {
            type: "string",
            description: "Detailed description of what to remind about"
          },
          type: {
            type: "string",
            enum: ["once", "daily", "weekly", "monthly", "yearly", "custom"],
            description: "Type of reminder recurrence"
          },
          scheduledAt: {
            type: "string",
            description: "ISO 8601 datetime when the reminder should first trigger"
          },
          recurrencePattern: {
            type: "object",
            properties: {
              interval: {
                type: "number",
                description: "Interval for recurrence (e.g., every 2 weeks)"
              },
              daysOfWeek: {
                type: "array",
                items: { type: "number", minimum: 0, maximum: 6 },
                description: "Days of week (0=Sunday, 6=Saturday) for weekly reminders"
              },
              dayOfMonth: {
                type: "number",
                minimum: 1,
                maximum: 31,
                description: "Day of month for monthly reminders"
              },
              timeOfDay: {
                type: "string",
                pattern: "^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$",
                description: "Time in HH:mm format"
              },
              timezone: {
                type: "string",
                description: "User's timezone (e.g., 'America/New_York')"
              },
              endDate: {
                type: "string",
                description: "ISO 8601 date when recurring reminder should stop"
              },
              maxOccurrences: {
                type: "number",
                description: "Maximum number of times the reminder should repeat"
              }
            }
          },
          preferences: {
            type: "object",
            properties: {
              priority: {
                type: "string",
                enum: ["low", "medium", "high"],
                description: "Priority level of the reminder"
              },
              reminderMessage: {
                type: "string",
                description: "Custom message template for the reminder"
              }
            }
          }
        },
        required: ["title", "type", "scheduledAt"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "list_reminders",
      description: "List user's active reminders",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of reminders to return",
            default: 10
          }
        }
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "update_reminder",
      description: "Update an existing reminder",
      parameters: {
        type: "object",
        properties: {
          reminderId: {
            type: "string",
            description: "ID of the reminder to update"
          },
          title: {
            type: "string",
            description: "New title for the reminder"
          },
          scheduledAt: {
            type: "string",
            description: "New scheduled time in ISO 8601 format"
          },
          status: {
            type: "string",
            enum: ["active", "paused", "cancelled"],
            description: "New status for the reminder"
          }
        },
        required: ["reminderId"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "delete_reminder",
      description: "Delete a reminder",
      parameters: {
        type: "object",
        properties: {
          reminderId: {
            type: "string",
            description: "ID of the reminder to delete"
          }
        },
        required: ["reminderId"]
      }
    }
  }
];

export interface CreateReminderParams {
  title: string;
  description?: string;
  type: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  scheduledAt: string;
  recurrencePattern?: {
    interval?: number;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    timeOfDay?: string;
    timezone?: string;
    endDate?: string;
    maxOccurrences?: number;
  };
  preferences?: {
    priority?: 'low' | 'medium' | 'high';
    reminderMessage?: string;
  };
}

export interface ListRemindersParams {
  limit?: number;
}

export interface UpdateReminderParams {
  reminderId: string;
  title?: string;
  scheduledAt?: string;
  status?: 'active' | 'paused' | 'cancelled';
}

export interface DeleteReminderParams {
  reminderId: string;
}
