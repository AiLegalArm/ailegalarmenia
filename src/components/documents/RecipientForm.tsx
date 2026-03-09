import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CourtSelector } from "./CourtSelector";
import { ProsecutorSelector } from "./ProsecutorSelector";
import { GovernmentSelector } from "./GovernmentSelector";
import { InvestigativeBodySelector } from "./InvestigativeBodySelector";
import { CommitteeServiceSelector } from "./CommitteeServiceSelector";
import { FlatCourt } from "@/data/armenianCourts";
import { FlatProsecutor } from "@/data/armenianProsecutors";
import { FlatGovernmentBody } from "@/data/armenianGovernment";
import { FlatInvestigativeBody } from "@/data/armenianInvestigativeBodies";
import { FlatCommitteeService } from "@/data/armenianCommitteesServices";

export type RecipientType = "court" | "prosecutor" | "government" | "investigative" | "other";

interface RecipientFormProps {
  recipientType: RecipientType;
  onRecipientTypeChange: (type: RecipientType) => void;
  recipientName: string;
  onRecipientNameChange: (name: string) => void;
  recipientPosition: string;
  onRecipientPositionChange: (position: string) => void;
  recipientOrganization: string;
  onRecipientOrganizationChange: (org: string) => void;
  selectedCourtId: string;
  onCourtChange: (id: string, data: FlatCourt | null) => void;
  selectedProsecutorId: string;
  onProsecutorChange: (id: string, data: FlatProsecutor | null) => void;
  selectedGovernmentId: string;
  onGovernmentChange: (id: string, data: FlatGovernmentBody | null) => void;
  selectedInvestigativeId: string;
  onInvestigativeChange: (id: string, data: FlatInvestigativeBody | null) => void;
  selectedCommitteeId: string;
  onCommitteeChange: (id: string, data: FlatCommitteeService | null) => void;
  onTemplateReset: () => void;
}

export function RecipientForm({
  recipientType,
  onRecipientTypeChange,
  recipientName,
  onRecipientNameChange,
  recipientPosition,
  onRecipientPositionChange,
  recipientOrganization,
  onRecipientOrganizationChange,
  selectedCourtId,
  onCourtChange,
  selectedProsecutorId,
  onProsecutorChange,
  selectedGovernmentId,
  onGovernmentChange,
  selectedInvestigativeId,
  onInvestigativeChange,
  selectedCommitteeId,
  onCommitteeChange,
  onTemplateReset,
}: RecipientFormProps) {
  const { i18n } = useTranslation();

  const labels = {
    recipient: i18n.language === 'hy' ? '\u0540\u0561\u057D\u0581\u0565\u0561\u057F\u0565\u0580' : i18n.language === 'en' ? 'Recipient' : '\u0410\u0434\u0440\u0435\u0441\u0430\u0442',
    court: i18n.language === 'hy' ? "\u0534\u0561\u057F\u0561\u0580\u0561\u0576" : i18n.language === 'en' ? 'Court' : '\u0421\u0443\u0434',
    prosecutor: i18n.language === 'hy' ? "\u0534\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576" : i18n.language === 'en' ? "Prosecutor" : '\u041F\u0440\u043E\u043A\u0443\u0440\u0430\u0442\u0443\u0440\u0430',
    investigative: i18n.language === 'hy' ? "\u0554\u0576\u0576\u0579\u0561\u056F\u0561\u0576" : i18n.language === 'en' ? 'Investigative' : '\u0420\u0430\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435',
    government: i18n.language === 'hy' ? "\u053F\u0561\u057C\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576" : i18n.language === 'en' ? 'Government' : '\u041F\u0440\u0430\u0432\u0438\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E',
    other: i18n.language === 'hy' ? "\u0531\u0575\u056C" : i18n.language === 'en' ? 'Other' : '\u0414\u0440\u0443\u0433\u043E\u0435',
    position: i18n.language === 'hy' ? '\u054A\u0561\u0577\u057F\u0578\u0576' : i18n.language === 'en' ? 'Position' : '\u0414\u043E\u043B\u0436\u043D\u043E\u0441\u0442\u044C',
    fullName: i18n.language === 'hy' ? '\u0531\u0576\u0578\u0582\u0576 \u0561\u0566\u0563\u0561\u0576\u0578\u0582\u0576' : i18n.language === 'en' ? 'Full name' : '\u0424\u0418\u041E',
    orEnterManually: i18n.language === 'hy' ? "\u053F\u0561\u0574 \u0574\u0578\u0582\u057F\u0584\u0561\u0563\u0580\u0565\u0584 \u0571\u0565\u057C\u0584\u0578\u057E" : i18n.language === 'en' ? 'Or enter manually' : '\u0418\u043B\u0438 \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u0432\u0440\u0443\u0447\u043D\u0443\u044E',
  };

  const handleTypeChange = (newType: RecipientType) => {
    onRecipientTypeChange(newType);
    onTemplateReset();
    // Clear all selectors
    onCourtChange("", null);
    onProsecutorChange("", null);
    onGovernmentChange("", null);
    onInvestigativeChange("", null);
    onCommitteeChange("", null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.recipient}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recipient Type Selector */}
        <div className="flex gap-2 flex-wrap">
          {(["court", "prosecutor", "investigative", "government", "other"] as RecipientType[]).map((type) => (
            <Button
              key={type}
              type="button"
              variant={recipientType === type ? "default" : "outline"}
              size="sm"
              onClick={() => handleTypeChange(type)}
            >
              {labels[type]}
            </Button>
          ))}
        </div>

        {/* Court Selector */}
        {recipientType === "court" && (
          <CourtSelector
            value={selectedCourtId}
            onChange={(courtId, courtData) => {
              onCourtChange(courtId, courtData);
              if (courtData) {
                const courtName = i18n.language === 'hy' ? courtData.fullName_hy : 
                                  i18n.language === 'en' ? courtData.fullName_en : 
                                  courtData.fullName_ru;
                onRecipientOrganizationChange(courtName);
              }
            }}
          />
        )}

        {/* Prosecutor Selector */}
        {recipientType === "prosecutor" && (
          <ProsecutorSelector
            value={selectedProsecutorId}
            onChange={(prosecutorId, prosecutorData) => {
              onProsecutorChange(prosecutorId, prosecutorData);
              if (prosecutorData) {
                const prosecutorName = i18n.language === 'hy' ? prosecutorData.fullName_hy : 
                                       i18n.language === 'en' ? prosecutorData.fullName_en : 
                                       prosecutorData.fullName_ru;
                onRecipientOrganizationChange(prosecutorName);
              }
            }}
          />
        )}

        {/* Investigative Body Selector */}
        {recipientType === "investigative" && (
          <InvestigativeBodySelector
            value={selectedInvestigativeId}
            onChange={(bodyId, bodyData) => {
              onInvestigativeChange(bodyId, bodyData);
              if (bodyData) {
                const bodyName = i18n.language === 'hy' ? bodyData.fullName_hy : 
                                 i18n.language === 'en' ? bodyData.fullName_en : 
                                 bodyData.fullName_ru;
                onRecipientOrganizationChange(bodyName);
              }
            }}
          />
        )}

        {/* Government Selector */}
        {recipientType === "government" && (
          <GovernmentSelector
            value={selectedGovernmentId}
            onChange={(governmentId, governmentData) => {
              onGovernmentChange(governmentId, governmentData);
              if (governmentData) {
                const govName = i18n.language === 'hy' ? governmentData.fullName_hy : 
                                i18n.language === 'en' ? governmentData.fullName_en : 
                                governmentData.fullName_ru;
                onRecipientOrganizationChange(govName);
              }
            }}
          />
        )}

        {/* Other Organization */}
        {recipientType === "other" && (
          <div className="space-y-4">
            <CommitteeServiceSelector
              value={selectedCommitteeId}
              onChange={(bodyId, bodyData) => {
                onCommitteeChange(bodyId, bodyData);
                if (bodyData) {
                  const bodyName = i18n.language === 'hy' ? bodyData.fullName_hy : 
                                   i18n.language === 'en' ? bodyData.fullName_en : 
                                   bodyData.fullName_ru;
                  onRecipientOrganizationChange(bodyName);
                }
              }}
            />
            
            <div>
              <Label htmlFor="recipientOrganization">{labels.orEnterManually}</Label>
              <Input
                id="recipientOrganization"
                value={recipientOrganization}
                onChange={(e) => {
                  onRecipientOrganizationChange(e.target.value);
                  onCommitteeChange("", null);
                }}
                placeholder={i18n.language === 'hy' ? "\u0555\u0580\u056B\u0576\u0561\u056F\u055D \u053F\u0561\u0566\u0574\u0561\u056F\u0565\u0580\u057A\u0578\u0582\u0569\u0575\u0561\u0576 \u0561\u0576\u0578\u0582\u0576\u0568" : 
                              i18n.language === 'en' ? 'e.g. Other organization name' : 
                              '\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0434\u0440\u0443\u0433\u043E\u0439 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0430\u0446\u0438\u0438'}
              />
            </div>
          </div>
        )}
        
        <div>
          <Label htmlFor="recipientPosition">{labels.position}</Label>
          <Input
            id="recipientPosition"
            value={recipientPosition}
            onChange={(e) => onRecipientPositionChange(e.target.value)}
            placeholder={i18n.language === 'hy' ? '\u0555\u0580\u056B\u0576\u0561\u056F\u055D \u0546\u0561\u056D\u0561\u0563\u0561\u0570' : 
                          i18n.language === 'en' ? 'e.g. Chairman' : 
                          '\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u041F\u0440\u0435\u0434\u0441\u0435\u0434\u0430\u0442\u0435\u043B\u044C'}
          />
        </div>
        <div>
          <Label htmlFor="recipientName">{labels.fullName}</Label>
          <Input
            id="recipientName"
            value={recipientName}
            onChange={(e) => onRecipientNameChange(e.target.value)}
            placeholder={i18n.language === 'hy' ? '\u053B\u057E\u0561\u0576\u0578\u057E \u053B\u057E\u0561\u0576 \u053B\u057E\u0561\u0576\u056B' : 
                          i18n.language === 'en' ? 'John Smith' : 
                          '\u0418\u0432\u0430\u043D\u043E\u0432 \u0418\u0432\u0430\u043D \u0418\u0432\u0430\u043D\u043E\u0432\u0438\u0447'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

