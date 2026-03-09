import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LanguageSelectorProps {
  language: string;
  onLanguageChange: (language: string) => void;
}

export function LanguageSelector({ language, onLanguageChange }: LanguageSelectorProps) {
  const { t } = useTranslation(["cases"]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cases:document_language")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Select value={language} onValueChange={onLanguageChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hy">{"\u0540\u0561\u0575\u0565\u0580\u0565\u0576"} (Armenian)</SelectItem>
            <SelectItem value="ru">{"\u0420\u0443\u0441\u0441\u043A\u0438\u0439"}</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
