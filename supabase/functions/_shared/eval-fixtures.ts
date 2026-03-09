// =============================================================================
// RAG Evaluation Golden Fixtures
// 20 queries covering legislation (10) + practice (10)
// Each fixture includes: query, expected retrieval targets, and grounding rules
// =============================================================================

export interface GoldenFixture {
  id: string;
  /** Human-readable label */
  label: string;
  /** The search/chat query */
  query: string;
  /** Which tables to search: "kb" | "practice" | "both" */
  tables: "kb" | "practice" | "both";
  /** Category filter (if applicable) */
  category?: "criminal" | "civil" | "administrative" | "echr" | "constitutional" | null;
  /** Expected article/norm references that SHOULD appear in results */
  expectedNormPatterns: RegExp[];
  /** Norm patterns that MUST NOT appear (hallucination canaries) */
  forbiddenNormPatterns: RegExp[];
  /** Minimum number of results expected (0 = accept empty) */
  minResults: number;
  /** Whether the query should trigger a temporal disclaimer if no date given */
  expectsTemporalDisclaimer: boolean;
  /** Optional reference_date for temporal filtering */
  referenceDate?: string;
}

// ---------------------------------------------------------------------------
// Armenian legal norm regex helpers (Unicode escaped)
// ---------------------------------------------------------------------------

/** Match \u0540\u0578\u0564\u057e\u0561\u056e (Article) + number */
const artPattern = (num: number | string) =>
  new RegExp(`(\\u0540\\u0578\\u0564\\u057e\\u0561\\u056e|\\u0570\\u0578\\u0564\\u057e\\u0561\\u056e|\u0540\u0578\u0564\u057e\u0561\u056e|\u0570\u0578\u0564\u057e\u0561\u056e|[Aa]rt(icle)?|[Ss]t(at)?\\.?)\\s*\\.?\\s*${num}\\b`, "i");

/** Match RA Criminal Code reference */
const crimCodePattern = () =>
  new RegExp(`(\u0554\u053f|\u0554\u054f|Criminal\\s*Code|\\u0554\\u053f)`, "i");

/** Match RA Civil Procedure Code reference */  
const civProcPattern = () =>
  new RegExp(`(\u0554\u0561\u0572\u0534\u0555|\u0584\u0561\u0572\u0564\u0585|Civil\\s*Procedure|\\u0554\\u0561\\u0572\\u0534\\u0555)`, "i");

/** Match ECHR reference */
const echrPattern = () =>
  new RegExp(`(ECHR|ECHR|\\u0544\\u053b\\u0535\\u0534|\u0544\u053b\u0535\u0534|European\\s*Convention)`, "i");

/** Fabricated article canary — articles that don't exist */
const fabricatedArticle = (num: number) =>
  new RegExp(`\\b${num}(\\.\\d+)?\\b.*(\u0554\u053f|\u0554\u0555|Criminal|Civil)`, "i");

// ---------------------------------------------------------------------------
// 10 Legislation Queries
// ---------------------------------------------------------------------------

const legislationFixtures: GoldenFixture[] = [
  {
    id: "L01",
    label: "Right to defense - RA Criminal Procedure Code",
    query: "\u053b\u0576\u0579\u057a\u0565\u057d \u057a\u0565\u057f\u0584 \u0567 \u0570\u0561\u057d\u056f\u0561\u0576\u0561\u056c \u057a\u0561\u0577\u057f\u057a\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u056b\u0580\u0561\u057e\u0578\u0582\u0576\u0584\u0568 \u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0563\u0578\u0580\u056e\u0578\u0574",
    tables: "kb",
    expectedNormPatterns: [artPattern(65), artPattern(66)],
    forbiddenNormPatterns: [fabricatedArticle(999)],
    minResults: 1,
    expectsTemporalDisclaimer: true,
  },
  {
    id: "L02",
    label: "Evidence admissibility standards",
    query: "\u0531\u057a\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056b \u0569\u0578\u0582\u0575\u056c\u0561\u057f\u0580\u0565\u056c\u056b\u0578\u0582\u0569\u0575\u0561\u0576 \u057a\u0561\u0570\u0561\u0576\u057b\u0576\u0565\u0580 \u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u057e\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0578\u0582\u0574",
    tables: "kb",
    expectedNormPatterns: [artPattern(105), artPattern(106)],
    forbiddenNormPatterns: [],
    minResults: 1,
    expectsTemporalDisclaimer: true,
  },
  {
    id: "L03",
    label: "Civil claim filing requirements",
    query: "\u0540\u0561\u0575\u0581\u056b \u0576\u0565\u0580\u056f\u0561\u0575\u0561\u0581\u0574\u0561\u0576 \u056f\u0561\u0580\u0563\u0568 \u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056b\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u057e\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0578\u0582\u0574",
    tables: "kb",
    expectedNormPatterns: [artPattern(87), artPattern(88)],
    forbiddenNormPatterns: [fabricatedArticle(777)],
    minResults: 1,
    expectsTemporalDisclaimer: true,
  },
  {
    id: "L04",
    label: "Administrative appeal deadlines",
    query: "\u054E\u0561\u0580\u0579\u0561\u056f\u0561\u0576 \u0561\u056f\u057f\u056b \u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0574\u0561\u0576 \u056a\u0561\u0574\u056f\u0565\u057f\u0576\u0565\u0580",
    tables: "kb",
    expectedNormPatterns: [artPattern(73)],
    forbiddenNormPatterns: [],
    minResults: 1,
    expectsTemporalDisclaimer: true,
  },
  {
    id: "L05",
    label: "Constitutional right to fair trial",
    query: "\u0531\u0580\u0564\u0561\u0580 \u0564\u0561\u057f\u0561\u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u056b\u0580\u0561\u057e\u0578\u0582\u0576\u0584 \u054d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    tables: "kb",
    expectedNormPatterns: [artPattern(63), artPattern(61)],
    forbiddenNormPatterns: [],
    minResults: 1,
    expectsTemporalDisclaimer: true,
  },
  {
    id: "L06",
    label: "Detention legality - Criminal Procedure",
    query: "\u053f\u0561\u056c\u0561\u0576\u0561\u057e\u0578\u0580\u0574\u0561\u0576 \u0585\u0580\u056b\u0576\u0561\u056f\u0561\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u057e\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    tables: "kb",
    expectedNormPatterns: [artPattern(128), artPattern(135)],
    forbiddenNormPatterns: [],
    minResults: 1,
    expectsTemporalDisclaimer: true,
  },
  {
    id: "L07",
    label: "Presumption of innocence",
    query: "\u0531\u0576\u0574\u0565\u0572\u0578\u0582\u0569\u0575\u0561\u0576 \u056f\u0561\u0576\u056d\u0561\u057e\u0561\u0580\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    tables: "kb",
    expectedNormPatterns: [artPattern(21), artPattern(22)],
    forbiddenNormPatterns: [],
    minResults: 1,
    expectsTemporalDisclaimer: true,
  },
  {
    id: "L08",
    label: "Cassation appeal grounds",
    query: "\u054E\u0573\u057c\u0561\u0562\u0565\u056f \u0562\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0578\u0582\u0569\u0575\u0561\u0576 \u0570\u056b\u0574\u0584\u0565\u0580 \u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056b\u0561\u056f\u0561\u0576 \u0563\u0578\u0580\u056e\u0578\u057e",
    tables: "kb",
    expectedNormPatterns: [artPattern(394), artPattern(395)],
    forbiddenNormPatterns: [],
    minResults: 1,
    expectsTemporalDisclaimer: true,
  },
  {
    id: "L09",
    label: "Witness examination rules",
    query: "\u054E\u056f\u0561\u0576\u0565\u0580\u056b \u0570\u0561\u0580\u0581\u0561\u0584\u0576\u0574\u0561\u0576 \u056f\u0561\u0580\u0563",
    tables: "kb",
    expectedNormPatterns: [artPattern(86)],
    forbiddenNormPatterns: [],
    minResults: 1,
    expectsTemporalDisclaimer: true,
  },
  {
    id: "L10",
    label: "Temporal filter - legislation effective at specific date",
    query: "\u0554\u0580\u0565\u0561\u056f\u0561\u0576 \u0585\u0580\u0565\u0576\u057d\u0563\u0580\u0584\u056b \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u0564\u0580\u0578\u0582\u0575\u0569\u0576\u0565\u0580",
    tables: "kb",
    referenceDate: "2023-06-15",
    expectedNormPatterns: [],
    forbiddenNormPatterns: [],
    minResults: 0,
    expectsTemporalDisclaimer: false,
  },
];

// ---------------------------------------------------------------------------
// 10 Practice Queries
// ---------------------------------------------------------------------------

const practiceFixtures: GoldenFixture[] = [
  {
    id: "P01",
    label: "Cassation Court - evidence admissibility precedent",
    query: "\u054E\u0573\u057c\u0561\u0562\u0565\u056f \u0564\u0561\u057f\u0561\u0580\u0561\u0576\u056b \u057a\u0580\u0561\u056f\u057f\u056b\u056f\u0561 \u0561\u057a\u0561\u0581\u0578\u0582\u0575\u0581\u0576\u0565\u0580\u056b \u0569\u0578\u0582\u0575\u056c\u0561\u057f\u0580\u0565\u056c\u056b\u0578\u0582\u0569\u0575\u0578\u0582\u0576",
    tables: "practice",
    category: "criminal",
    expectedNormPatterns: [crimCodePattern()],
    forbiddenNormPatterns: [],
    minResults: 0,
    expectsTemporalDisclaimer: false,
  },
  {
    id: "P02",
    label: "Cassation Court - civil contract disputes",
    query: "\u054E\u0573\u057c\u0561\u0562\u0565\u056f \u0564\u0561\u057f\u0561\u0580\u0561\u0576 \u057a\u0561\u0575\u0574\u0561\u0576\u0561\u0563\u0580\u0561\u0575\u056b\u0576 \u057e\u0565\u0573",
    tables: "practice",
    category: "civil",
    expectedNormPatterns: [],
    forbiddenNormPatterns: [],
    minResults: 0,
    expectsTemporalDisclaimer: false,
  },
  {
    id: "P03",
    label: "ECHR Article 6 fair trial precedents",
    query: "ECHR Article 6 fair trial Armenia",
    tables: "practice",
    category: "echr",
    expectedNormPatterns: [echrPattern()],
    forbiddenNormPatterns: [],
    minResults: 0,
    expectsTemporalDisclaimer: false,
  },
  {
    id: "P04",
    label: "Administrative court - property disputes",
    query: "\u054E\u0561\u0580\u0579\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576 \u057d\u0565\u0583\u0561\u056f\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u056b\u0580\u0561\u057e\u0578\u0582\u0576\u0584 \u057e\u0565\u0573",
    tables: "practice",
    category: "administrative",
    expectedNormPatterns: [],
    forbiddenNormPatterns: [],
    minResults: 0,
    expectsTemporalDisclaimer: false,
  },
  {
    id: "P05",
    label: "Unlawful detention precedents",
    query: "\u0531\u0576\u0585\u0580\u056b\u0576\u0561\u056f\u0561\u0576 \u056f\u0561\u056c\u0561\u0576\u0561\u057e\u0578\u0580\u0574\u0561\u0576 \u057e\u0565\u0580\u0561\u0562\u0565\u0580\u0575\u0561\u056c \u0564\u0561\u057f\u0561\u056f\u0561\u0576 \u0561\u056f\u057f\u0565\u0580",
    tables: "practice",
    category: "criminal",
    expectedNormPatterns: [],
    forbiddenNormPatterns: [],
    minResults: 0,
    expectsTemporalDisclaimer: false,
  },
  {
    id: "P06",
    label: "Proportionality of punishment",
    query: "\u054a\u0561\u057f\u056a\u056b \u0570\u0561\u0574\u0561\u0579\u0561\u0583\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u0564\u0561\u057f\u0561\u056f\u0561\u0576 \u057a\u0580\u0561\u056f\u057f\u056b\u056f\u0561",
    tables: "practice",
    category: "criminal",
    expectedNormPatterns: [],
    forbiddenNormPatterns: [],
    minResults: 0,
    expectsTemporalDisclaimer: false,
  },
  {
    id: "P07",
    label: "Right to appeal - procedural violations",
    query: "\u0532\u0578\u0572\u0578\u0584\u0561\u0580\u056f\u0574\u0561\u0576 \u056b\u0580\u0561\u057e\u0578\u0582\u0576\u0584 \u0564\u0561\u057f\u0561\u057e\u0561\u0580\u0578\u0582\u0569\u0575\u0561\u0576 \u056d\u0561\u056d\u057f\u0578\u0582\u0574",
    tables: "practice",
    expectedNormPatterns: [],
    forbiddenNormPatterns: [],
    minResults: 0,
    expectsTemporalDisclaimer: false,
  },
  {
    id: "P08",
    label: "Labor dispute precedents",
    query: "\u0531\u0577\u056d\u0561\u057f\u0561\u0576\u0584\u0561\u0575\u056b\u0576 \u057e\u0565\u0573\u0565\u0580 \u0564\u0561\u057f\u0561\u056f\u0561\u0576 \u057a\u0580\u0561\u056f\u057f\u056b\u056f\u0561",
    tables: "practice",
    category: "civil",
    expectedNormPatterns: [],
    forbiddenNormPatterns: [],
    minResults: 0,
    expectsTemporalDisclaimer: false,
  },
  {
    id: "P09",
    label: "Constitutional Court - rights limitation",
    query: "\u054d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576 \u056b\u0580\u0561\u057e\u0578\u0582\u0576\u0584\u056b \u057d\u0561\u0570\u0574\u0561\u0576\u0561\u0583\u0561\u056f\u0578\u0582\u0574",
    tables: "practice",
    category: "constitutional",
    expectedNormPatterns: [],
    forbiddenNormPatterns: [],
    minResults: 0,
    expectsTemporalDisclaimer: false,
  },
  {
    id: "P10",
    label: "Both tables - comprehensive defense strategy search",
    query: "\u054a\u0561\u0577\u057f\u057a\u0561\u0576\u0578\u0582\u0569\u0575\u0561\u0576 \u057d\u057f\u0580\u0561\u057f\u0565\u0563\u056b\u0561 \u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0563\u0578\u0580\u056e\u0578\u057e",
    tables: "both",
    expectedNormPatterns: [],
    forbiddenNormPatterns: [],
    minResults: 0,
    expectsTemporalDisclaimer: false,
  },
];

// ---------------------------------------------------------------------------
// Exported combined fixture set
// ---------------------------------------------------------------------------

export const GOLDEN_FIXTURES: GoldenFixture[] = [
  ...legislationFixtures,
  ...practiceFixtures,
];

export const LEGISLATION_FIXTURES = legislationFixtures;
export const PRACTICE_FIXTURES = practiceFixtures;
