import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Calculator, Users, FileText, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

interface Party {
  id: string;
  fullName: string;
  address: string;
  role: string;
}

interface Requirement {
  id: string;
  text: string;
}

interface DynamicFieldsState {
  claimAmount: string;
  courtFee: string;
  currentMeasure: string;
  proposedAlternative: string;
  thirdParties: Party[];
  coDefendants: Party[];
  requirements: Requirement[];
}

interface DynamicDocumentFieldsProps {
  templateId: string;
  category: string;
  subcategory: string | null;
  onFieldsChange: (fields: DynamicFieldsState) => void;
}

// =============================================================================
// CONSTANTS - Document types requiring specific fields
// =============================================================================

// Documents requiring claim amount and court fee
const CLAIM_AMOUNT_DOCUMENTS = [
  "statement_of_claim",
  "civil_claim",
  "property_claim",
  "divorce_claim",
  "alimony_claim",
  "labor_claim",
  "admin_claim",
  "administrative_claim",
  "compensation_claim",
  "damages_claim"
];

// Documents related to detention/arrest
const DETENTION_DOCUMENTS = [
  "arrest_complaint",
  "detention_complaint",
  "measure_complaint",
  "preventive_measure",
  "release_motion",
  "bail_motion"
];

// Court fee rates in Armenia (AMD)
const COURT_FEE_RATES = {
  civil_property: { base: 4000, rate: 0.03, maxRate: 0.04 }, // 3-4% of claim
  civil_non_property: { fixed: 4000 },
  administrative: { fixed: 3000 },
  labor: { fixed: 0 }, // Free for employees
  alimony: { fixed: 0 }, // Free
  cassation: { multiplier: 1.5 }, // 150% of first instance fee
  appeal: { multiplier: 1.0 }, // Same as first instance
};

// Preventive measures in Armenia
const PREVENTIVE_MEASURES = [
  { id: "arrest", label_hy: "\u053F\u0561\u056C\u0561\u0576\u0561\u057E\u0578\u0580\u0578\u0582\u0574", label_ru: "\u0410\u0440\u0435\u0441\u0442", label_en: "Arrest" },
  { id: "house_arrest", label_hy: "\u054F\u0576\u0561\u0575\u056B\u0576 \u056F\u0561\u056C\u0561\u0576\u0584", label_ru: "\u0414\u043E\u043C\u0430\u0448\u043D\u0438\u0439 \u0430\u0440\u0435\u0441\u0442", label_en: "House arrest" },
  { id: "bail", label_hy: "\u0533\u0580\u0561\u057E", label_ru: "\u0417\u0430\u043B\u043E\u0433", label_en: "Bail" },
  { id: "personal_guarantee", label_hy: "\u0531\u0576\u0571\u0576\u0561\u056F\u0561\u0576 \u0565\u0580\u0561\u0577\u056D\u0561\u057E\u0578\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576", label_ru: "\u041B\u0438\u0447\u043D\u043E\u0435 \u043F\u043E\u0440\u0443\u0447\u0438\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u043E", label_en: "Personal guarantee" },
  { id: "travel_ban", label_hy: "\u0535\u0580\u056F\u0580\u056B\u0581 \u0570\u0565\u057C\u0561\u0576\u0561\u056C\u0578\u0582 \u0561\u0580\u0563\u0565\u056C\u0584", label_ru: "\u0417\u0430\u043F\u0440\u0435\u0442 \u0432\u044B\u0435\u0437\u0434\u0430", label_en: "Travel ban" },
  { id: "supervision", label_hy: "\u054E\u0565\u0580\u0561\u0570\u057D\u056F\u0578\u0572\u0578\u0582\u0569\u0575\u0578\u0582\u0576", label_ru: "\u041D\u0430\u0434\u0437\u043E\u0440", label_en: "Supervision" },
];

// Standard requirements templates
const REQUIREMENT_TEMPLATES = {
  hy: [
    "\u0532\u0561\u057E\u0561\u0580\u0561\u0580\u0565\u056C \u0570\u0561\u0575\u0581\u0568 \u0561\u0574\u0562\u0578\u0572\u057B\u0578\u0582\u0569\u0575\u0561\u0574\u0562",
    "\u0532\u0565\u056F\u0561\u0576\u0565\u056C \u057E\u0573\u0561\u0580\u057E\u0561\u056E \u057E\u0576\u0561\u057D\u0568",
    "\u0540\u0561\u057F\u0578\u0582\u0581\u0565\u056C \u0562\u0561\u0581 \u0569\u0578\u0572\u0576\u057E\u0561\u056E \u0564\u0561\u057F\u0561\u056F\u0561\u0576 \u0561\u056F\u057F\u0568",
    "\u054F\u0580\u0561\u0574\u0561\u0564\u0580\u0565\u056C \u057A\u0561\u057F\u0573\u0561\u057C\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0561\u0576 \u056E\u0561\u056D\u057D\u0565\u0580\u0568",
    "\u054A\u0561\u0570\u0561\u0576\u057B\u0565\u056C \u057E\u0576\u0561\u057D\u0576\u0565\u0580\u056B \u0570\u0561\u057F\u0578\u0582\u0581\u0578\u0582\u0574\u0568",
  ],
  ru: [
    "\u0423\u0434\u043E\u0432\u043B\u0435\u0442\u0432\u043E\u0440\u0438\u0442\u044C \u0438\u0441\u043A \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E",
    "\u0412\u0437\u044B\u0441\u043A\u0430\u0442\u044C \u043F\u0440\u0438\u0447\u0438\u043D\u0435\u043D\u043D\u044B\u0439 \u0443\u0449\u0435\u0440\u0431",
    "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043E\u0441\u043F\u0430\u0440\u0438\u0432\u0430\u0435\u043C\u044B\u0439 \u0430\u043A\u0442",
    "\u0412\u043E\u0437\u043C\u0435\u0441\u0442\u0438\u0442\u044C \u0441\u0443\u0434\u0435\u0431\u043D\u044B\u0435 \u0440\u0430\u0441\u0445\u043E\u0434\u044B",
    "\u0412\u0437\u044B\u0441\u043A\u0430\u0442\u044C \u0432\u043E\u0437\u043C\u0435\u0449\u0435\u043D\u0438\u0435 \u0443\u0431\u044B\u0442\u043A\u043E\u0432",
  ],
  en: [
    "Grant the claim in full",
    "Award damages",
    "Annul the contested act",
    "Reimburse court expenses",
    "Award compensation for losses",
  ]
};

// =============================================================================
// COMPONENT
// =============================================================================

export function DynamicDocumentFields({
  templateId,
  category,
  subcategory,
  onFieldsChange
}: DynamicDocumentFieldsProps) {
  const { i18n } = useTranslation();
  const lang = i18n.language as "hy" | "ru" | "en";

  // State
  const [fields, setFields] = useState<DynamicFieldsState>({
    claimAmount: "",
    courtFee: "",
    currentMeasure: "",
    proposedAlternative: "",
    thirdParties: [],
    coDefendants: [],
    requirements: []
  });

  // Determine which fields to show
  const showClaimFields = useMemo(() => {
    const templateLower = (templateId || subcategory || "").toLowerCase();
    return CLAIM_AMOUNT_DOCUMENTS.some(doc => 
      templateLower.includes(doc) || 
      category === "civil_process" && (templateLower.includes("claim") || templateLower.includes("haytsts"))
    );
  }, [templateId, subcategory, category]);

  const showDetentionFields = useMemo(() => {
    const templateLower = (templateId || subcategory || "").toLowerCase();
    return DETENTION_DOCUMENTS.some(doc => templateLower.includes(doc)) ||
           category === "criminal_process" && templateLower.includes("arrest");
  }, [templateId, subcategory, category]);

  const showPartyFields = useMemo(() => {
    return category === "civil_process" || category === "administrative_process";
  }, [category]);

  // Update parent when fields change
  const updateFields = useCallback((updates: Partial<DynamicFieldsState>) => {
    setFields(prev => {
      const newFields = { ...prev, ...updates };
      onFieldsChange(newFields);
      return newFields;
    });
  }, [onFieldsChange]);

  // Calculate court fee based on claim amount
  const calculateCourtFee = useCallback((amount: string) => {
    const numAmount = parseFloat(amount.replace(/[^\d.]/g, "")) || 0;
    let fee = 0;

    if (category === "civil_process") {
      if (numAmount > 0) {
        // Property claim: 3% with min 4000 AMD
        fee = Math.max(4000, Math.round(numAmount * 0.03));
      } else {
        // Non-property claim
        fee = 4000;
      }
    } else if (category === "administrative_process") {
      fee = 3000;
    }

    // Apply multiplier for appeals/cassation
    const templateLower = (templateId || subcategory || "").toLowerCase();
    if (templateLower.includes("cassation")) {
      fee = Math.round(fee * 1.5);
    }

    updateFields({ claimAmount: amount, courtFee: fee.toString() });
  }, [category, templateId, subcategory, updateFields]);

  // Party management
  const addParty = (type: "thirdParties" | "coDefendants") => {
    const newParty: Party = {
      id: `party-${Date.now()}`,
      fullName: "",
      address: "",
      role: type === "thirdParties" ? "third_party" : "co_defendant"
    };
    updateFields({ [type]: [...fields[type], newParty] });
  };

  const updateParty = (type: "thirdParties" | "coDefendants", id: string, updates: Partial<Party>) => {
    const updated = fields[type].map(p => p.id === id ? { ...p, ...updates } : p);
    updateFields({ [type]: updated });
  };

  const removeParty = (type: "thirdParties" | "coDefendants", id: string) => {
    const updated = fields[type].filter(p => p.id !== id);
    updateFields({ [type]: updated });
  };

  // Requirements management
  const addRequirement = (template?: string) => {
    const newReq: Requirement = {
      id: `req-${Date.now()}`,
      text: template || ""
    };
    updateFields({ requirements: [...fields.requirements, newReq] });
  };

  const updateRequirement = (id: string, text: string) => {
    const updated = fields.requirements.map(r => r.id === id ? { ...r, text } : r);
    updateFields({ requirements: updated });
  };

  const removeRequirement = (id: string) => {
    const updated = fields.requirements.filter(r => r.id !== id);
    updateFields({ requirements: updated });
  };

  // Labels
  const labels = {
    claimAmount: lang === "hy" ? "\u0540\u0561\u0575\u0581\u056B \u0563\u056B\u0576" : lang === "ru" ? "\u0426\u0435\u043D\u0430 \u0438\u0441\u043A\u0430" : "Claim amount",
    courtFee: lang === "hy" ? "\u054A\u0565\u057F\u0561\u056F\u0561\u0576 \u057F\u0578\u0582\u0580\u0584" : lang === "ru" ? "\u0413\u043E\u0441\u043F\u043E\u0448\u043B\u0438\u043D\u0430" : "Court fee",
    calculate: lang === "hy" ? "\u0540\u0561\u0577\u057E\u0561\u0580\u056F\u0565\u056C" : lang === "ru" ? "\u0420\u0430\u0441\u0441\u0447\u0438\u0442\u0430\u0442\u044C" : "Calculate",
    amd: lang === "hy" ? "\u0564\u0580\u0561\u0574" : lang === "ru" ? "\u0434\u0440\u0430\u043C" : "AMD",
    currentMeasure: lang === "hy" ? "\u0533\u0578\u0580\u056E\u0578\u0572 \u056D\u0561\u0583\u0561\u0576\u0574\u0561\u0576 \u0574\u056B\u057B\u0578\u0581\u0568" : lang === "ru" ? "\u0422\u0435\u043A\u0443\u0449\u0430\u044F \u043C\u0435\u0440\u0430 \u043F\u0440\u0435\u0441\u0435\u0447\u0435\u043D\u0438\u044F" : "Current preventive measure",
    proposedAlternative: lang === "hy" ? "\u0531\u057C\u0561\u057B\u0561\u0580\u056F\u057E\u0578\u0572 \u0561\u0575\u056C\u0568\u0576\u057F\u0580\u0561\u0576\u0584" : lang === "ru" ? "\u041F\u0440\u0435\u0434\u043B\u0430\u0433\u0430\u0435\u043C\u0430\u044F \u0430\u043B\u044C\u0442\u0435\u0440\u043D\u0430\u0442\u0438\u0432\u0430" : "Proposed alternative",
    addThirdParty: lang === "hy" ? "\u0531\u057E\u0565\u056C\u0561\u0581\u0576\u0565\u056C \u0565\u0580\u0580\u0578\u0580\u0564 \u0561\u0576\u0571" : lang === "ru" ? "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0442\u0440\u0435\u0442\u044C\u0435 \u043B\u0438\u0446\u043E" : "Add third party",
    addCoDefendant: lang === "hy" ? "\u0531\u057E\u0565\u056C\u0561\u0581\u0576\u0565\u056C \u0570\u0561\u0574\u0561\u057A\u0561\u057F\u0561\u057D\u056D\u0561\u0576" : lang === "ru" ? "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0447\u0438\u043A\u0430" : "Add co-defendant",
    addRequirement: lang === "hy" ? "\u0531\u057E\u0565\u056C\u0561\u0581\u0576\u0565\u056C \u057A\u0561\u0570\u0561\u0576\u057B" : lang === "ru" ? "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435" : "Add requirement",
    fullName: lang === "hy" ? "\u0531\u0576\u0578\u0582\u0576 \u0561\u0566\u0563\u0561\u0576\u0578\u0582\u0576" : lang === "ru" ? "\u0424\u0418\u041E" : "Full name",
    address: lang === "hy" ? "\u0540\u0561\u057D\u0581\u0565" : lang === "ru" ? "\u0410\u0434\u0440\u0435\u0441" : "Address",
    requirements: lang === "hy" ? "\u054A\u0561\u0570\u0561\u0576\u057B\u0576\u0565\u0580" : lang === "ru" ? "\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F" : "Requirements",
    templates: lang === "hy" ? "\u0546\u0574\u0578\u0582\u0577\u0576\u0565\u0580" : lang === "ru" ? "\u0428\u0430\u0431\u043B\u043E\u043D\u044B" : "Templates",
  };

  const getMeasureLabel = (measure: typeof PREVENTIVE_MEASURES[0]) => {
    return lang === "hy" ? measure.label_hy : lang === "ru" ? measure.label_ru : measure.label_en;
  };

  // Don't render if no fields are needed
  if (!showClaimFields && !showDetentionFields && !showPartyFields) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Claim Amount & Court Fee */}
      {showClaimFields && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              {labels.claimAmount}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{labels.claimAmount}</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={fields.claimAmount}
                    onChange={(e) => setFields(prev => ({ ...prev, claimAmount: e.target.value }))}
                    placeholder="0"
                    className="text-right"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => calculateCourtFee(fields.claimAmount)}
                    title={labels.calculate}
                  >
                    <Calculator className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">{labels.courtFee}</Label>
                <div className="relative">
                  <Input
                    type="text"
                    value={fields.courtFee}
                    onChange={(e) => updateFields({ courtFee: e.target.value })}
                    placeholder="0"
                    className="text-right pr-16"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    {labels.amd}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detention/Preventive Measure Fields */}
      {showDetentionFields && (
        <Card className="border-red-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-red-600">
              <FileText className="h-4 w-4" />
              {labels.currentMeasure}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">{labels.currentMeasure}</Label>
              <Select
                value={fields.currentMeasure}
                onValueChange={(v) => updateFields({ currentMeasure: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={labels.currentMeasure} />
                </SelectTrigger>
                <SelectContent>
                  {PREVENTIVE_MEASURES.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {getMeasureLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{labels.proposedAlternative}</Label>
              <Select
                value={fields.proposedAlternative}
                onValueChange={(v) => updateFields({ proposedAlternative: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={labels.proposedAlternative} />
                </SelectTrigger>
                <SelectContent>
                  {PREVENTIVE_MEASURES.filter(m => m.id !== fields.currentMeasure).map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {getMeasureLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Third Parties & Co-Defendants */}
      {showPartyFields && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              {lang === "hy" ? "\u053F\u0578\u0572\u0574\u0565\u0580" : lang === "ru" ? "\u0421\u0442\u043E\u0440\u043E\u043D\u044B" : "Parties"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Third Parties */}
            <div className="space-y-2">
              {fields.thirdParties.map((party, idx) => (
                <div key={party.id} className="flex gap-2 items-start p-2 bg-muted/50 rounded-md">
                  <Badge variant="secondary" className="shrink-0 mt-1">
                    {idx + 1}
                  </Badge>
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder={labels.fullName}
                      value={party.fullName}
                      onChange={(e) => updateParty("thirdParties", party.id, { fullName: e.target.value })}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder={labels.address}
                      value={party.address}
                      onChange={(e) => updateParty("thirdParties", party.id, { address: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-destructive"
                    onClick={() => removeParty("thirdParties", party.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addParty("thirdParties")}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                {labels.addThirdParty}
              </Button>
            </div>

            {/* Co-Defendants */}
            <div className="space-y-2">
              {fields.coDefendants.map((party, idx) => (
                <div key={party.id} className="flex gap-2 items-start p-2 bg-orange-500/10 rounded-md">
                  <Badge variant="outline" className="shrink-0 mt-1 border-orange-500 text-orange-600">
                    {idx + 1}
                  </Badge>
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder={labels.fullName}
                      value={party.fullName}
                      onChange={(e) => updateParty("coDefendants", party.id, { fullName: e.target.value })}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder={labels.address}
                      value={party.address}
                      onChange={(e) => updateParty("coDefendants", party.id, { address: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-destructive"
                    onClick={() => removeParty("coDefendants", party.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addParty("coDefendants")}
                className="w-full border-orange-500/50 text-orange-600 hover:bg-orange-500/10"
              >
                <Plus className="h-4 w-4 mr-2" />
                {labels.addCoDefendant}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Requirements */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            {labels.requirements}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Quick Templates */}
          <div className="flex flex-wrap gap-1">
            <span className="text-xs text-muted-foreground mr-1">{labels.templates}:</span>
            {REQUIREMENT_TEMPLATES[lang].slice(0, 3).map((template, idx) => (
              <Badge
                key={idx}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10 text-xs"
                onClick={() => addRequirement(template)}
              >
                + {template.substring(0, 25)}...
              </Badge>
            ))}
          </div>

          {/* Requirements List */}
          <div className="space-y-2">
            {fields.requirements.map((req, idx) => (
              <div key={req.id} className="flex gap-2 items-center">
                <Badge variant="secondary" className="shrink-0">{idx + 1}</Badge>
                <Input
                  value={req.text}
                  onChange={(e) => updateRequirement(req.id, e.target.value)}
                  placeholder={lang === "hy" ? "\u054A\u0561\u0570\u0561\u0576\u057B..." : lang === "ru" ? "\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u0435..." : "Requirement..."}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-destructive"
                  onClick={() => removeRequirement(req.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addRequirement()}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              {labels.addRequirement}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
