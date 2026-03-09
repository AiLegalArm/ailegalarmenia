import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { 
  ARMENIAN_GOVERNMENT, 
  getFlatGovernmentList, 
  getGovernmentCategoryName, 
  FlatGovernmentBody 
} from "@/data/armenianGovernment";
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
import { Building2, Phone, MapPin, Mail, Globe } from "lucide-react";

interface GovernmentSelectorProps {
  value?: string;
  onChange: (governmentId: string, governmentData: FlatGovernmentBody | null) => void;
}

export function GovernmentSelector({ value, onChange }: GovernmentSelectorProps) {
  const { i18n } = useTranslation();
  const flatGovernment = useMemo(() => getFlatGovernmentList(), []);
  
  const selectedBody = useMemo(() => {
    return flatGovernment.find(g => g.id === value) || null;
  }, [flatGovernment, value]);

  const getBodyDisplayName = (body: FlatGovernmentBody): string => {
    switch (i18n.language) {
      case 'hy': return body.fullName_hy;
      case 'en': return body.fullName_en;
      default: return body.fullName_ru;
    }
  };

  const handleSelect = (bodyId: string) => {
    const body = flatGovernment.find(g => g.id === bodyId) || null;
    onChange(bodyId, body);
  };

  // Group bodies by category
  const groupedBodies = useMemo(() => {
    const groups: { [key: string]: { category: typeof ARMENIAN_GOVERNMENT[0]; bodies: FlatGovernmentBody[] } } = {};
    
    flatGovernment.forEach(body => {
      if (!groups[body.categoryId]) {
        const category = ARMENIAN_GOVERNMENT.find(c => c.id === body.categoryId);
        if (category) {
          groups[body.categoryId] = { category, bodies: [] };
        }
      }
      groups[body.categoryId]?.bodies.push(body);
    });
    
    return Object.values(groups);
  }, [flatGovernment]);

  return (
    <div className="space-y-3">
      <div>
        <Label className="flex items-center gap-2 mb-2">
          <Building2 className="h-4 w-4" />
          {i18n.language === 'hy' ? "\u053F\u0561\u057C\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576" : i18n.language === 'en' ? "Government" : 'Правительство'}
        </Label>
        <Select value={value} onValueChange={handleSelect}>
          <SelectTrigger>
            <SelectValue placeholder={
              i18n.language === 'hy' ? "\u0538\u0576\u057F\u0580\u0565\u0584 \u056F\u0561\u057C\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0561\u0576 \u0574\u0561\u0580\u0574\u056B\u0576\u0568" : 
              i18n.language === 'en' ? "Select government body" : 
              'Выберите орган власти'
            } />
          </SelectTrigger>
          <SelectContent className="max-h-[400px]">
            {groupedBodies.map(({ category, bodies }) => (
              <SelectGroup key={category.id}>
                <SelectLabel className="font-semibold text-primary">
                  {getGovernmentCategoryName(category, i18n.language)}
                </SelectLabel>
                {bodies.map(body => (
                  <SelectItem 
                    key={body.id} 
                    value={body.id}
                    className="pl-6"
                  >
                    <span className="truncate">{getBodyDisplayName(body)}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Display selected body details */}
      {selectedBody && (
        <div className="p-3 bg-muted/50 rounded-lg space-y-2 text-sm">
          <div className="font-medium">{getBodyDisplayName(selectedBody)}</div>
          
          {selectedBody.address && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{selectedBody.address}</span>
            </div>
          )}
          
          {selectedBody.phones && selectedBody.phones.length > 0 && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <Phone className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex flex-wrap gap-1">
                {selectedBody.phones.map((phone, idx) => (
                  <Badge key={idx} variant="secondary" className="font-mono text-xs">
                    {phone}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {selectedBody.website && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <Globe className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{selectedBody.website}</span>
            </div>
          )}
          
          {selectedBody.email && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{selectedBody.email}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
