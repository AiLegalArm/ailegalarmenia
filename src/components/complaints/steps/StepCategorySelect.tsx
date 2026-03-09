import { cn } from "@/lib/utils";
import { CATEGORY_ICONS, CATEGORY_COLORS, getCategoryLabel } from "../constants";
import type { ComplaintCategory } from "../types";

// =============================================================================
// STEP 1: Category Selection
// =============================================================================

interface StepCategorySelectProps {
  lang: string;
  getText: (hy: string, ru: string, en: string) => string;
  selectedCategory: ComplaintCategory | null;
  onSelect: (category: ComplaintCategory) => void;
}

const CATEGORIES: ComplaintCategory[] = [
  "criminal", 
  "civil", 
  "administrative", 
  "anticorruption", 
  "constitutional", 
  "echr",
  "ombudsman"
];

export function StepCategorySelect({
  lang,
  getText,
  selectedCategory,
  onSelect
}: StepCategorySelectProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {getText(
          "\u0538\u0576\u057F\u0580\u0565\u0584 \u0563\u0578\u0580\u056E\u056B \u057F\u0565\u057D\u0561\u056F\u0568",
          "Выберите тип дела",
          "Select case type"
        )}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CATEGORIES.map((cat) => {
          const Icon = CATEGORY_ICONS[cat];
          return (
            <button
              key={cat}
              onClick={() => onSelect(cat)}
              className={cn(
                "p-4 rounded-lg border-2 transition-all hover:border-primary hover:bg-accent",
                "flex flex-col items-center gap-2 text-center",
                selectedCategory === cat ? "border-primary bg-accent" : "border-border"
              )}
            >
              <span className={CATEGORY_COLORS[cat]}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="font-medium text-sm">{getCategoryLabel(cat, lang)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
