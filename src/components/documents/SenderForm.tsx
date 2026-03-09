import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SenderFormProps {
  senderName: string;
  onSenderNameChange: (name: string) => void;
  senderAddress: string;
  onSenderAddressChange: (address: string) => void;
  senderContact: string;
  onSenderContactChange: (contact: string) => void;
}

export function SenderForm({
  senderName,
  onSenderNameChange,
  senderAddress,
  onSenderAddressChange,
  senderContact,
  onSenderContactChange,
}: SenderFormProps) {
  const { t } = useTranslation(["cases"]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cases:sender")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="senderName">{t("cases:sender_name")}</Label>
          <Input
            id="senderName"
            value={senderName}
            onChange={(e) => onSenderNameChange(e.target.value)}
            placeholder={t("cases:sender_name_placeholder")}
          />
        </div>
        <div>
          <Label htmlFor="senderAddress">{t("cases:sender_address")}</Label>
          <Input
            id="senderAddress"
            value={senderAddress}
            onChange={(e) => onSenderAddressChange(e.target.value)}
            placeholder={t("cases:sender_address_placeholder")}
          />
        </div>
        <div>
          <Label htmlFor="senderContact">{t("cases:sender_contact")}</Label>
          <Input
            id="senderContact"
            value={senderContact}
            onChange={(e) => onSenderContactChange(e.target.value)}
            placeholder={t("cases:sender_contact_placeholder")}
          />
        </div>
      </CardContent>
    </Card>
  );
}
