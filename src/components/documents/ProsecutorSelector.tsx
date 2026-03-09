import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { 
  ARMENIAN_PROSECUTORS, 
  getFlatProsecutorList, 
  getProsecutorCategoryName, 
  FlatProsecutor 
} from "@/data/armenianProsecutors";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Scale, Phone, MapPin, Mail } from "lucide-react";

interface ProsecutorSelectorProps {
  value?: string;
  onChange: (prosecutorId: string, prosecutorData: FlatProsecutor | null) => void;
}

export function ProsecutorSelector({ value, onChange }: ProsecutorSelectorProps) {
  const { i18n } = useTranslation();
  const flatProsecutors = useMemo(() => getFlatProsecutorList(), []);
  
  const selectedProsecutor = useMemo(() => {
    return flatProsecutors.find(p => p.id === value) || null;
  }, [flatProsecutors, value]);

  const getProsecutorDisplayName = (prosecutor: FlatProsecutor): string => {
    switch (i18n.language) {
      case 'hy': return prosecutor.fullName_hy;
      case 'en': return prosecutor.fullName_en;
      default: return prosecutor.fullName_ru;
    }
  };

  const handleSelect = (prosecutorId: string) => {
    const prosecutor = flatProsecutors.find(p => p.id === prosecutorId) || null;
    onChange(prosecutorId, prosecutor);
  };

  // Group prosecutors by category
  const groupedProsecutors = useMemo(() => {
    const groups: { [key: string]: { category: typeof ARMENIAN_PROSECUTORS[0]; offices: FlatProsecutor[] } } = {};
    
    flatProsecutors.forEach(prosecutor => {
      if (!groups[prosecutor.categoryId]) {
        const category = ARMENIAN_PROSECUTORS.find(c => c.id === prosecutor.categoryId);
        if (category) {
          groups[prosecutor.categoryId] = { category, offices: [] };
        }
      }
      groups[prosecutor.categoryId]?.offices.push(prosecutor);
    });
    
    return Object.values(groups);
  }, [flatProsecutors]);

  return (
    <div className="space-y-3">
      <div>
        <Label className="flex items-center gap-2 mb-2">
          <Scale className="h-4 w-4" />
          {i18n.language === 'hy' ? "\u0534\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576" : i18n.language === 'en' ? "Prosecutor's Office" : 'Прокуратура'}
        </Label>
        <Select value={value} onValueChange={handleSelect}>
          <SelectTrigger>
            <SelectValue placeholder={
              i18n.language === 'hy' ? "\u0538\u0576\u057F\u0580\u0565\u0584 \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568" : 
              i18n.language === 'en' ? "Select prosecutor's office" : 
              'Выберите прокуратуру'
            } />
          </SelectTrigger>
          <SelectContent className="max-h-[400px]">
            {groupedProsecutors.map(({ category, offices }) => (
              <SelectGroup key={category.id}>
                <SelectLabel className="font-semibold text-primary">
                  {getProsecutorCategoryName(category, i18n.language)}
                </SelectLabel>
                {offices.map(prosecutor => (
                  <SelectItem 
                    key={prosecutor.id} 
                    value={prosecutor.id}
                    className="pl-6"
                  >
                    <span className="truncate">{getProsecutorDisplayName(prosecutor)}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Display selected prosecutor details */}
      {selectedProsecutor && (
        <div className="p-3 bg-muted/50 rounded-lg space-y-2 text-sm">
          <div className="font-medium">{getProsecutorDisplayName(selectedProsecutor)}</div>
          
          {selectedProsecutor.address && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{selectedProsecutor.address}</span>
            </div>
          )}
          
          {selectedProsecutor.phones && selectedProsecutor.phones.length > 0 && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <Phone className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex flex-wrap gap-1">
                {selectedProsecutor.phones.map((phone, idx) => (
                  <Badge key={idx} variant="secondary" className="font-mono text-xs">
                    {phone}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {selectedProsecutor.email && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{selectedProsecutor.email}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
