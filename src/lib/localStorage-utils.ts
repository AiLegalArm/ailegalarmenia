/**
 * Utilities for managing localStorage with automatic cleanup of stale entries.
 * Prevents unbounded growth of localStorage data.
 */

const DISMISSED_REMINDERS_KEY = 'dismissed_court_reminders';
const MAX_DISMISSED_ENTRIES = 200;
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface DismissedEntry {
  key: string;
  timestamp: number;
}

/**
 * Check if a court reminder suggestion was dismissed.
 */
export function isCourtReminderDismissed(caseId: string, courtDate: string): boolean {
  try {
    const stored = localStorage.getItem(DISMISSED_REMINDERS_KEY);
    if (!stored) return false;
    
    const entries: DismissedEntry[] = JSON.parse(stored);
    const key = `${caseId}_${courtDate}`;
    
    return entries.some(e => e.key === key);
  } catch {
    return false;
  }
}

/**
 * Mark a court reminder suggestion as dismissed.
 * Automatically cleans up old entries to prevent localStorage growth.
 */
export function dismissCourtReminder(caseId: string, courtDate: string): void {
  try {
    const stored = localStorage.getItem(DISMISSED_REMINDERS_KEY);
    let entries: DismissedEntry[] = stored ? JSON.parse(stored) : [];
    
    const key = `${caseId}_${courtDate}`;
    const now = Date.now();
    
    // Don't add if already exists
    if (entries.some(e => e.key === key)) {
      return;
    }
    
    // Clean up stale entries (older than 30 days)
    entries = entries.filter(e => now - e.timestamp < STALE_THRESHOLD_MS);
    
    // Add new entry
    entries.push({ key, timestamp: now });
    
    // Keep only the most recent entries
    if (entries.length > MAX_DISMISSED_ENTRIES) {
      entries = entries.slice(-MAX_DISMISSED_ENTRIES);
    }
    
    localStorage.setItem(DISMISSED_REMINDERS_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clean up all stale localStorage entries across the application.
 * Call this on app startup to prevent unbounded growth.
 */
export function cleanupStaleLocalStorage(): void {
  try {
    const now = Date.now();
    
    // Clean dismissed reminders
    const dismissedStored = localStorage.getItem(DISMISSED_REMINDERS_KEY);
    if (dismissedStored) {
      const entries: DismissedEntry[] = JSON.parse(dismissedStored);
      const filtered = entries.filter(e => now - e.timestamp < STALE_THRESHOLD_MS);
      
      if (filtered.length !== entries.length) {
        if (filtered.length === 0) {
          localStorage.removeItem(DISMISSED_REMINDERS_KEY);
        } else {
          localStorage.setItem(DISMISSED_REMINDERS_KEY, JSON.stringify(filtered));
        }
      }
    }
    
    // Clean notification tracker
    const notificationsStored = localStorage.getItem('reminder_notifications_sent');
    if (notificationsStored) {
      const entries: Array<{ key: string; timestamp: number }> = JSON.parse(notificationsStored);
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const filtered = entries.filter(e => e.timestamp > sevenDaysAgo);
      
      if (filtered.length !== entries.length) {
        if (filtered.length === 0) {
          localStorage.removeItem('reminder_notifications_sent');
        } else {
          localStorage.setItem('reminder_notifications_sent', JSON.stringify(filtered));
        }
      }
    }
    
    // Migrate old court_reminder_dismissed_* keys to consolidated format
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('court_reminder_dismissed_')) {
        keysToRemove.push(key);
      }
    }
    
    // Remove legacy keys
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
  } catch {
    // Ignore cleanup errors
  }
}
