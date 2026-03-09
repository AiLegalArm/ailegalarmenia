// Справочник комитетов, служб и других органов

export interface CommitteeService {
  id: string;
  name_hy: string;
  name_ru: string;
  name_en: string;
  address?: string;
  phones?: string[];
  website?: string;
  email?: string;
}

export interface CommitteeCategory {
  id: string;
  name_hy: string;
  name_ru: string;
  name_en: string;
  bodies: CommitteeService[];
}

export const ARMENIAN_COMMITTEES_SERVICES: CommitteeCategory[] = [
  {
    id: "committees_services",
    name_hy: "\u053F\u0578\u0574\u056B\u057F\u0565\u0576\u0565\u0580 \u0587 \u056E\u0561\u057C\u0561\u0575\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580",
    name_ru: "Комитеты и службы",
    name_en: "Committees and Services",
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
        name_en: "Compulsory Enforcement Service",
        address: "г. Ереван, ул. Алабяна, 41а",
        phones: ["010 8819"],
        website: "ces.am"
      }
    ]
  },
  {
    id: "independent_bodies",
    name_hy: "\u0531\u0576\u056F\u0561\u056D \u0574\u0561\u0580\u0574\u056B\u0576\u0576\u0565\u0580",
    name_ru: "Независимые органы",
    name_en: "Independent Bodies",
    bodies: [
      {
        id: "ombudsman",
        name_hy: "\u0544\u0561\u0580\u0564\u0578\u0582 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u057A\u0561\u0577\u057F\u057A\u0561\u0576",
        name_ru: "Защитник прав человека (Омбудсмен)",
        name_en: "Human Rights Defender (Ombudsman)",
        address: "г. Ереван, ул. Пушкина, 56а",
        website: "ombuds.am",
        email: "ombuds@ombuds.am"
      },
      {
        id: "cec",
        name_hy: "\u053F\u0565\u0576\u057F\u0580\u0578\u0576\u0561\u056F\u0561\u0576 \u0568\u0576\u057F\u0580\u0561\u056F\u0561\u0576 \u0570\u0561\u0576\u0571\u0576\u0561\u056A\u0578\u0572\u0578\u057E",
        name_ru: "Центральная избирательная комиссия (ЦИК)",
        name_en: "Central Electoral Commission",
        address: "г. Ереван, ул. Аршакуняц, 1",
        phones: ["010 594500"],
        website: "cec.am"
      }
    ]
  },
  {
    id: "registration_bodies",
    name_hy: "\u0533\u0580\u0561\u0576\u0581\u0574\u0561\u0576 \u0574\u0561\u0580\u0574\u056B\u0576\u0576\u0565\u0580",
    name_ru: "Регистрационные органы",
    name_en: "Registration Bodies",
    bodies: [
      {
        id: "zags_kentron",
        name_hy: "\u053F\u0565\u0576\u057F\u0580\u0578\u0576\u056B \u0554\u0540\u053F \u0563\u0580\u0561\u057D\u0565\u0576\u0575\u0561\u056F",
        name_ru: "ЗАГС Кентрон",
        name_en: "Civil Registry Office Kentron",
        address: "г. Ереван, ул. Анрапетутяна, 6/1"
      },
      {
        id: "legal_entities_registry",
        name_hy: "\u053B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u0561\u0576\u0571\u0561\u0576\u0581 \u057A\u0565\u057F\u0561\u056F\u0561\u0576 \u057C\u0565\u0563\u056B\u057D\u057F\u0580",
        name_ru: "Реестр юридических лиц (Минюст)",
        name_en: "Legal Entities Registry (Ministry of Justice)",
        address: "г. Ереван, ул. Вазгена Саргсяна, 3/8",
        website: "justice.am"
      },
      {
        id: "notary_chamber",
        name_hy: "\u0546\u0578\u057F\u0561\u0580\u0561\u056F\u0561\u0576 \u057A\u0561\u056C\u0561\u057F",
        name_ru: "Нотариальная палата",
        name_en: "Notary Chamber",
        website: "justice.am"
      }
    ]
  },
  {
    id: "international_bodies",
    name_hy: "\u0544\u056B\u057B\u0561\u0566\u0563\u0561\u0575\u056B\u0576 \u0574\u0561\u0580\u0574\u056B\u0576\u0576\u0565\u0580",
    name_ru: "Международные органы",
    name_en: "International Bodies",
    bodies: [
      {
        id: "echr",
        name_hy: "\u0544\u0561\u0580\u0564\u0578\u0582 \u056B\u0580\u0561\u057E\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056B \u0565\u057E\u0580\u0578\u057A\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576 (\u0544\u053B\u0535\u0534)",
        name_ru: "Европейский суд по правам человека (ЕСПЧ)",
        name_en: "European Court of Human Rights (ECHR)",
        address: "ул. Ке д'Орсе, 1, 67075 Страсбург, Франция",
        website: "echr.coe.int"
      },
      {
        id: "eaeu",
        name_hy: "\u0535\u057E\u0580\u0561\u057D\u056B\u0561\u056F\u0561\u0576 \u057F\u0576\u057F\u0565\u057D\u0561\u056F\u0561\u0576 \u0570\u0561\u0576\u0571\u0576\u0561\u056A\u0578\u0572\u0578\u057E",
        name_ru: "Евразийская экономическая комиссия (ЕЭК)",
        name_en: "Eurasian Economic Commission (EEC)",
        address: "пр. Мира, 82, Москва, Россия",
        website: "eaeunion.org"
      },
      {
        id: "un_committees",
        name_hy: "\u0544\u053F\u0531 \u056F\u0578\u0574\u056B\u057F\u0565\u0576\u0565\u0580",
        name_ru: "Комитеты ООН",
        name_en: "UN Committees",
        address: "Дворец Наций, 1211 Женева, Швейцария",
        website: "ohchr.org"
      }
    ]
  }
];

export interface FlatCommitteeService {
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

export function getFlatCommitteeServiceList(): FlatCommitteeService[] {
  const result: FlatCommitteeService[] = [];
  
  for (const category of ARMENIAN_COMMITTEES_SERVICES) {
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

export function getCommitteeCategoryName(category: CommitteeCategory, language: string): string {
  switch (language) {
    case 'hy': return category.name_hy;
    case 'en': return category.name_en;
    default: return category.name_ru;
  }
}
