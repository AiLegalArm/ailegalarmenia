import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentGenerator } from "./DocumentGenerator";

interface DocumentGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedType?: 'appeal' | 'cassation' | null;
  caseData?: {
    id: string;
    title: string;
    case_number: string;
    case_type?: string;
    court?: string;
    facts?: string;
    legal_question?: string;
    description?: string;
    notes?: string;
  };
}

export function DocumentGeneratorDialog({
  open,
  onOpenChange,
  preselectedType,
  caseData,
}: DocumentGeneratorDialogProps) {
  const { t } = useTranslation("common");
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="min-w-0">
          <DialogTitle className="text-base sm:text-xl break-words">
            {t("document_generator_title")}
          </DialogTitle>
        </DialogHeader>
        <DocumentGenerator 
          caseData={caseData}
          preselectedType={preselectedType}
        />
      </DialogContent>
    </Dialog>
  );
}
