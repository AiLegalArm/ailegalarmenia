import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { 
  Scale, 
  Gavel, 
  Building2, 
  Landmark, 
  Globe, 
  FileText, 
  FileSignature,
  FileCheck
} from "lucide-react";

interface DocumentTemplate {
  id: string;
  category: string;
  subcategory: string | null;
  name_hy: string;
  name_ru: string;
  name_en: string;
  required_fields: string[];
}

type RecipientType = "court" | "prosecutor" | "government" | "investigative" | "other";

interface DocumentTemplateListProps {
  templates: DocumentTemplate[];
  selectedTemplate: DocumentTemplate | null;
  onSelect: (template: DocumentTemplate) => void;
  getTemplateName: (template: DocumentTemplate) => string;
  recipientType?: RecipientType;
}

// Categories relevant to each recipient type
const RECIPIENT_CATEGORY_MAP: Record<RecipientType, string[]> = {
  court: [
    'civil_process',
    'criminal_process', 
    'administrative_process',
    'constitutional',
    'international'
  ],
  prosecutor: [
    'general',
    'criminal_process',
    'pre_trial'
  ],
  investigative: [
    'general',
    'criminal_process',
    'pre_trial'
  ],
  government: [
    'general',
    'administrative_process',
    'pre_trial'
  ],
  other: [
    'general',
    'civil_process',
    'criminal_process',
    'administrative_process',
    'constitutional',
    'international',
    'pre_trial',
    'contract'
  ]
};

const CATEGORY_CONFIG: Record<string, { label_hy: string; label_ru: string; label_en: string; icon: typeof Scale; color: string }> = {
  general: { 
    label_hy: "\u0538\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580",
    label_ru: "Общие документы",
    label_en: "General Documents",
    icon: FileText,
    color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
  },
  civil_process: { 
    label_hy: "\u0554\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    label_ru: "Гражданский процесс",
    label_en: "Civil Process",
    icon: Scale,
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
  },
  criminal_process: { 
    label_hy: "\u0554\u0580\u0565\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    label_ru: "Уголовный процесс",
    label_en: "Criminal Process",
    icon: Gavel,
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
  },
  administrative_process: { 
    label_hy: "\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    label_ru: "Административное судопроизводство",
    label_en: "Administrative Process",
    icon: Building2,
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
  },
  constitutional: { 
    label_hy: "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584",
    label_ru: "Конституционное право",
    label_en: "Constitutional Law",
    icon: Landmark,
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
  },
  international: { 
    label_hy: "\u0544\u056B\u057B\u0561\u0566\u0563\u0561\u0575\u056B\u0576 \u0561\u057F\u0575\u0561\u0576\u0576\u0565\u0580",
    label_ru: "Международные инстанции",
    label_en: "International Bodies",
    icon: Globe,
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
  },
  pre_trial: { 
    label_hy: "\u0531\u0580\u057F\u0561\u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580",
    label_ru: "Внесудебные документы",
    label_en: "Pre-Trial Documents",
    icon: FileCheck,
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
  },
  contract: { 
    label_hy: "\u054A\u0561\u0575\u0574\u0561\u0576\u0561\u0563\u0580\u0561\u0575\u056B\u0576 \u0583\u0561\u057D\u057F\u0561\u0569\u0572\u0569\u0565\u0580",
    label_ru: "Договорная документация",
    label_en: "Contract Documentation",
    icon: FileSignature,
    color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200"
  },
};

const getCategoryLabel = (config: typeof CATEGORY_CONFIG[string], language: string): string => {
  switch (language) {
    case 'hy': return config.label_hy;
    case 'en': return config.label_en;
    default: return config.label_ru;
  }
};

export function DocumentTemplateList({ 
  templates, 
  selectedTemplate, 
  onSelect,
  getTemplateName,
  recipientType = "other"
}: DocumentTemplateListProps) {
  const { i18n } = useTranslation();
  // Filter templates based on recipient type
  const allowedCategories = RECIPIENT_CATEGORY_MAP[recipientType];
  const filteredTemplates = templates.filter(t => allowedCategories.includes(t.category));

  // Group templates by category
  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, DocumentTemplate[]>);

  const categoryOrder = [
    'general',
    'civil_process',
    'criminal_process',
    'administrative_process',
    'constitutional',
    'international',
    'pre_trial',
    'contract'
  ];

  return (
    <ScrollArea className="h-[500px] pr-4">
      <div className="space-y-6">
        {categoryOrder.map((category) => {
          const categoryTemplates = groupedTemplates[category];
          if (!categoryTemplates?.length) return null;
          
          const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.general;
          const Icon = config.icon;

          return (
            <div key={category} className="space-y-2">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium text-sm">{getCategoryLabel(config, i18n.language)}</h3>
                <Badge variant="secondary" className="ml-auto">
                  {categoryTemplates.length}
                </Badge>
              </div>
              <div className="space-y-1">
                {categoryTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => onSelect(template)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      selectedTemplate?.id === template.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent"
                    )}
                  >
                    {getTemplateName(template)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
