import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { 
  CATEGORY_COLORS, 
  getCategoryLabel, 
  getComplaintTypeLabel,
  getComplaintTypesByCategory 
} from "../constants";
import type { ComplaintCategory, ComplaintType } from "../types";

// =============================================================================
// STEP 2: Complaint Type Selection
// =============================================================================

interface StepComplaintTypeSelectProps {
  lang: string;
  getText: (hy: string, ru: string, en: string) => string;
  category: ComplaintCategory;
  selectedType: ComplaintType | null;
  onSelect: (type: ComplaintType) => void;
}

export function StepComplaintTypeSelect({
  lang,
  getText,
  category,
  selectedType,
  onSelect
}: StepComplaintTypeSelectProps) {
  const types = getComplaintTypesByCategory(category);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {getText(
            "\u0538\u0576\u057F\u0580\u0565\u0584 \u0562\u0578\u0572\u0578\u0584\u056B \u057F\u0565\u057D\u0561\u056F\u0568",
            "Выберите тип жалобы",
            "Select complaint type"
          )}
        </h3>
        <Badge variant="outline" className={CATEGORY_COLORS[category]}>
          {getCategoryLabel(category, lang)}
        </Badge>
      </div>
      <div className="grid gap-2">
        {types.map((type) => (
          <button
            key={type.id}
            onClick={() => onSelect(type)}
            className={cn(
              "p-3 rounded-lg border transition-all hover:border-primary hover:bg-accent",
              "flex items-center gap-3 text-left",
              selectedType?.id === type.id ? "border-primary bg-accent" : "border-border"
            )}
          >
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{getComplaintTypeLabel(type, lang)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
