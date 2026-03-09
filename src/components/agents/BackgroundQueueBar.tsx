import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle2, XCircle, Clock, X, Trash2 } from "lucide-react";
import type { BackgroundTask } from "@/hooks/useBackgroundQueue";

interface BackgroundQueueBarProps {
  tasks: BackgroundTask[];
  onClearCompleted: () => void;
}

export function BackgroundQueueBar({ tasks, onClearCompleted }: BackgroundQueueBarProps) {
  const { t } = useTranslation("ai");

  if (tasks.length === 0) return null;

  const running = tasks.filter(t => t.status === "running");
  const queued = tasks.filter(t => t.status === "queued");
  const completed = tasks.filter(t => t.status === "completed");
  const failed = tasks.filter(t => t.status === "failed");

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-2 sm:p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
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
              <Badge variant="outline" className="text-[9px] px-1.5 h-4 gap-1 text-green-600">
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
          {(completed.length > 0 || failed.length > 0) && (
            <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[9px]" onClick={onClearCompleted}>
              <Trash2 className="h-2.5 w-2.5 mr-0.5" />
              {t("clear_queue", "Очистить")}
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-24">
          <div className="space-y-0.5">
            {tasks.map(task => (
              <div key={task.id + task.addedAt} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {task.status === "running" && <Loader2 className="h-2.5 w-2.5 animate-spin text-primary shrink-0" />}
                {task.status === "queued" && <Clock className="h-2.5 w-2.5 text-muted-foreground shrink-0" />}
                {task.status === "completed" && <CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0" />}
                {task.status === "failed" && <XCircle className="h-2.5 w-2.5 text-destructive shrink-0" />}
                <span className={`truncate ${task.status === "running" ? "text-foreground font-medium" : ""}`}>
                  {task.label}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
