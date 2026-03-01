import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";
import { toast } from "sonner";

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

interface BackgroundQueueContextValue {
  tasks: BackgroundTask[];
  isProcessing: boolean;
  currentTask: BackgroundTask | null;
  enqueue: (id: string, label: string, execute: () => Promise<unknown>) => void;
  clearCompleted: () => void;
  clearAll: () => void;
  queueLength: number;
}

const BackgroundQueueContext = createContext<BackgroundQueueContextValue | null>(null);

export function BackgroundQueueProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const processingRef = useRef(false);
  const queueRef = useRef<BackgroundTask[]>([]);

  useEffect(() => {
    queueRef.current = tasks;
  }, [tasks]);

  const processNext = useCallback(async () => {
    if (processingRef.current) return;

    const next = queueRef.current.find(t => t.status === "queued");
    if (!next) return;

    processingRef.current = true;

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
      setTimeout(() => {
        const remaining = queueRef.current.find(t => t.status === "queued");
        if (remaining) processNext();
      }, 100);
    }
  }, []);

  const enqueue = useCallback((id: string, label: string, execute: () => Promise<unknown>) => {
    setTasks(prev => {
      const existing = prev.find(t => t.id === id && (t.status === "queued" || t.status === "running"));
      if (existing) {
        toast.warning(`${label} — уже в очереди`);
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
      queueRef.current = updated;
      return updated;
    });

    setTimeout(() => processNext(), 50);
  }, [processNext]);

  const clearCompleted = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status === "queued" || t.status === "running"));
  }, []);

  const clearAll = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status === "running"));
  }, []);

  const currentTask = tasks.find(t => t.status === "running") || null;
  const queueLength = tasks.filter(t => t.status === "queued").length;

  return (
    <BackgroundQueueContext.Provider value={{
      tasks,
      isProcessing: !!currentTask,
      currentTask,
      enqueue,
      clearCompleted,
      clearAll,
      queueLength,
    }}>
      {children}
    </BackgroundQueueContext.Provider>
  );
}

export function useBackgroundQueue(): BackgroundQueueContextValue {
  const ctx = useContext(BackgroundQueueContext);
  if (!ctx) {
    throw new Error("useBackgroundQueue must be used within BackgroundQueueProvider");
  }
  return ctx;
}
