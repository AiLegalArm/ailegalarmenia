// Справочник органов предварительного расследования Республики Армения

export interface InvestigativeBody {
  id: string;
  name_hy: string;
  name_ru: string;
  name_en: string;
  address?: string;
  phones?: string[];
  website?: string;
  email?: string;
}

export interface InvestigativeCategory {
  id: string;
  name_hy: string;
  name_ru: string;
  name_en: string;
  bodies: InvestigativeBody[];
}

export const ARMENIAN_INVESTIGATIVE_BODIES: InvestigativeCategory[] = [
  {
    id: "investigative_committee",
    name_hy: "\u0540\u0540 \u0554\u0576\u0576\u0579\u0561\u056F\u0561\u0576 \u056F\u0578\u0574\u056B\u057F\u0565",
    name_ru: "Следственный комитет РА",
    name_en: "Investigative Committee of RA",
    bodies: [
      {
        id: "ic_central",
        name_hy: "\u0540\u0540 \u0554\u053F \u056F\u0565\u0576\u057F\u0580\u0578\u0576\u0561\u056F\u0561\u0576 \u0561\u057A\u0561\u0580\u0561\u057F",
        name_ru: "Центральный аппарат СК РА",
        name_en: "Central Office of IC RA",
        address: "г. Ереван, ул. Мамиконянц, 46/5",
        phones: ["012 515424"],
        website: "investigative.am",
        email: "press@investigative.am"
      },
      {
        id: "ic_arabkir",
        name_hy: "\u0531\u0580\u0561\u0562\u056F\u056B\u0580\u056B \u0584\u0576\u0576\u0579\u0561\u056F\u0561\u0576 \u057E\u0561\u0580\u0579\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Арабкирское следственное управление",
        name_en: "Arabkir Investigation Department",
        address: "г. Ереван, пр. Комитаса, 51а",
        phones: ["012 515760"],
        email: "arabkir@investigative.am"
      },
      {
        id: "ic_davtashen",
        name_hy: "\u0534\u0561\u057E\u0569\u0561\u0577\u0565\u0576\u056B \u0584\u0576\u0576\u0579\u0561\u056F\u0561\u0576 \u057E\u0561\u0580\u0579\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Давташенское следственное управление",
        name_en: "Davtashen Investigation Department",
        address: "г. Ереван, ул. Дэхатан, 3"
      },
      {
        id: "ic_military_main",
        name_hy: "\u0533\u056C\u056D\u0561\u057E\u0578\u0580 \u0566\u056B\u0576\u057E\u0578\u0580\u0561\u056F\u0561\u0576 \u0584\u0576\u0576\u0579\u0561\u056F\u0561\u0576 \u057E\u0561\u0580\u0579\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Главное военное следственное управление",
        name_en: "Main Military Investigation Department",
        address: "г. Ереван, ул. Бабаян, 4",
        phones: ["012 515776"],
        email: "zqgv@investigative.am"
      },
      {
        id: "ic_military_yerevan",
        name_hy: "\u0535\u0580\u0587\u0561\u0576\u056B \u056F\u0561\u0575\u0561\u0566\u0578\u0580\u0561\u0575\u056B\u0576 \u0562\u0561\u056A\u056B\u0576",
        name_ru: "Гарнизонный отдел Еревана",
        name_en: "Yerevan Garrison Department",
        address: "г. Ереван, ул. Бабаян, 6",
        phones: ["012 515729"],
        email: "zqgv@investigative.am"
      }
    ]
  },
  {
    id: "anticorruption_committee",
    name_hy: "\u0540\u0540 \u053F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0561\u0575\u056B \u0564\u0565\u0574 \u057A\u0561\u0575\u0584\u0561\u0580\u056B \u056F\u0578\u0574\u056B\u057F\u0565",
    name_ru: "Антикоррупционный комитет РА",
    name_en: "Anti-Corruption Committee of RA",
    bodies: [
      {
        id: "acc_central",
        name_hy: "\u0540\u0540 \u053F\u0548\u0552\u053F \u056F\u0565\u0576\u057F\u0580\u0578\u0576\u0561\u056F\u0561\u0576 \u0561\u057A\u0561\u0580\u0561\u057F",
        name_ru: "Центральный аппарат АКК РА",
        name_en: "Central Office of ACC RA",
        address: "г. Ереван, ул. Московян, 1 (Кентрон)",
        phones: ["011 900035"],
        website: "anticorruption.am"
      },
      {
        id: "acc_arabkir",
        name_hy: "\u053F\u0548\u0552\u053F \u0531\u0580\u0561\u0562\u056F\u056B\u0580\u056B \u0562\u0561\u056A\u056B\u0576",
        name_ru: "Арабкирский отдел АКК",
        name_en: "Arabkir Department of ACC",
        address: "г. Ереван, ул. Вагарша Вагаршяна, 13а",
        website: "anticorruption.am"
      }
    ]
  },
  {
    id: "police",
    name_hy: "\u0540\u0540 \u0548\u057D\u057F\u056B\u056F\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    name_ru: "Полиция МВД РА",
    name_en: "Police of MIA RA",
    bodies: [
      {
        id: "police_central",
        name_hy: "\u0548\u057D\u057F\u056B\u056F\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u056F\u0565\u0576\u057F\u0580\u0578\u0576\u0561\u056F\u0561\u0576 \u057E\u0561\u0580\u0579\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Центральное управление полиции",
        name_en: "Central Police Department",
        address: "г. Ереван, ул. Налбандяна, 130",
        phones: ["010 590626"],
        website: "police.am",
        email: "press@police.am"
      }
    ]
  },
  {
    id: "state_services",
    name_hy: "\u054A\u0565\u057F\u0561\u056F\u0561\u0576 \u056E\u0561\u057C\u0561\u0575\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580",
    name_ru: "Государственные службы",
    name_en: "State Services",
    bodies: [
      {
        id: "tax_service",
        name_hy: "\u054A\u0565\u057F\u0561\u056F\u0561\u0576 \u0565\u056F\u0561\u0574\u0578\u0582\u057F\u0576\u0565\u0580\u056B \u056F\u0578\u0574\u056B\u057F\u0565",
        name_ru: "Комитет государственных доходов (КГД)",
        name_en: "State Revenue Committee",
        address: "г. Ереван, ул. Комитаса, 18/2",
        phones: ["010 548000"],
        website: "taxservice.am"
      },
      {
        id: "cadastre",
        name_hy: "\u053F\u0561\u0564\u0561\u057D\u057F\u0580\u056B \u056F\u0578\u0574\u056B\u057F\u0565",
        name_ru: "Кадастровый комитет",
        name_en: "Cadastre Committee",
        address: "г. Ереван, пр. Аршакуняц, 7",
        phones: ["060 474110"],
        website: "cadastre.am"
      },
      {
        id: "migration_service",
        name_hy: "\u0544\u056B\u0563\u0580\u0561\u0581\u056B\u0578\u0576 \u056E\u0561\u057C\u0561\u0575\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Миграционная служба",
        name_en: "Migration Service",
        address: "г. Ереван, ул. А. Мясникяна, 14/1",
        phones: ["060 275000"],
        website: "migration.gov.am"
      },
      {
        id: "enforcement_service",
        name_hy: "\u0540\u0561\u0580\u056F\u0561\u0564\u056B\u0580 \u056F\u0561\u057F\u0561\u0580\u0574\u0561\u0576 \u056E\u0561\u057C\u0561\u0575\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Служба принудительного исполнения",
        name_en: "Enforcement Service",
        address: "г. Ереван, ул. Алабяна, 41а",
        phones: ["010 8819"],
        website: "ces.am"
      }
    ]
  }
];

export interface FlatInvestigativeBody {
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

export function getFlatInvestigativeBodyList(): FlatInvestigativeBody[] {
  const result: FlatInvestigativeBody[] = [];
  
  for (const category of ARMENIAN_INVESTIGATIVE_BODIES) {
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

export function getInvestigativeCategoryName(category: InvestigativeCategory, language: string): string {
  switch (language) {
    case 'hy': return category.name_hy;
    case 'en': return category.name_en;
    default: return category.name_ru;
  }
}
