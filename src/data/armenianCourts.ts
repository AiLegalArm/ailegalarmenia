// Справочник судов Республики Армения с адресами и телефонами
// \u0540\u0540 \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u0576\u0565\u0580\u056B \u057F\u0565\u0572\u0565\u056F\u0561\u057F\u0578\u0582, \u0570\u0561\u057D\u0581\u0565\u0576\u0565\u0580\u0578\u057E \u0587 \u0570\u0565\u057C\u0561\u056D\u0578\u057D\u0576\u0565\u0580\u0578\u057E

export interface CourtBranch {
  name_hy: string;
  name_ru: string;
  name_en: string;
  address?: string;
  phones?: string[];
}

export interface Court {
  id: string;
  name_hy: string;
  name_ru: string;
  name_en: string;
  address?: string;
  phones?: string[];
  branches?: CourtBranch[];
}

export interface CourtCategory {
  id: string;
  name_hy: string;
  name_ru: string;
  name_en: string;
  courts: Court[];
}

export const ARMENIAN_COURTS: CourtCategory[] = [
  {
    id: "international_courts",
    name_hy: "Միջազգային դատարաններ",
    name_ru: "Международные суды",
    name_en: "International Courts",
    courts: [
      {
        id: "echr",
        name_hy: "Մարդու իրավունքների եվրոպական դատարան (ՄԻԵԴ)",
        name_ru: "Европейский суд по правам человека (ЕСПЧ)",
        name_en: "European Court of Human Rights (ECHR)",
        address: "Allée des Droits de l'Homme, 67000 Strasbourg, France",
        phones: ["+33 3 88 41 20 18"],
      }
    ]
  },
  {
    id: "higher_courts",
    name_hy: "\u0532\u0561\u0580\u0571\u0580\u0561\u0563\u0578\u0582\u0575\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u0576\u0565\u0580",
    name_ru: "Высшие суды",
    name_en: "Higher Courts",
    courts: [
      {
        id: "cassation",
        name_hy: "\u054E\u0573\u057C\u0561\u0562\u0565\u056F \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Кассационный суд",
        name_en: "Court of Cassation",
        address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u054E\u0561\u0566\u0563\u0565\u0576 \u054D\u0561\u0580\u0563\u057D\u0575\u0561\u0576 5",
        phones: ["(+37410) 511-740"],
        branches: [
          {
            name_hy: "\u0554\u0580\u0565\u0561\u056F\u0561\u0576 \u0587 \u0570\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u0578\u0576 \u057A\u0561\u056C\u0561\u057F\u056B \u0563\u0580\u0561\u057D\u0565\u0576\u0575\u0561\u056F\u0576\u0565\u0580",
            name_ru: "Канцелярии уголовной и антикоррупционной палаты",
            name_en: "Criminal and Anti-Corruption Chamber Offices",
            phones: ["(+37410) 511-734", "(+37410) 511-764"]
          },
          {
            name_hy: "\u0554\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576 \u0587 \u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u057A\u0561\u056C\u0561\u057F\u056B \u0563\u0580\u0561\u057D\u0565\u0576\u0575\u0561\u056F",
            name_ru: "Канцелярия гражданской и административной палаты",
            name_en: "Civil and Administrative Chamber Office",
            phones: ["(+37410) 511-745", "(+37410) 511-735"]
          }
        ]
      }
    ]
  },
  {
    id: "appellate_courts",
    name_hy: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u0576\u0565\u0580",
    name_ru: "Апелляционные суды",
    name_en: "Appellate Courts",
    courts: [
      {
        id: "civil_appeal",
        name_hy: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Апелляционный гражданский суд",
        name_en: "Civil Court of Appeal",
        address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u0533. \u0546\u056A\u0564\u0565\u0570\u056B 23",
        phones: ["(+374 10) 49-48-11 (306, 307, 359)"]
      },
      {
        id: "criminal_appeal",
        name_hy: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0584\u0580\u0565\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Апелляционный уголовный суд",
        name_en: "Criminal Court of Appeal",
        address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u0533. \u0546\u056A\u0564\u0565\u0570\u056B 23",
        phones: ["+37410 49-48-03 (106, 153)"]
      },
      {
        id: "administrative_appeal",
        name_hy: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Апелляционный административный суд",
        name_en: "Administrative Court of Appeal",
        address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u0539\u0562\u056B\u056C\u056B\u057D\u0575\u0561\u0576 \u056D\u0573\u0578\u0582\u0572\u056B 3/9",
        phones: ["(+374 10) 20-11-95"]
      },
      {
        id: "anticorruption_appeal",
        name_hy: "\u054E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579 \u0570\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0578\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Апелляционный антикоррупционный суд",
        name_en: "Anti-Corruption Court of Appeal",
        address: "\u0531\u0580\u0561 \u054D\u0561\u0580\u0563\u057D\u0575\u0561\u0576 5/1",
        phones: ["(+37410) 51-21-00"]
      }
    ]
  },
  {
    id: "specialized_courts",
    name_hy: "\u0544\u0561\u057D\u0576\u0561\u0563\u056B\u057F\u0561\u0581\u057E\u0561\u056E \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u0576\u0565\u0580",
    name_ru: "Специализированные суды",
    name_en: "Specialized Courts",
    courts: [
      {
        id: "administrative",
        name_hy: "\u054E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Административный суд",
        name_en: "Administrative Court",
        address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u0533. \u0546\u056A\u0564\u0565\u0570\u056B 23",
        phones: ["(+37410) 44-71-21 (230)"],
        branches: [
          {
            name_hy: "\u0535\u0580\u0587\u0561\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Ереванская резиденция",
            name_en: "Yerevan Branch",
            address: "\u0533\u0561\u0580\u0565\u0563\u056B\u0576 \u0546\u056A\u0564\u0565\u0570\u056B 23",
            phones: ["(+37410) 44-84-08"]
          },
          {
            name_hy: "\u054D\u0587\u0561\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Севанская резиденция",
            name_en: "Sevan Branch",
            address: "\u0531\u0562\u0578\u057E\u0575\u0561\u0576 6/1",
            phones: ["(+374261) 2-01-49"]
          },
          {
            name_hy: "\u0533\u0575\u0578\u0582\u0574\u0580\u0578\u0582 \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Гюмрийская резиденция",
            name_en: "Gyumri Branch",
            address: "\u0531\u0576\u056F\u0561\u056D\u0578\u0582\u0569\u0575\u0561\u0576 \u0570\u0580\u0561\u057A. 7",
            phones: ["(+374312) 5-70-98"]
          },
          {
            name_hy: "\u054E\u0561\u0576\u0561\u0571\u0578\u0580\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Ванадзорская резиденция",
            name_en: "Vanadzor Branch",
            address: "\u0544\u056D\u056B\u0569\u0561\u0580 \u0533\u0578\u0577\u056B 6",
            phones: ["(+374322) 2-32-35"]
          },
          {
            name_hy: "\u0533\u0578\u0580\u056B\u057D\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Горисская резиденция",
            name_en: "Goris Branch",
            address: "\u0544\u0565\u056C\u056B\u0584 \u054D\u057F\u0565\u0583\u0561\u0576\u0575\u0561\u0576 3/2",
            phones: ["(+374285) 2-00-04"]
          }
        ]
      },
      {
        id: "bankruptcy",
        name_hy: "\u054D\u0576\u0561\u0576\u056F\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Суд по делам о банкротстве",
        name_en: "Bankruptcy Court",
        address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u0555\u057F\u0575\u0561\u0576 \u0583\u0578\u0572\u0578\u0581 53/2",
        phones: ["(+374 10) 74-29-10", "(+374 10) 74-59-50"],
        branches: [
          {
            name_hy: "\u0535\u0580\u0587\u0561\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Ереванская резиденция",
            name_en: "Yerevan Branch",
            address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u0555\u057F\u0575\u0561\u0576 53/2",
            phones: ["(+374 10) 74-29-10", "(+374 10) 74-59-50"]
          },
          {
            name_hy: "\u0533\u0575\u0578\u0582\u0574\u0580\u0578\u0582 \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Гюмрийская резиденция",
            name_en: "Gyumri Branch",
            address: "\u0584. \u0533\u0575\u0578\u0582\u0574\u0580\u056B, \u0531\u0576\u056F\u0561\u056D\u0578\u0582\u0569\u0575\u0561\u0576 \u0570\u0580\u0561\u057A\u0561\u0580\u0561\u056F 7"
          }
        ]
      },
      {
        id: "anticorruption",
        name_hy: "\u0540\u0561\u056F\u0561\u056F\u0578\u057C\u0578\u0582\u057A\u0581\u056B\u0578\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Антикоррупционный суд",
        name_en: "Anti-Corruption Court",
        address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u0539\u0562\u056B\u056C\u056B\u057D\u0575\u0561\u0576 \u056D\u0573\u0578\u0582\u0572\u056B 3/9",
        branches: [
          {
            name_hy: "\u0535\u0580\u0587\u0561\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Ереванская резиденция",
            name_en: "Yerevan Branch",
            address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u0539\u0562\u056B\u056C\u056B\u057D\u0575\u0561\u0576 \u056D\u0573\u0578\u0582\u0572\u056B 3/9"
          },
          {
            name_hy: "\u0543\u0561\u0574\u0562\u0561\u0580\u0561\u056F\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Чамбаракская резиденция",
            name_en: "Chambarak Branch"
          },
          {
            name_hy: "\u0544\u0561\u0580\u0561\u056C\u056B\u056F\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Мараликская резиденция",
            name_en: "Maralik Branch"
          },
          {
            name_hy: "\u054E\u0561\u0575\u0584\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Вайкская резиденция",
            name_en: "Vayk Branch"
          }
        ]
      }
    ]
  },
  {
    id: "yerevan_courts",
    name_hy: "\u0535\u0580\u0587\u0561\u0576\u056B \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u0576\u0565\u0580",
    name_ru: "Суды г. Еревана",
    name_en: "Yerevan Courts",
    courts: [
      {
        id: "yerevan_criminal",
        name_hy: "\u0535\u0580\u0587\u0561\u0576 \u0584\u0561\u0572\u0561\u0584\u056B \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056B\u0580\u0561\u057E\u0561\u057D\u0578\u0582\u0569\u0575\u0561\u0576 \u0584\u0580\u0565\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Суд общей юрисдикции г. Еревана (уголовные дела)",
        name_en: "Yerevan Court of General Jurisdiction (Criminal)",
        branches: [
          {
            name_hy: "\u053F\u0565\u0576\u057F\u0580\u0578\u0576 \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Центральная резиденция",
            name_en: "Central Branch",
            address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u054F\u056B\u0563\u0580\u0561\u0576 \u0544\u0565\u056E\u056B 23/1",
            phones: ["(+374 10) 54-79-15", "(+374 10) 54-79-17"]
          },
          {
            name_hy: "\u0531\u057E\u0561\u0576 \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Аван",
            name_en: "Avan Branch",
            address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u0533\u0575\u0578\u0582\u056C\u056B\u0584\u0587\u056D\u057E\u0575\u0561\u0576 20",
            phones: ["(+374 10) 64-94-65"]
          },
          {
            name_hy: "\u0547\u0565\u0576\u0563\u0561\u057E\u056B\u0569 \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Шенгавит",
            name_en: "Shengavit Branch",
            address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u0531\u0580\u0577\u0561\u056F\u0578\u0582\u0576\u0575\u0561\u0581 \u057A\u0578\u0572\u0578\u057F\u0561 24/1",
            phones: ["(+374 10) 44-14-30"]
          },
          {
            name_hy: "\u0531\u057B\u0561\u0583\u0576\u0575\u0561\u056F-1 \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Аджапняк-1",
            name_en: "Ajapnyak-1 Branch",
            address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u0546\u0561\u0566\u0561\u0580\u0562\u0565\u056F\u0575\u0561\u0576 \u0569\u0561\u0572\u0561\u0574\u0561\u057D 40",
            phones: ["(+374 10) 33-95-96 (200)"]
          }
        ]
      },
      {
        id: "yerevan_civil",
        name_hy: "\u0535\u0580\u0587\u0561\u0576 \u0584\u0561\u0572\u0561\u0584\u056B \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056B\u0580\u0561\u057E\u0561\u057D\u0578\u0582\u0569\u0575\u0561\u0576 \u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Суд общей юрисдикции г. Еревана (гражданские дела)",
        name_en: "Yerevan Court of General Jurisdiction (Civil)",
        branches: [
          {
            name_hy: "\u0537\u0580\u0565\u0562\u0578\u0582\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Эребуни",
            name_en: "Erebuni Branch",
            address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u0544\u0578\u057E\u057D\u0565\u057D \u053D\u0578\u0580\u0565\u0576\u0561\u0581\u056B 162\u0561",
            phones: ["(+374 10) 57-75-84"]
          },
          {
            name_hy: "\u0531\u0580\u0561\u0562\u056F\u056B\u0580 \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Арабкир",
            name_en: "Arabkir Branch",
            address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u0540\u0580\u0561\u0579\u0575\u0561 \u0546\u0565\u0580\u057D\u056B\u057D\u0575\u0561\u0576 10",
            phones: ["(+374 10) 24-08-31"]
          },
          {
            name_hy: "\u0531\u057B\u0561\u0583\u0576\u0575\u0561\u056F-2 \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Аджапняк-2",
            name_en: "Ajapnyak-2 Branch",
            address: "\u0584. \u0535\u0580\u0587\u0561\u0576, \u0540\u0561\u056C\u0561\u0562\u0575\u0561\u0576 41\u0561",
            phones: ["(+374 10) 511-813 (445, 443)"]
          }
        ]
      }
    ]
  },
  {
    id: "regional_courts",
    name_hy: "\u0544\u0561\u0580\u0566\u0561\u0575\u056B\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576\u0576\u0565\u0580",
    name_ru: "Областные суды",
    name_en: "Regional Courts",
    courts: [
      {
        id: "aragatsotn",
        name_hy: "\u0531\u0580\u0561\u0563\u0561\u056E\u0578\u057F\u0576\u056B \u0574\u0561\u0580\u0566\u056B \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056B\u0580\u0561\u057E\u0561\u057D\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Суд общей юрисдикции Арагацотнской области",
        name_en: "Aragatsotn Region Court of General Jurisdiction",
        branches: [
          {
            name_hy: "\u0531\u0577\u057F\u0561\u0580\u0561\u056F\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Аштарак",
            name_en: "Ashtarak Branch",
            address: "\u0584. \u0531\u0577\u057F\u0561\u0580\u0561\u056F, \u0537\u057B\u0574\u056B\u0561\u056E\u0576\u056B \u056D\u0573\u0578\u0582\u0572\u056B 65",
            phones: ["(0232) 3-21-31"]
          },
          {
            name_hy: "\u0531\u057A\u0561\u0580\u0561\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Апаран",
            name_en: "Aparan Branch",
            address: "\u0584. \u0531\u057A\u0561\u0580\u0561\u0576, \u0533\u0561\u0575\u056B 25",
            phones: ["(0252) 2-43-81"]
          }
        ]
      },
      {
        id: "ararat_vayots_dzor",
        name_hy: "\u0531\u0580\u0561\u0580\u0561\u057F\u056B \u0587 \u054E\u0561\u0575\u0578\u0581 \u0571\u0578\u0580\u056B \u0574\u0561\u0580\u0566\u0565\u0580\u056B \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056B\u0580\u0561\u057E\u0561\u057D\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Суд общей юрисдикции Араратской и Вайоцдзорской областей",
        name_en: "Ararat and Vayots Dzor Regions Court of General Jurisdiction",
        branches: [
          {
            name_hy: "\u0531\u0580\u057F\u0561\u0577\u0561\u057F\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Арташат",
            name_en: "Artashat Branch",
            address: "\u0584. \u0531\u0580\u057F\u0561\u0577\u0561\u057F, \u0547\u0561\u0570\u0578\u0582\u0574\u0575\u0561\u0576 19",
            phones: ["(+374 235) 2-20-35"]
          },
          {
            name_hy: "\u0544\u0561\u057D\u056B\u057D\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Масис",
            name_en: "Masis Branch",
            address: "\u0584. \u0544\u0561\u057D\u056B\u057D, 3-\u0580\u0564 \u0569\u0561\u0572\u0561\u0574\u0561\u057D, \u0540\u0565\u0580\u0561\u0581\u0578\u0582 \u0583\u0578\u0572\u0578\u0581 26/31",
            phones: ["(+374 236) 4-54-50"]
          },
          {
            name_hy: "\u054E\u0561\u0575\u0584\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Вайк",
            name_en: "Vayk Branch",
            address: "\u0584. \u054E\u0561\u0575\u0584, \u054B\u0565\u0580\u0574\u0578\u0582\u056F\u056B \u056D\u0573\u0578\u0582\u0572\u056B 8",
            phones: ["(+374 282) 2-32-24"]
          }
        ]
      },
      {
        id: "armavir",
        name_hy: "\u0531\u0580\u0574\u0561\u057E\u056B\u0580\u056B \u0574\u0561\u0580\u0566\u056B \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056B\u0580\u0561\u057E\u0561\u057D\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Суд общей юрисдикции Армавирской области",
        name_en: "Armavir Region Court of General Jurisdiction",
        branches: [
          {
            name_hy: "\u0531\u0580\u0574\u0561\u057E\u056B\u0580\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Армавир",
            name_en: "Armavir Branch",
            address: "\u0584. \u0531\u0580\u0574\u0561\u057E\u056B\u0580, \u0540\u0561\u0576\u0580\u0561\u057A\u0565\u057F\u0578\u0582\u0569\u0575\u0561\u0576 41",
            phones: ["(+374 237) 2-22-65"]
          },
          {
            name_hy: "\u0537\u057B\u0574\u056B\u0561\u056E\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Эчмиадзин",
            name_en: "Ejmiatsin Branch",
            address: "\u0584. \u0537\u057B\u0574\u056B\u0561\u056E\u056B\u0576, \u053F\u0561\u0574\u0578\u0575\u056B 15",
            phones: ["(+374 231) 5-30-85"]
          }
        ]
      },
      {
        id: "gegharkunik",
        name_hy: "\u0533\u0565\u0572\u0561\u0580\u0584\u0578\u0582\u0576\u056B\u0584\u056B \u0574\u0561\u0580\u0566\u056B \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056B\u0580\u0561\u057E\u0561\u057D\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Суд общей юрисдикции Гегаркуникской области",
        name_en: "Gegharkunik Region Court of General Jurisdiction",
        branches: [
          {
            name_hy: "\u0533\u0561\u057E\u0561\u057C\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Гавар",
            name_en: "Gavar Branch",
            address: "\u0584. \u0533\u0561\u057E\u0561\u057C, \u054D\u0561\u0575\u0561\u0564\u0575\u0561\u0576 18",
            phones: ["(+374 264) 2-36-01", "(+374 264) 2-23-03"]
          },
          {
            name_hy: "\u054D\u0587\u0561\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Севан",
            name_en: "Sevan Branch",
            address: "\u054D\u0587\u0561\u0576, \u0531\u0562\u0578\u057E\u0575\u0561\u0576 6/1",
            phones: ["(+374 261) 2-37-39", "(+374 261) 2-31-42"]
          },
          {
            name_hy: "\u054E\u0561\u0580\u0564\u0565\u0576\u056B\u057D\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Варденис",
            name_en: "Vardenis Branch",
            address: "\u0584. \u054E\u0561\u0580\u0564\u0565\u0576\u056B\u057D, \u0531\u0566\u0563\u0561\u056C\u0564\u0575\u0561\u0576 2",
            phones: ["(+374 269) 2-27-62"]
          },
          {
            name_hy: "\u0543\u0561\u0574\u0562\u0561\u0580\u0561\u056F\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Чамбарак",
            name_en: "Chambarak Branch",
            address: "\u0584. \u0543\u0561\u0574\u0562\u0561\u0580\u0561\u056F, \u0533\u0561\u0580\u0565\u0563\u056B\u0576 \u0546\u056A\u0564\u0565\u0570\u056B 99/1",
            phones: ["(+374 265) 2-22-77"]
          }
        ]
      },
      {
        id: "lori",
        name_hy: "\u053C\u0578\u057C\u0578\u0582 \u0574\u0561\u0580\u0566\u056B \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056B\u0580\u0561\u057E\u0561\u057D\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Суд общей юрисдикции Лорийской области",
        name_en: "Lori Region Court of General Jurisdiction",
        branches: [
          {
            name_hy: "\u054E\u0561\u0576\u0561\u0571\u0578\u0580\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Ванадзор",
            name_en: "Vanadzor Branch",
            address: "\u0584. \u054E\u0561\u0576\u0561\u0571\u0578\u0580, \u0544\u056D\u056B\u0569\u0561\u0580 \u0533\u0578\u0577\u056B 6",
            phones: ["(+374 322) 2-40-31"]
          },
          {
            name_hy: "\u0531\u056C\u0561\u057E\u0565\u0580\u0564\u0578\u0582 \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Алаверди",
            name_en: "Alaverdi Branch",
            address: "\u0584. \u0531\u056C\u0561\u057E\u0565\u0580\u0564\u056B, \u0539\u0578\u0582\u0574\u0561\u0576\u0575\u0561\u0576 1",
            phones: ["(+374 253) 2-23-01"]
          },
          {
            name_hy: "\u054D\u057A\u056B\u057F\u0561\u056F\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Спитак",
            name_en: "Spitak Branch",
            phones: ["(0255) 2-22-03"]
          },
          {
            name_hy: "\u054D\u057F\u0565\u0583\u0561\u0576\u0561\u057E\u0561\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Степанаван",
            name_en: "Stepanavan Branch",
            address: "\u0584. \u054D\u057F\u0565\u0583\u0561\u0576\u0561\u057E\u0561\u0576, \u054D\u0578\u0582\u0580\u0562 \u054E\u0561\u0580\u0564\u0561\u0576\u056B 53",
            phones: ["(0256) 2-22-19"]
          }
        ]
      },
      {
        id: "kotayk",
        name_hy: "\u053F\u0578\u057F\u0561\u0575\u0584\u056B \u0574\u0561\u0580\u0566\u056B \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056B\u0580\u0561\u057E\u0561\u057D\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Суд общей юрисдикции Котайкской области",
        name_en: "Kotayk Region Court of General Jurisdiction",
        branches: [
          {
            name_hy: "\u0540\u0580\u0561\u0566\u0564\u0561\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Раздан",
            name_en: "Hrazdan Branch",
            address: "\u0584. \u0540\u0580\u0561\u0566\u0564\u0561\u0576, \u0544\u056B\u056F\u0580\u0578\u0577\u0580\u057B\u0561\u0576 \u0569\u0561\u0572\u0561\u0574\u0561\u057D, 13-\u0580\u0564 \u0583\u0578\u0572., 1/1",
            phones: ["(+374 223) 2-32-96"]
          },
          {
            name_hy: "\u0549\u0561\u0580\u0565\u0576\u0581\u0561\u057E\u0561\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Чаренцаван",
            name_en: "Charentsavan Branch",
            address: "\u0584. \u0549\u0561\u0580\u0565\u0576\u0581\u0561\u057E\u0561\u0576, \u0535\u0580\u056B\u057F\u0561\u057D\u0561\u0580\u0564\u0561\u056F\u0561\u0576 2/1",
            phones: ["(+374 226) 4-50-54", "(+374 226) 4-51-56"]
          },
          {
            name_hy: "\u0535\u0572\u057E\u0561\u0580\u0564\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Егвард",
            name_en: "Yeghvard Branch",
            address: "\u0584. \u0535\u0572\u057E\u0561\u0580\u0564, \u0549\u0561\u0580\u0565\u0576\u0581\u056B 29",
            phones: ["(+374 224) 2-16-15", "(+374 224) 2-16-12"]
          },
          {
            name_hy: "\u0531\u0562\u0578\u057E\u0575\u0561\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Абовян",
            name_en: "Abovyan Branch",
            address: "\u0584. \u0531\u0562\u0578\u057E\u0575\u0561\u0576, \u053F\u0578\u057F\u0561\u0575\u0584\u056B 8",
            phones: ["(+374 222) 2-46-01"]
          }
        ]
      },
      {
        id: "shirak",
        name_hy: "\u0547\u056B\u0580\u0561\u056F\u056B \u0574\u0561\u0580\u0566\u056B \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056B\u0580\u0561\u057E\u0561\u057D\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Суд общей юрисдикции Ширакской области",
        name_en: "Shirak Region Court of General Jurisdiction",
        branches: [
          {
            name_hy: "\u0533\u0575\u0578\u0582\u0574\u0580\u0578\u0582 \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Гюмри",
            name_en: "Gyumri Branch",
            address: "\u0584. \u0533\u0575\u0578\u0582\u0574\u0580\u056B, \u0531\u0576\u056F\u0561\u056D\u0578\u0582\u0569\u0575\u0561\u0576 \u0570\u0580\u0561\u057A\u0561\u0580\u0561\u056F 7",
            phones: ["(+374 312) 5-01-83"]
          },
          {
            name_hy: "\u0544\u0561\u0580\u0561\u056C\u056B\u056F\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Маралик",
            name_en: "Maralik Branch",
            address: "\u0544\u0561\u0580\u0561\u056C\u056B\u056F, \u0540\u0580\u0561\u0576\u057F \u0547\u0561\u0570\u056B\u0576\u0575\u0561\u0576 198",
            phones: ["(+374 242) 2-18-98"]
          }
        ]
      },
      {
        id: "syunik",
        name_hy: "\u054D\u0575\u0578\u0582\u0576\u056B\u0584\u056B \u0574\u0561\u0580\u0566\u056B \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056B\u0580\u0561\u057E\u0561\u057D\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Суд общей юрисдикции Сюникской области",
        name_en: "Syunik Region Court of General Jurisdiction",
        branches: [
          {
            name_hy: "\u053F\u0561\u057A\u0561\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Капан",
            name_en: "Kapan Branch",
            address: "\u0584. \u053F\u0561\u057A\u0561\u0576, \u0544\u0565\u056C\u056B\u0584 \u054D\u057F\u0565\u0583\u0561\u0576\u0575\u0561\u0576 3/2",
            phones: ["(+374 285) 2-75-58"]
          },
          {
            name_hy: "\u0533\u0578\u0580\u056B\u057D\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Горис",
            name_en: "Goris Branch",
            address: "\u0533\u0578\u0580\u056B\u057D, \u0531\u0576\u056F\u0561\u056D\u0578\u0582\u0569\u0575\u0561\u0576 4/1",
            phones: ["(+374 284) 2-56-98"]
          }
        ]
      },
      {
        id: "tavush",
        name_hy: "\u054F\u0561\u057E\u0578\u0582\u0577\u056B \u0574\u0561\u0580\u0566\u056B \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056B\u0580\u0561\u057E\u0561\u057D\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0561\u057F\u0561\u0580\u0561\u0576",
        name_ru: "Суд общей юрисдикции Тавушской области",
        name_en: "Tavush Region Court of General Jurisdiction",
        branches: [
          {
            name_hy: "\u053B\u057B\u0587\u0561\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Иджеван",
            name_en: "Ijevan Branch",
            address: "\u053B\u057B\u0587\u0561\u0576, \u0546\u0561\u056C\u0562\u0561\u0576\u0564\u0575\u0561\u0576 1/1",
            phones: ["(+374 263) 4-08-04", "(+374 263) 4-08-90"]
          },
          {
            name_hy: "\u0534\u056B\u056C\u056B\u057B\u0561\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Дилижан",
            name_en: "Dilijan Branch",
            address: "\u0584. \u0534\u056B\u056C\u056B\u057B\u0561\u0576, \u0547\u0561\u0570\u0578\u0582\u0574\u0575\u0561\u0576 15",
            phones: ["(+374 268) 2-29-79"]
          },
          {
            name_hy: "\u0546\u0578\u0575\u0565\u0574\u0562\u0565\u0580\u0575\u0561\u0576\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Ноемберян",
            name_en: "Noyemberyan Branch",
            address: "\u0584. \u0546\u0578\u0575\u0565\u0574\u0562\u0565\u0580\u0575\u0561\u0576, \u053F\u0561\u0574\u0578\u0575\u056B 2",
            phones: ["(+374 266) 2-22-02", "(+374 266) 2-22-03"]
          },
          {
            name_hy: "\u0532\u0565\u0580\u0564\u056B \u0576\u057D\u057F\u0561\u057E\u0561\u0575\u0580",
            name_ru: "Резиденция Берд",
            name_en: "Berd Branch",
            address: "\u0584. \u0532\u0565\u0580\u0564, \u0531\u0575\u0563\u0565\u057D\u057F\u0561\u0576 49\u0561",
            phones: ["(+374 267) 2-11-10", "(+374 267) 2-11-12"]
          }
        ]
      }
    ]
  }
];

// Helper function to get court name by language
export function getCourtName(court: Court | CourtBranch, language: string): string {
  switch (language) {
    case 'hy': return court.name_hy;
    case 'en': return court.name_en;
    default: return court.name_ru;
  }
}

// Helper function to get category name by language
export function getCategoryName(category: CourtCategory, language: string): string {
  switch (language) {
    case 'hy': return category.name_hy;
    case 'en': return category.name_en;
    default: return category.name_ru;
  }
}

// Flatten all courts with branches for easy selection
export interface FlatCourt {
  id: string;
  categoryId: string;
  courtId: string;
  branchIndex?: number;
  name_hy: string;
  name_ru: string;
  name_en: string;
  fullName_hy: string;
  fullName_ru: string;
  fullName_en: string;
  address?: string;
  phones?: string[];
}

export function getFlatCourtList(): FlatCourt[] {
  const result: FlatCourt[] = [];
  
  ARMENIAN_COURTS.forEach(category => {
    category.courts.forEach(court => {
      // Add main court if it has address/phones
      if (court.address || court.phones?.length) {
        result.push({
          id: court.id,
          categoryId: category.id,
          courtId: court.id,
          name_hy: court.name_hy,
          name_ru: court.name_ru,
          name_en: court.name_en,
          fullName_hy: court.name_hy,
          fullName_ru: court.name_ru,
          fullName_en: court.name_en,
          address: court.address,
          phones: court.phones
        });
      }
      
      // Add branches
      court.branches?.forEach((branch, index) => {
        result.push({
          id: `${court.id}_branch_${index}`,
          categoryId: category.id,
          courtId: court.id,
          branchIndex: index,
          name_hy: branch.name_hy,
          name_ru: branch.name_ru,
          name_en: branch.name_en,
          fullName_hy: `${court.name_hy} - ${branch.name_hy}`,
          fullName_ru: `${court.name_ru} - ${branch.name_ru}`,
          fullName_en: `${court.name_en} - ${branch.name_en}`,
          address: branch.address,
          phones: branch.phones
        });
      });
    });
  });
  
  return result;
}
