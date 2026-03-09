import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { 
  ARMENIAN_COURTS, 
  getFlatCourtList, 
  getCategoryName, 
  FlatCourt 
} from "@/data/armenianCourts";
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
import { Building2, Phone, MapPin } from "lucide-react";

interface CourtSelectorProps {
  value?: string;
  onChange: (courtId: string, courtData: FlatCourt | null) => void;
}

export function CourtSelector({ value, onChange }: CourtSelectorProps) {
  const { i18n } = useTranslation();
  const flatCourts = useMemo(() => getFlatCourtList(), []);
  
  const selectedCourt = useMemo(() => {
    return flatCourts.find(c => c.id === value) || null;
  }, [flatCourts, value]);

  const getCourtDisplayName = (court: FlatCourt): string => {
    switch (i18n.language) {
      case 'hy': return court.fullName_hy;
      case 'en': return court.fullName_en;
      default: return court.fullName_ru;
    }
  };

  const handleSelect = (courtId: string) => {
    const court = flatCourts.find(c => c.id === courtId) || null;
    onChange(courtId, court);
  };

  // Group courts by category
  const groupedCourts = useMemo(() => {
    const groups: { [key: string]: { category: typeof ARMENIAN_COURTS[0]; courts: FlatCourt[] } } = {};
    
    flatCourts.forEach(court => {
      if (!groups[court.categoryId]) {
        const category = ARMENIAN_COURTS.find(c => c.id === court.categoryId);
        if (category) {
          groups[court.categoryId] = { category, courts: [] };
        }
      }
      groups[court.categoryId]?.courts.push(court);
    });
    
    return Object.values(groups);
  }, [flatCourts]);

  return (
    <div className="space-y-3">
      <div>
        <Label className="flex items-center gap-2 mb-2">
          <Building2 className="h-4 w-4" />
          {i18n.language === 'hy' ? '\u0534\u0561\u057F\u0561\u0580\u0561\u0576' : i18n.language === 'en' ? 'Court' : '\u0421\u0443\u0434'}
        </Label>
        <Select value={value} onValueChange={handleSelect}>
          <SelectTrigger>
            <SelectValue placeholder={
              i18n.language === 'hy' ? '\u0538\u0576\u057F\u0580\u0565\u0584 \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u0568' : 
              i18n.language === 'en' ? 'Select court' : 
              '\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u0443\u0434'
            } />
          </SelectTrigger>
          <SelectContent className="max-h-[400px]">
            {groupedCourts.map(({ category, courts }) => (
              <SelectGroup key={category.id}>
                <SelectLabel className="font-semibold text-primary">
                  {getCategoryName(category, i18n.language)}
                </SelectLabel>
                {courts.map(court => (
                  <SelectItem 
                    key={court.id} 
                    value={court.id}
                    className="pl-6"
                  >
                    <span className="truncate">{getCourtDisplayName(court)}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Display selected court details */}
      {selectedCourt && (
        <div className="p-3 bg-muted/50 rounded-lg space-y-2 text-sm">
          <div className="font-medium">{getCourtDisplayName(selectedCourt)}</div>
          
          {selectedCourt.address && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{selectedCourt.address}</span>
            </div>
          )}
          
          {selectedCourt.phones && selectedCourt.phones.length > 0 && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <Phone className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex flex-wrap gap-1">
                {selectedCourt.phones.map((phone, idx) => (
                  <Badge key={idx} variant="secondary" className="font-mono text-xs">
                    {phone}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
