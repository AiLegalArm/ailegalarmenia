import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import crypto from "crypto";
import readline from "readline";

// ==========================================
const SUPABASE_URL = "https://dbrhbbaoeurjveconszd.supabase.co"; 
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRicmhiYmFvZXVyanZlY29uc3pkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzAwNjY3NiwiZXhwIjoyMDg4NTgyNjc2fQ.F6CsMyyTctwVXAFSUQcuQvRjvtSrtIcn0mNQ-YtZjwM";
const FILE_PATH = "C:\\Users\\Admin\\Desktop\\Hayk\\AILEGALARMENIA\\Кодексы,законы\\armenian_law\\Арлис\\ЕСПЧ\\Legal_practice.jsonl";
// ==========================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function extractCaseText(caseObj: any): string {
  const standard = [caseObj.text, caseObj.content_text, caseObj.judgment, caseObj.summary, caseObj.facts]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .join("\n\n");
  if (standard.trim()) return standard;

  const hudocContent = caseObj.content;
  if (hudocContent && typeof hudocContent === "object" && !Array.isArray(hudocContent)) {
    const parts: string[] = [];
    for (const docSections of Object.values(hudocContent as Record<string, any>)) {
      if (Array.isArray(docSections)) {
        extractElementsText(docSections, parts);
      }
    }
    if (parts.length > 0) return parts.join("\n\n");
  }

  if (typeof caseObj.__conclusion === "string" && caseObj.__conclusion.trim()) {
    return caseObj.__conclusion;
  }
  return "";
}

function extractElementsText(elements: any[], parts: string[]) {
  for (const el of elements) {
    if (typeof el.content === "string" && el.content.trim()) parts.push(el.content.trim());
    if (Array.isArray(el.elements) && el.elements.length > 0) extractElementsText(el.elements, parts);
  }
}

function extractViolations(caseObj: any): string[] {
  const violations: string[] = [];
  if (Array.isArray(caseObj.conclusion)) {
    for (const c of caseObj.conclusion) {
      if (c.type === "violation" && c.element) violations.push(c.element);
    }
  }
  if (violations.length === 0 && typeof caseObj.__conclusion === "string") {
    violations.push(...caseObj.__conclusion.split(";").map((s: string) => s.trim()).filter(Boolean));
  }
  return violations;
}

function mapOutcome(raw: string): string {
  const lower = raw.toLowerCase();
  if (/violation|granted|удовлет|բավ/.test(lower)) return "granted";
  if (/no.violation|rejected|отклон|մերժ/.test(lower)) return "rejected";
  if (/partial|частичн|մաս/.test(lower)) return "partial";
  if (/struck|discontin|прекращ|կարճ/.test(lower)) return "discontinued";
  return "granted";
}

async function computeHash(text: string): Promise<string> {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function uploadJsonl() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`Файл ${FILE_PATH} не найден!`);
    return;
  }

  console.log(`🚀 Начинаем импорт из JSONL: ${FILE_PATH}`);
  
  const { data: existingRecords } = await supabase.from('legal_practice_kb').select('echr_case_id').not('echr_case_id', 'is', null);
  const existingIds = new Set(existingRecords?.map(r => r.echr_case_id) || []);

  const fileStream = fs.createReadStream(FILE_PATH);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const batchSize = 50;
  let currentBatch: any[] = [];
  let totalProcessed = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    
    totalProcessed++;
    let caseObj: any;
    try {
      caseObj = JSON.parse(line);
    } catch (e) {
      console.error(`\n❌ Ошибка парсинга строки ${totalProcessed}`);
      continue;
    }

    const stableId = caseObj.itemid || caseObj.appno || caseObj.application_no;
    if (stableId && existingIds.has(String(stableId))) {
      totalSkipped++;
      continue;
    }

    const rawText = extractCaseText(caseObj);
    const contentText = rawText.replace(/\u0000/g, "").slice(0, 500000);
    if (!contentText) {
      totalSkipped++;
      continue;
    }

    const contentHash = await computeHash(contentText);
    const violations = extractViolations(caseObj);
    
    let decisionDate: string | null = null;
    const decisionDateRaw = String(caseObj.judgementdate || caseObj.kpdate || caseObj.decision_date || "").trim();
    if (decisionDateRaw) {
      const isoMatch = decisionDateRaw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const euMatch = decisionDateRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (isoMatch) decisionDate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      else if (euMatch) decisionDate = `${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`;
    }

    let echrArticles: string[] = [];
    if (Array.isArray(caseObj.article)) echrArticles = caseObj.article;
    else if (typeof caseObj.__articles === "string") echrArticles = caseObj.__articles.split(";").map((s: string) => s.trim()).filter(Boolean);

    const title = String(caseObj.docname || caseObj.title || `ECHR-${stableId || "unknown"}`).slice(0, 500);
    const appliedArticles = echrArticles.length > 0
      ? { sources: [{ act: "ECHR", articles: echrArticles.map(a => ({ article: a, part: "", point: "", context: "" })) }] }
      : null;

    currentBatch.push({
      echr_case_id: stableId ? String(stableId) : null,
      title,
      content_text: contentText,
      content_hash: contentHash,
      practice_category: "echr",
      court_type: "echr",
      outcome: mapOutcome(violations.length > 0 ? "violation" : "granted"),
      is_anonymized: false,
      visibility: "ai_only",
      is_active: true,
      source_name: String(caseObj.originatingbody_name || "ECHR HUDOC"),
      court_name: String(caseObj.respondent || "ECHR").trim(),
      case_number_anonymized: String(caseObj.appno || "").trim() || null,
      decision_date: decisionDate,
      applied_articles: appliedArticles,
      key_violations: violations.length > 0 ? violations : null,
    });

    if (stableId) existingIds.add(String(stableId));

    if (currentBatch.length >= batchSize) {
      const { error } = await supabase.from('legal_practice_kb').upsert(currentBatch, { onConflict: 'echr_case_id' });
      if (error) {
        console.error(`\n❌ Ошибка батча:`, error.message);
        totalErrors += currentBatch.length;
      } else {
        totalInserted += currentBatch.length;
      }
      currentBatch = [];
      process.stdout.write(`\rОбработано: ${totalProcessed} | ✅ ${totalInserted} | ⏭️ ${totalSkipped} | ❌ ${totalErrors}`);
    }
  }

  // Последний батч
  if (currentBatch.length > 0) {
    const { error } = await supabase.from('legal_practice_kb').upsert(currentBatch, { onConflict: 'echr_case_id' });
    if (error) {
      totalErrors += currentBatch.length;
    } else {
      totalInserted += currentBatch.length;
    }
  }

  console.log("\n\n==============================");
  console.log("🔥 ИМПОРТ ЗАВЕРШЕН:");
  console.log(`✅ Всего загружено: ${totalInserted}`);
  console.log(`⏭️ Пропущено: ${totalSkipped}`);
  console.log(`❌ Ошибок: ${totalErrors}`);
  console.log("==============================");
}

uploadJsonl().catch(console.error);
