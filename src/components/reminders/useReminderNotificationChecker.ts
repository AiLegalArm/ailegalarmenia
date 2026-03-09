import { useEffect, useRef, useCallback } from 'react';
import { useReminders } from '@/hooks/useReminders';
import { useNotifications } from '@/hooks/useNotifications';

// Check for due reminders every minute
const CHECK_INTERVAL = 60 * 1000;

// Key for localStorage to persist notified reminders across sessions
const NOTIFIED_STORAGE_KEY = 'reminder_notifications_sent';

/**
 * Get the set of already-notified reminder keys from localStorage.
 * Each key is in the format: "reminderId-minutesBefore-eventDate"
 */
function getNotifiedSet(): Set<string> {
  try {
    const stored = localStorage.getItem(NOTIFIED_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Clean up old entries (older than 7 days)
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const filtered = parsed.filter((entry: { key: string; timestamp: number }) => 
        entry.timestamp > sevenDaysAgo
      );
      return new Set(filtered.map((e: { key: string }) => e.key));
    }
  } catch {
    // Ignore parse errors, return empty set
  }
  return new Set();
}

/**
 * Save a notified key to localStorage with timestamp for cleanup.
 */
function saveNotifiedKey(key: string): void {
  try {
    const stored = localStorage.getItem(NOTIFIED_STORAGE_KEY);
    const entries: Array<{ key: string; timestamp: number }> = stored ? JSON.parse(stored) : [];
    
    // Avoid duplicates
    if (!entries.some(e => e.key === key)) {
      entries.push({ key, timestamp: Date.now() });
      
      // Keep only last 500 entries to prevent unbounded growth
      const trimmed = entries.slice(-500);
      localStorage.setItem(NOTIFIED_STORAGE_KEY, JSON.stringify(trimmed));
    }
  } catch {
    // Ignore storage errors
  }
}

export function useReminderNotificationChecker() {
  const { reminders } = useReminders();
  const { createNotification, notifications } = useNotifications();
  
  // Use ref to avoid re-reading localStorage on every check
  const notifiedRef = useRef<Set<string>>(getNotifiedSet());
  
  // Initialize notifiedRef from localStorage on mount
  useEffect(() => {
    notifiedRef.current = getNotifiedSet();
  }, []);

  const checkReminders = useCallback(() => {
    const now = new Date();
    
    reminders
      .filter((r) => r.status === 'active')
      .forEach((reminder) => {
        // Parse event_datetime as UTC (Supabase stores timestamps in UTC)
        const eventTimeStr = reminder.event_datetime;
        const eventTime = new Date(eventTimeStr);
        
        // Skip if event is in the past
        if (eventTime <= now) {
          return;
        }
        
        // Include event date in key to handle recurring-like scenarios
        const eventDateKey = eventTime.toISOString().split('T')[0];
        
        reminder.notify_before.forEach((minutesBefore) => {
          const notifyTime = new Date(eventTime.getTime() - minutesBefore * 60 * 1000);
          
          // Create a unique key that includes the event date to avoid false positives
          const notifyKey = `${reminder.id}-${minutesBefore}-${eventDateKey}`;
          
          // Check if we should notify:
          // 1. Current time is past notify time
          // 2. Current time is before event time
          // 3. We haven't notified for this specific key
          // 4. No existing notification in DB for this reminder with this timing
          const alreadyNotified = notifiedRef.current.has(notifyKey);
          const existsInDb = notifications.some(
            n => n.reminder_id === reminder.id && 
                 n.message?.includes(getTimeLabel(minutesBefore))
          );
          
          if (
            now >= notifyTime &&
            now < eventTime &&
            !alreadyNotified &&
            !existsInDb
          ) {
            // Mark as notified immediately to prevent race conditions
            notifiedRef.current.add(notifyKey);
            saveNotifiedKey(notifyKey);
            
            const timeLabel = getTimeLabel(minutesBefore);
            createNotification(
              reminder.title,
              `${timeLabel} until ${reminder.title}`,
              reminder.id
            );
          }
        });
      });
  }, [reminders, createNotification, notifications]);

  useEffect(() => {
    // Initial check
    checkReminders();

    // Set up interval
    const interval = setInterval(checkReminders, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [checkReminders]);
}

function getTimeLabel(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else if (minutes < 10080) {
    const days = Math.floor(minutes / 1440);
    return `${days} day${days !== 1 ? 's' : ''}`;
  } else {
    const weeks = Math.floor(minutes / 10080);
    return `${weeks} week${weeks !== 1 ? 's' : ''}`;
  }
}
