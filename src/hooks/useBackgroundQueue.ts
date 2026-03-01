import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export interface BackgroundTask {
  id: string;
  label: string;
  status: "queued" | "running" | "completed" | "failed";
  execute: () => Promise<unknown>;
  result?: unknown;
  error?: string;
  addedAt: number;
  startedAt?: number;
  completedAt?: number;
}

interface UseBackgroundQueueReturn {
  tasks: BackgroundTask[];
  isProcessing: boolean;
  currentTask: BackgroundTask | null;
  enqueue: (id: string, label: string, execute: () => Promise<unknown>) => void;
  clearCompleted: () => void;
  clearAll: () => void;
  queueLength: number;
}

export function useBackgroundQueue(): UseBackgroundQueueReturn {
  const { t } = useTranslation("ai");
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const processingRef = useRef(false);
  const queueRef = useRef<BackgroundTask[]>([]);

  // Keep queueRef in sync
  useEffect(() => {
    queueRef.current = tasks;
  }, [tasks]);

  const processNext = useCallback(async () => {
    if (processingRef.current) return;

    const next = queueRef.current.find(t => t.status === "queued");
    if (!next) return;

    processingRef.current = true;

    // Mark as running
    setTasks(prev => prev.map(t =>
      t.id === next.id ? { ...t, status: "running" as const, startedAt: Date.now() } : t
    ));

    toast.info(`▶ ${next.label}`, { duration: 2000 });

    try {
      const result = await next.execute();
      setTasks(prev => prev.map(t =>
        t.id === next.id ? { ...t, status: "completed" as const, result, completedAt: Date.now() } : t
      ));
      toast.success(`✅ ${next.label}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setTasks(prev => prev.map(t =>
        t.id === next.id ? { ...t, status: "failed" as const, error: errorMsg, completedAt: Date.now() } : t
      ));
      toast.error(`❌ ${next.label}: ${errorMsg}`);
    } finally {
      processingRef.current = false;
      // Process next in queue after a small delay
      setTimeout(() => {
        // Re-read from state
        const remaining = queueRef.current.find(t => t.status === "queued");
        if (remaining) processNext();
      }, 100);
    }
  }, []);

  const enqueue = useCallback((id: string, label: string, execute: () => Promise<unknown>) => {
    // Prevent duplicate tasks with the same id
    setTasks(prev => {
      const existing = prev.find(t => t.id === id && (t.status === "queued" || t.status === "running"));
      if (existing) {
        toast.warning(`${label} — ${t("already_in_queue", "уже в очереди")}`);
        return prev;
      }

      const task: BackgroundTask = {
        id,
        label,
        execute,
        status: "queued",
        addedAt: Date.now(),
      };

      const updated = [...prev, task];
      // Update ref immediately so processNext sees it
      queueRef.current = updated;
      return updated;
    });

    // Trigger processing
    setTimeout(() => processNext(), 50);
  }, [processNext, t]);

  const clearCompleted = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status === "queued" || t.status === "running"));
  }, []);

  const clearAll = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status === "running"));
  }, []);

  const currentTask = tasks.find(t => t.status === "running") || null;
  const queueLength = tasks.filter(t => t.status === "queued").length;

  return {
    tasks,
    isProcessing: !!currentTask,
    currentTask,
    enqueue,
    clearCompleted,
    clearAll,
    queueLength,
  };
}
