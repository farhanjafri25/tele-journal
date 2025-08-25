export class TimezoneUtils {
  /**
   * Convert local time to UTC
   * @param localTimeString - Time string in local timezone
   * @param timezone - User's timezone (e.g., 'Asia/Kolkata')
   * @returns UTC Date object
   */
  static convertLocalToUTC(localTimeString: string, timezone: string = 'Asia/Kolkata'): Date {
    try {
      // Parse the local time string
      const localDate = new Date(localTimeString);
      
      // If the date is invalid, return current time
      if (isNaN(localDate.getTime())) {
        console.error('Invalid local time string:', localTimeString);
        return new Date();
      }

      // Get the timezone offset for the user's timezone
      const utcTime = localDate.getTime();
      const localTime = new Date(localDate.toLocaleString('en-US', { timeZone: timezone }));
      const utcTimeFromLocal = new Date(localDate.toLocaleString('en-US', { timeZone: 'UTC' }));
      
      // Calculate the offset
      const offset = utcTimeFromLocal.getTime() - localTime.getTime();
      
      // Apply the offset to get the correct UTC time
      return new Date(utcTime + offset);
    } catch (error) {
      console.error('Error converting local time to UTC:', error);
      return new Date();
    }
  }

  /**
   * Convert UTC time to local time
   * @param utcDate - UTC Date object
   * @param timezone - User's timezone (e.g., 'Asia/Kolkata')
   * @returns Local Date object
   */
  static convertUTCToLocal(utcDate: Date, timezone: string = 'Asia/Kolkata'): Date {
    try {
      // Convert UTC to local timezone
      const localTimeString = utcDate.toLocaleString('en-US', { timeZone: timezone });
      return new Date(localTimeString);
    } catch (error) {
      console.error('Error converting UTC to local time:', error);
      return utcDate;
    }
  }

  /**
   * Create a date in user's timezone and convert to UTC for storage
   * @param dateString - Date string (e.g., "2025-08-25")
   * @param timeString - Time string (e.g., "18:15" or "6:15 PM")
   * @param timezone - User's timezone
   * @returns UTC Date object
   */
  static createDateInTimezone(dateString: string, timeString: string, timezone: string = 'Asia/Kolkata'): Date {
    try {
      // Parse time (handle both 24h and 12h formats)
      let hours = 0;
      let minutes = 0;

      if (timeString.includes('AM') || timeString.includes('PM')) {
        // 12-hour format
        const [time, period] = timeString.split(/\s*(AM|PM)/i);
        const [h, m] = time.split(':').map(Number);
        hours = period.toUpperCase() === 'PM' && h !== 12 ? h + 12 : (period.toUpperCase() === 'AM' && h === 12 ? 0 : h);
        minutes = m || 0;
      } else {
        // 24-hour format
        const [h, m] = timeString.split(':').map(Number);
        hours = h;
        minutes = m || 0;
      }

      // Create the local datetime string
      const localDateTime = `${dateString}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;

      // For Asia/Kolkata (UTC+5:30), we need to subtract 5.5 hours to get UTC
      const localDate = new Date(localDateTime);

      // Simple approach: subtract the timezone offset
      if (timezone === 'Asia/Kolkata') {
        // IST is UTC+5:30, so subtract 5.5 hours to get UTC
        const utcTime = localDate.getTime() - (5.5 * 60 * 60 * 1000);
        return new Date(utcTime);
      } else {
        // For other timezones, use the more complex method
        const tempDate = new Date(localDateTime + 'Z'); // Treat as UTC first
        const offsetMs = tempDate.getTimezoneOffset() * 60 * 1000;
        return new Date(tempDate.getTime() - offsetMs);
      }
    } catch (error) {
      console.error('Error creating date in timezone:', error);
      return new Date();
    }
  }

  /**
   * Get current time in user's timezone
   * @param timezone - User's timezone
   * @returns Formatted time string
   */
  static getCurrentTimeInTimezone(timezone: string = 'Asia/Kolkata'): string {
    return new Date().toLocaleString('en-US', { 
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  /**
   * Format date for display in user's timezone
   * @param date - Date to format
   * @param timezone - User's timezone
   * @returns Formatted date string
   */
  static formatDateInTimezone(date: Date, timezone: string = 'Asia/Kolkata'): string {
    return date.toLocaleString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }
}
