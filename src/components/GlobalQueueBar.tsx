import { useBackgroundQueue } from "@/hooks/useBackgroundQueue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle2, XCircle, Clock, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export function GlobalQueueBar() {
  const { tasks, clearCompleted } = useBackgroundQueue();
  const [collapsed, setCollapsed] = useState(false);

  // Only show recent tasks (last 10 minutes)
  const recentTasks = tasks.filter(t => Date.now() - t.addedAt < 10 * 60 * 1000);
  if (recentTasks.length === 0) return null;

  const running = recentTasks.filter(t => t.status === "running");
  const queued = recentTasks.filter(t => t.status === "queued");
  const completed = recentTasks.filter(t => t.status === "completed");
  const failed = recentTasks.filter(t => t.status === "failed");

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-muted/50 cursor-pointer"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-2 text-xs font-medium">
          {running.length > 0 && (
            <Badge variant="default" className="text-[9px] px-1.5 h-4 gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              {running.length}
            </Badge>
          )}
          {queued.length > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1.5 h-4 gap-1">
              <Clock className="h-2.5 w-2.5" />
              {queued.length}
            </Badge>
          )}
          {completed.length > 0 && (
            <Badge variant="outline" className="text-[9px] px-1.5 h-4 gap-1 border-green-500/30 text-green-600">
              <CheckCircle2 className="h-2.5 w-2.5" />
              {completed.length}
            </Badge>
          )}
          {failed.length > 0 && (
            <Badge variant="destructive" className="text-[9px] px-1.5 h-4 gap-1">
              <XCircle className="h-2.5 w-2.5" />
              {failed.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(completed.length > 0 || failed.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[9px]"
              onClick={(e) => { e.stopPropagation(); clearCompleted(); }}
            >
              <Trash2 className="h-2.5 w-2.5" />
            </Button>
          )}
          {collapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </div>
      </div>

      {/* Task list */}
      {!collapsed && (
        <ScrollArea className="max-h-40 px-3 py-2">
          <div className="space-y-1">
            {recentTasks.map(task => (
              <div key={task.id + task.addedAt} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {task.status === "running" && <Loader2 className="h-2.5 w-2.5 animate-spin text-primary shrink-0" />}
                {task.status === "queued" && <Clock className="h-2.5 w-2.5 shrink-0" />}
                {task.status === "completed" && <CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0" />}
                {task.status === "failed" && <XCircle className="h-2.5 w-2.5 text-destructive shrink-0" />}
                <span className={`truncate ${task.status === "running" ? "text-foreground font-medium" : ""}`}>
                  {task.label}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
