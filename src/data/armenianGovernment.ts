// Справочник Правительства РА и министерств

export interface GovernmentBody {
  id: string;
  name_hy: string;
  name_ru: string;
  name_en: string;
  address?: string;
  phones?: string[];
  website?: string;
  email?: string;
}

export interface GovernmentCategory {
  id: string;
  name_hy: string;
  name_ru: string;
  name_en: string;
  bodies: GovernmentBody[];
}

export const ARMENIAN_GOVERNMENT: GovernmentCategory[] = [
  {
    id: "government",
    name_hy: "\u0540\u0540 \u053F\u0561\u057C\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    name_ru: "Правительство РА",
    name_en: "Government of RA",
    bodies: [
      {
        id: "government_ra",
        name_hy: "\u0540\u0540 \u053F\u0561\u057C\u0561\u057E\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Правительство РА",
        name_en: "Government of the Republic of Armenia",
        address: "г. Ереван, пл. Республики, Дом Правительства 1",
        phones: ["010 515910"],
        website: "gov.am"
      }
    ]
  },
  {
    id: "ministries",
    name_hy: "\u0546\u0561\u056D\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580",
    name_ru: "Министерства",
    name_en: "Ministries",
    bodies: [
      {
        id: "ministry_justice",
        name_hy: "\u0540\u0540 \u0531\u0580\u0564\u0561\u0580\u0561\u0564\u0561\u057F\u0578\u0582\u0569\u0575\u0561\u0576 \u0576\u0561\u056D\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Министерство юстиции",
        name_en: "Ministry of Justice",
        address: "г. Ереван, ул. Алабяна, 41а; ул. Вазгена Саргсяна, 3/8",
        phones: ["010 319096"],
        website: "justice.am",
        email: "justice@justice.am"
      },
      {
        id: "ministry_interior",
        name_hy: "\u0540\u0540 \u0546\u0565\u0580\u0584\u056B\u0576 \u0563\u0578\u0580\u056E\u0565\u0580\u056B \u0576\u0561\u056D\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Министерство внутренних дел",
        name_en: "Ministry of Internal Affairs",
        address: "г. Ереван, ул. Налбандяна, 130",
        phones: ["010 596180"],
        website: "police.am"
      },
      {
        id: "ministry_finance",
        name_hy: "\u0540\u0540 \u0556\u056B\u0576\u0561\u0576\u057D\u0576\u0565\u0580\u056B \u0576\u0561\u056D\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Министерство финансов",
        name_en: "Ministry of Finance",
        address: "г. Ереван, ул. Мелик-Адамяна, 1",
        phones: ["010 595304"],
        website: "minfin.am"
      },
      {
        id: "ministry_labor",
        name_hy: "\u0540\u0540 \u0531\u0577\u056D\u0561\u057F\u0561\u0576\u0584\u056B \u0587 \u057D\u0578\u0581\u056B\u0561\u056C\u0561\u056F\u0561\u0576 \u0570\u0561\u0580\u0581\u0565\u0580\u056B \u0576\u0561\u056D\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Министерство труда и социальных вопросов",
        name_en: "Ministry of Labor and Social Affairs",
        address: "г. Ереван, пл. Республики, Дом Правительства 3",
        phones: ["010 526831"],
        website: "mss.am"
      },
      {
        id: "ministry_territorial",
        name_hy: "\u0540\u0540 \u054F\u0561\u0580\u0561\u056E\u0584\u0561\u0575\u056B\u0576 \u056F\u0561\u057C\u0561\u057E\u0561\u0580\u0574\u0561\u0576 \u0587 \u0565\u0576\u0569\u0561\u056F\u0561\u057C\u0578\u0582\u0581\u057E\u0561\u056E\u0584\u0576\u0565\u0580\u056B \u0576\u0561\u056D\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Министерство территориального управления и инфраструктур",
        name_en: "Ministry of Territorial Administration and Infrastructure",
        address: "г. Ереван, пл. Республики, Дом Правительства 3",
        website: "mt.gov.am"
      },
      {
        id: "ministry_economy",
        name_hy: "\u0540\u0540 \u0537\u056F\u0578\u0576\u0578\u0574\u056B\u056F\u0561\u0575\u056B \u0576\u0561\u056D\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Министерство экономики",
        name_en: "Ministry of Economy",
        address: "г. Ереван, ул. М. Мкртчяна, 5",
        phones: ["010 526134"],
        website: "mineconomy.am"
      },
      {
        id: "ministry_education",
        name_hy: "\u0540\u0540 \u053F\u0580\u0569\u0578\u0582\u0569\u0575\u0561\u0576, \u0563\u056B\u057F\u0578\u0582\u0569\u0575\u0561\u0576, \u0574\u0577\u0561\u056F\u0578\u0582\u0575\u0569\u056B \u0587 \u057D\u057A\u0578\u0580\u057F\u056B \u0576\u0561\u056D\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Министерство образования, науки, культуры и спорта",
        name_en: "Ministry of Education, Science, Culture and Sports",
        address: "г. Ереван, пл. Республики, Дом Правительства 3",
        phones: ["010 526602"],
        website: "edu.am"
      },
      {
        id: "ministry_health",
        name_hy: "\u0540\u0540 \u0531\u057C\u0578\u0572\u057B\u0561\u057A\u0561\u0570\u0578\u0582\u0569\u0575\u0561\u0576 \u0576\u0561\u056D\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Министерство здравоохранения",
        name_en: "Ministry of Health",
        address: "г. Ереван, пл. Республики, Дом Правительства 3",
        phones: ["010 582413"],
        website: "moh.am"
      },
      {
        id: "ministry_transport",
        name_hy: "\u0540\u0540 \u0532\u0561\u0580\u0571\u0580 \u057F\u0565\u056D\u0576\u0578\u056C\u0578\u0563\u056B\u0561\u056F\u0561\u0576 \u0561\u0580\u0564\u0575\u0578\u0582\u0576\u0561\u0562\u0565\u0580\u0578\u0582\u0569\u0575\u0561\u0576 \u0576\u0561\u056D\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Министерство высокотехнологичной промышленности",
        name_en: "Ministry of High-Tech Industry",
        address: "г. Ереван, ул. Налбандяна, 28",
        phones: ["010 590001"],
        website: "mtc.am"
      },
      {
        id: "ministry_emergency",
        name_hy: "\u0540\u0540 \u0531\u0580\u057F\u0561\u056F\u0561\u0580\u0563 \u056B\u0580\u0561\u057E\u056B\u0573\u0561\u056F\u0576\u0565\u0580\u056B \u0576\u0561\u056D\u0561\u0580\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Министерство по чрезвычайным ситуациям",
        name_en: "Ministry of Emergency Situations",
        address: "г. Ереван, Давиташен 4-й мкр., ул. А. Микояна, 109/8",
        phones: ["010 362015"],
        website: "mes.am"
      }
    ]
  }
];

export interface FlatGovernmentBody {
  id: string;
  categoryId: string;
  name_hy: string;
  name_ru: string;
  name_en: string;
  fullName_hy: string;
  fullName_ru: string;
  fullName_en: string;
  address?: string;
  phones?: string[];
  website?: string;
  email?: string;
}

export function getFlatGovernmentList(): FlatGovernmentBody[] {
  const result: FlatGovernmentBody[] = [];
  
  for (const category of ARMENIAN_GOVERNMENT) {
    for (const body of category.bodies) {
      result.push({
        id: body.id,
        categoryId: category.id,
        name_hy: body.name_hy,
        name_ru: body.name_ru,
        name_en: body.name_en,
        fullName_hy: body.name_hy,
        fullName_ru: body.name_ru,
        fullName_en: body.name_en,
        address: body.address,
        phones: body.phones,
        website: body.website,
        email: body.email
      });
    }
  }
  
  return result;
}

export function getGovernmentCategoryName(category: GovernmentCategory, language: string): string {
  switch (language) {
    case 'hy': return category.name_hy;
    case 'en': return category.name_en;
    default: return category.name_ru;
  }
}
