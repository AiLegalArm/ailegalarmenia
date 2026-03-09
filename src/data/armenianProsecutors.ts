// Справочник прокуратур Республики Армения

export interface ProsecutorOffice {
  id: string;
  name_hy: string;
  name_ru: string;
  name_en: string;
  address?: string;
  phones?: string[];
  email?: string;
}

export interface ProsecutorCategory {
  id: string;
  name_hy: string;
  name_ru: string;
  name_en: string;
  offices: ProsecutorOffice[];
}

export const ARMENIAN_PROSECUTORS: ProsecutorCategory[] = [
  {
    id: "general",
    name_hy: "\u0540\u0540 \u0533\u056C\u056D\u0561\u057E\u0578\u0580 \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    name_ru: "Генеральная прокуратура",
    name_en: "General Prosecutor's Office",
    offices: [
      {
        id: "general_prosecutor",
        name_hy: "\u0540\u0540 \u0533\u056C\u056D\u0561\u057E\u0578\u0580 \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Генеральная прокуратура РА",
        name_en: "General Prosecutor's Office of RA",
        address: "г. Ереван, 0010, ул. В. Саргсяна, 5",
        phones: ["+374 (10) 511-650"],
        email: "info@prosecutor.am"
      }
    ]
  },
  {
    id: "regional",
    name_hy: "\u0544\u0561\u0580\u0566\u0561\u0575\u056B\u0576 \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580",
    name_ru: "Прокуратуры марзов",
    name_en: "Regional Prosecutor's Offices",
    offices: [
      {
        id: "aragatsotn_prosecutor",
        name_hy: "\u0531\u0580\u0561\u0563\u0561\u056E\u0578\u057F\u0576\u056B \u0574\u0561\u0580\u0566\u056B \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Арагацотнской области",
        name_en: "Aragatsotn Region Prosecutor's Office",
        address: "г. Аштарак, пл. Н. Аштаракеци, 7",
        phones: ["010 311-248"],
        email: "aragatsotn@prosecutor.am"
      },
      {
        id: "ararat_prosecutor",
        name_hy: "\u0531\u0580\u0561\u0580\u0561\u057F\u056B \u0574\u0561\u0580\u0566\u056B \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Араратской области",
        name_en: "Ararat Region Prosecutor's Office",
        address: "г. Арташат, ул. Маркса, 2",
        phones: ["010 311-261"],
        email: "ararat@prosecutor.am"
      },
      {
        id: "armavir_prosecutor",
        name_hy: "\u0531\u0580\u0574\u0561\u057E\u056B\u0580\u056B \u0574\u0561\u0580\u0566\u056B \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Армавирской области",
        name_en: "Armavir Region Prosecutor's Office",
        address: "г. Армавир, ул. Шаумяна, 48",
        phones: ["010 311-279"],
        email: "armavir@prosecutor.am"
      },
      {
        id: "gegharkunik_prosecutor",
        name_hy: "\u0533\u0565\u0572\u0561\u0580\u0584\u0578\u0582\u0576\u056B\u0584\u056B \u0574\u0561\u0580\u0566\u056B \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Гегаркуникской области",
        name_en: "Gegharkunik Region Prosecutor's Office",
        address: "г. Гавар, ул. Г. Акопяна, 21",
        phones: ["010 311-292"],
        email: "gegarquniq@prosecutor.am"
      },
      {
        id: "kotayk_prosecutor",
        name_hy: "\u053F\u0578\u057F\u0561\u0575\u0584\u056B \u0574\u0561\u0580\u0566\u056B \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Котайкской области",
        name_en: "Kotayk Region Prosecutor's Office",
        address: "г. Раздан, кв. Кентрон 2, 2301",
        phones: ["010 511-967"],
        email: "kotayq@prosecutor.am"
      },
      {
        id: "lori_prosecutor",
        name_hy: "\u053C\u0578\u057C\u0578\u0582 \u0574\u0561\u0580\u0566\u056B \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Лорийской области",
        name_en: "Lori Region Prosecutor's Office",
        address: "г. Ванадзор, ул. Мясникяна, 13",
        phones: ["010 311-327"],
        email: "lori@prosecutor.am"
      },
      {
        id: "shirak_prosecutor",
        name_hy: "\u0547\u056B\u0580\u0561\u056F\u056B \u0574\u0561\u0580\u0566\u056B \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Ширакской области",
        name_en: "Shirak Region Prosecutor's Office",
        address: "г. Гюмри, пр. Ахтанаки, 6",
        phones: ["010 511-996"],
        email: "shirak@prosecutor.am"
      },
      {
        id: "syunik_prosecutor",
        name_hy: "\u054D\u0575\u0578\u0582\u0576\u056B\u0584\u056B \u0574\u0561\u0580\u0566\u056B \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Сюникской области",
        name_en: "Syunik Region Prosecutor's Office",
        address: "г. Капан, ул. Мелика-Степаняна, 2",
        phones: ["010 311-342"],
        email: "syuniq@prosecutor.am"
      },
      {
        id: "tavush_prosecutor",
        name_hy: "\u054F\u0561\u057E\u0578\u0582\u0577\u056B \u0574\u0561\u0580\u0566\u056B \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Тавушской области",
        name_en: "Tavush Region Prosecutor's Office",
        address: "г. Иджеван, ул. Иджеванян, 1",
        phones: ["010 511-663"],
        email: "tavush@prosecutor.am"
      },
      {
        id: "vayots_dzor_prosecutor",
        name_hy: "\u054E\u0561\u0575\u0578\u0581 \u0541\u0578\u0580\u056B \u0574\u0561\u0580\u0566\u056B \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Вайоцдзорской области",
        name_en: "Vayots Dzor Region Prosecutor's Office",
        address: "г. Ехегнадзор, ул. З. Андраника, 4",
        phones: ["010 311-306"],
        email: "vayotsdzor@prosecutor.am"
      }
    ]
  },
  {
    id: "yerevan",
    name_hy: "\u0535\u0580\u0587\u0561\u0576\u056B \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580",
    name_ru: "Прокуратуры Еревана",
    name_en: "Yerevan Prosecutor's Offices",
    offices: [
      {
        id: "kentron_nork_marash",
        name_hy: "\u053F\u0565\u0576\u057F\u0580\u0578\u0576 \u0587 \u0546\u0578\u0580\u0584-\u0544\u0561\u0580\u0561\u0577 \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Кентрона и Норк-Мараша",
        name_en: "Kentron and Nork-Marash Prosecutor's Office",
        address: "г. Ереван, пр. Саят-Нова, 2",
        phones: ["010 511-445"],
        email: "kentron@prosecutor.am"
      },
      {
        id: "shengavit",
        name_hy: "\u0547\u0565\u0576\u0563\u0561\u057E\u056B\u057F\u056B \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Шенгавита",
        name_en: "Shengavit Prosecutor's Office",
        address: "г. Ереван, ул. Г. Нжде, 27",
        phones: ["010 511-481"],
        email: "shengavit@prosecutor.am"
      },
      {
        id: "avan_nor_nork",
        name_hy: "\u0531\u057E\u0561\u0576-\u0546\u0578\u0580 \u0546\u0578\u0580\u0584 \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Авана-Нор Норка",
        name_en: "Avan-Nor Nork Prosecutor's Office",
        address: "г. Ереван, ул. Боряна, 1а",
        phones: ["010 511-846"],
        email: "avan-nornork@prosecutor.am"
      },
      {
        id: "malatia_sebastia",
        name_hy: "\u0544\u0561\u056C\u0561\u0569\u056B\u0561-\u054D\u0565\u0562\u0561\u057D\u057F\u056B\u0561 \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Малатии-Себастии",
        name_en: "Malatia-Sebastia Prosecutor's Office",
        address: "г. Ереван, ул. Себастия, 37",
        phones: ["010 511-456"],
        email: "malatia-sebastia@prosecutor.am"
      },
      {
        id: "ajapnyak_davtashen",
        name_hy: "\u0531\u0573\u0561\u057A\u0576\u0575\u0561\u056F-\u0534\u0561\u057E\u0569\u0561\u0577\u0565\u0576 \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Аджапняка-Давташена",
        name_en: "Ajapnyak-Davtashen Prosecutor's Office",
        address: "г. Ереван, ул. Ленинградян, 4а",
        phones: ["010 511-490"],
        email: "ajapnyak-davtashen@prosecutor.am"
      },
      {
        id: "arabkir_kanaker_zeytun",
        name_hy: "\u0531\u0580\u0561\u0562\u056F\u056B\u0580-\u0554\u0561\u0576\u0561\u0584\u0565\u0580-\u0536\u0565\u0575\u0569\u0578\u0582\u0576 \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Арабкира-Канакера-Зейтуна",
        name_en: "Arabkir-Kanaker-Zeytun Prosecutor's Office",
        address: "г. Ереван, ул. Н. Заряна, 33а",
        phones: ["010 511-470"],
        email: "arabkir-qanaqer-zeytun@prosecutor.am"
      },
      {
        id: "erebuni_nubarashen",
        name_hy: "\u0537\u0580\u0565\u0562\u0578\u0582\u0576\u056B-\u0546\u0578\u0582\u0562\u0561\u0580\u0561\u0577\u0565\u0576 \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
        name_ru: "Прокуратура Эребуни-Нубарашена",
        name_en: "Erebuni-Nubarashen Prosecutor's Office",
        address: "г. Ереван, ул. М. Хоренаци, 162а",
        phones: ["010 511-497"],
        email: "erebuni-nubarashen@prosecutor.am"
      }
    ]
  },
  {
    id: "specialized",
    name_hy: "\u0544\u0561\u057D\u0576\u0561\u0563\u056B\u057F\u0561\u0581\u057E\u0561\u056E \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0576\u0565\u0580",
    name_ru: "Специализированные прокуратуры",
    name_en: "Specialized Prosecutor's Offices",
    offices: [
      {
        id: "military",
        name_hy: "\u0540\u0540 \u0536\u056B\u0576\u057E\u0578\u0580\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u056D\u0561\u0566\u0578\u0582\u0569\u0575\u0578\u0582\u0576 (\u056F\u0565\u0576\u057F\u0580\u0578\u0576\u0561\u056F\u0561\u0576)",
        name_ru: "Военная прокуратура РА (Центральная)",
        name_en: "Military Prosecutor's Office of RA (Central)",
        address: "г. Ереван, 0012, ул. Сундукяна, 66а",
        phones: ["010 511-682"],
        email: "zkd@prosecutor.am"
      }
    ]
  }
];

export interface FlatProsecutor {
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
  email?: string;
}

export function getFlatProsecutorList(): FlatProsecutor[] {
  const result: FlatProsecutor[] = [];
  
  for (const category of ARMENIAN_PROSECUTORS) {
    for (const office of category.offices) {
      result.push({
        id: office.id,
        categoryId: category.id,
        name_hy: office.name_hy,
        name_ru: office.name_ru,
        name_en: office.name_en,
        fullName_hy: office.name_hy,
        fullName_ru: office.name_ru,
        fullName_en: office.name_en,
        address: office.address,
        phones: office.phones,
        email: office.email
      });
    }
  }
  
  return result;
}

export function getProsecutorCategoryName(category: ProsecutorCategory, language: string): string {
  switch (language) {
    case 'hy': return category.name_hy;
    case 'en': return category.name_en;
    default: return category.name_ru;
  }
}
