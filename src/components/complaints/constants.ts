import { 
  Gavel, Scale, Building2, Globe, FileText, ShieldAlert, UserCheck 
} from "lucide-react";
import type { ComplaintCategory, ComplaintType } from "./types";

// =============================================================================
// COMPLAINT TYPES REGISTRY
// =============================================================================

export const COMPLAINT_TYPES: ComplaintType[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // CRIMINAL - Уголовные жалобы и иски
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "criminal_appeal",
    labelHy: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584 (\u0584\u0580\u0565\u0561\u056F\u0561\u0576)",
    labelRu: "Апелляционная жалоба (уголовная)",
    labelEn: "Criminal Appeal",
    category: "criminal",
    templateId: "criminal_appeal_cassation"
  },
  {
    id: "criminal_cassation",
    labelHy: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584 (\u0584\u0580\u0565\u0561\u056F\u0561\u0576)",
    labelRu: "Кассационная жалоба (уголовная)",
    labelEn: "Criminal Cassation",
    category: "criminal",
    templateId: "criminal_appeal_cassation"
  },
  {
    id: "investigator_complaint",
    labelHy: "\u0532\u0578\u0572\u0578\u0584 \u0584\u0576\u0576\u056B\u0579\u056B \u0563\u0578\u0580\u056E\u0578\u0572\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0565\u0574",
    labelRu: "Жалоба на действия следователя",
    labelEn: "Complaint against investigator",
    category: "criminal",
    templateId: "investigator_complaint"
  },
  {
    id: "preventive_measure_complaint",
    labelHy: "\u0532\u0578\u0572\u0578\u0584 \u056D\u0561\u0583\u0561\u0576\u0574\u0561\u0576 \u0574\u056B\u057B\u0578\u0581\u056B \u0564\u0565\u0574",
    labelRu: "Жалоба на меру пресечения",
    labelEn: "Complaint against preventive measure",
    category: "criminal",
    templateId: "preventive_measure_complaint"
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CIVIL - Гражданские жалобы и иски
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "civil_claim",
    labelHy: "\u0540\u0561\u0575\u0581\u0561\u0564\u056B\u0574\u0578\u0582\u0574 (\u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576)",
    labelRu: "Исковое заявление (гражданское)",
    labelEn: "Civil Claim",
    category: "civil",
    templateId: "civil_claim"
  },
  {
    id: "civil_appeal",
    labelHy: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584 (\u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576)",
    labelRu: "Апелляционная жалоба (гражданская)",
    labelEn: "Civil Appeal",
    category: "civil",
    templateId: "civil_appeal"
  },
  {
    id: "civil_cassation",
    labelHy: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584 (\u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576)",
    labelRu: "Кассационная жалоба (гражданская)",
    labelEn: "Civil Cassation",
    category: "civil",
    templateId: "civil_cassation"
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ADMINISTRATIVE - Административные жалобы и иски
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "administrative_claim",
    labelHy: "\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u0570\u0561\u0575\u0581",
    labelRu: "Административный иск",
    labelEn: "Administrative Claim",
    category: "administrative",
    templateId: "administrative_claim"
  },
  {
    id: "admin_appeal",
    labelHy: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584 (\u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576)",
    labelRu: "Апелляционная жалоба (административная)",
    labelEn: "Administrative Appeal",
    category: "administrative",
    templateId: "administrative_appeal"
  },
  {
    id: "admin_cassation",
    labelHy: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584 (\u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576)",
    labelRu: "Кассационная жалоба (административная)",
    labelEn: "Administrative Cassation",
    category: "administrative",
    templateId: "administrative_cassation"
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ANTICORRUPTION - Антикоррупционный суд
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "anticorruption_appeal",
    labelHy: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0562\u0578\u0572\u0578\u0584 (\u0570\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0578\u0576)",
    labelRu: "Апелляционная жалоба (антикоррупционная)",
    labelEn: "Anti-Corruption Appeal",
    category: "anticorruption",
    templateId: "anticorruption_appeal"
  },
  {
    id: "anticorruption_cassation",
    labelHy: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0562\u0578\u0572\u0578\u0584 (\u0570\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0578\u0576)",
    labelRu: "Кассационная жалоба (антикоррупционная)",
    labelEn: "Anti-Corruption Cassation",
    category: "anticorruption",
    templateId: "anticorruption_cassation"
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTITUTIONAL - Конституционный суд
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "constitutional_complaint",
    labelHy: "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576 \u0562\u0578\u0572\u0578\u0584",
    labelRu: "Конституционная жалоба",
    labelEn: "Constitutional Complaint",
    category: "constitutional",
    templateId: "constitutional"
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ECHR - Европейский суд по правам человека
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "echr_application",
    labelHy: "\u0534\u056B\u0574\u0578\u0582\u0574 \u0535\u054D\u054A\u0540",
    labelRu: "Заявление в ЕСПЧ",
    labelEn: "ECHR Application",
    category: "echr",
    templateId: "echr_application"
  },
  {
    id: "echr_rule39",
    labelHy: "\u053F\u0561\u0576\u0578\u0576 39 \u0540\u0561\u0575\u0581",
    labelRu: "Ходатайство по Правилу 39",
    labelEn: "Rule 39 Request",
    category: "echr",
    templateId: "echr_rule_39"
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OMBUDSMAN - Защитник прав человека
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ombudsman_complaint",
    labelHy: "\u0532\u0578\u0572\u0578\u0584 \u0544\u0561\u0580\u0564\u0578\u0582 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u057A\u0561\u0577\u057F\u057A\u0561\u0576\u056B\u0576",
    labelRu: "Жалоба Защитнику прав человека",
    labelEn: "Complaint to Human Rights Defender",
    category: "ombudsman",
    templateId: "ombudsman_complaint"
  },
  {
    id: "ombudsman_systemic",
    labelHy: "\u0534\u056B\u0574\u0578\u0582\u0574 \u0570\u0561\u0574\u0561\u056F\u0561\u0580\u0563\u0561\u0575\u056B\u0576 \u056D\u0576\u0564\u0580\u056B \u057E\u0565\u0580\u0561\u0562\u0565\u0580\u0575\u0561\u056C",
    labelRu: "Заявление о системной проблеме",
    labelEn: "Systemic Issue Application",
    category: "ombudsman",
    templateId: "ombudsman_systemic"
  }
];

// =============================================================================
// CATEGORY VISUAL CONFIG
// =============================================================================

export const CATEGORY_ICONS = {
  criminal: Gavel,
  civil: Scale,
  administrative: Building2,
  anticorruption: ShieldAlert,
  constitutional: FileText,
  echr: Globe,
  ombudsman: UserCheck
} as const;

export const CATEGORY_COLORS: Record<ComplaintCategory, string> = {
  criminal: "text-red-500",
  civil: "text-blue-500",
  administrative: "text-amber-500",
  anticorruption: "text-orange-600",
  constitutional: "text-purple-500",
  echr: "text-green-500",
  ombudsman: "text-teal-500"
};

// =============================================================================
// CATEGORY LABELS (TRILINGUAL)
// =============================================================================

export const CATEGORY_LABELS: Record<ComplaintCategory, Record<string, string>> = {
  criminal: { 
    hy: "\u0554\u0580\u0565\u0561\u056F\u0561\u0576", 
    ru: "Уголовное", 
    en: "Criminal" 
  },
  civil: { 
    hy: "\u0554\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576", 
    ru: "Гражданское", 
    en: "Civil" 
  },
  administrative: { 
    hy: "\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576", 
    ru: "Административное", 
    en: "Administrative" 
  },
  anticorruption: { 
    hy: "\u0540\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0578\u0576", 
    ru: "Антикоррупционное", 
    en: "Anti-Corruption" 
  },
  constitutional: { 
    hy: "\u054D\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056F\u0561\u0576", 
    ru: "Конституционное", 
    en: "Constitutional" 
  },
  echr: { 
    hy: "\u0535\u054D\u054A\u0540", 
    ru: "ЕСПЧ", 
    en: "ECHR" 
  },
  ombudsman: { 
    hy: "\u0544\u0561\u0580\u0564\u0578\u0582 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u057A\u0561\u0577\u057F\u057A\u0561\u0576", 
    ru: "Омбудсмен", 
    en: "Ombudsman" 
  }
};

// =============================================================================
// HELPERS
// =============================================================================

export function getComplaintTypeLabel(type: ComplaintType, lang: string): string {
  if (lang === "hy") return type.labelHy;
  if (lang === "ru") return type.labelRu;
  return type.labelEn;
}

export function getCategoryLabel(cat: ComplaintCategory, lang: string): string {
  return CATEGORY_LABELS[cat][lang] || CATEGORY_LABELS[cat].en;
}

export function getComplaintTypesByCategory(category: ComplaintCategory): ComplaintType[] {
  return COMPLAINT_TYPES.filter(t => t.category === category);
}

export function determineCourtType(complaintId: string): "appellate" | "cassation" | "constitutional" | "echr" | "anticorruption" | "ombudsman" {
  if (complaintId.includes('ombudsman')) return 'ombudsman';
  if (complaintId.includes('anticorruption')) return 'anticorruption';
  if (complaintId.includes('cassation')) return 'cassation';
  if (complaintId.includes('constitutional')) return 'constitutional';
  if (complaintId.includes('echr')) return 'echr';
  return 'appellate';
}
