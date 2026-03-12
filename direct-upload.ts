import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import crypto from "crypto";

// ==========================================
// 1. Вставьте сюда ваши ключи:
const SUPABASE_URL = "https://dbrhbbaoeurjveconszd.supabase.co"; 
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRicmhiYmFvZXVyanZlY29uc3pkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzAwNjY3NiwiZXhwIjoyMDg4NTgyNjc2fQ.F6CsMyyTctwVXAFSUQcuQvRjvtSrtIcn0mNQ-YtZjwM";
// 2. Положите все 17 JSON файлов в папку echr_data (создайте эту папку рядом со скриптом)
const DATA_FOLDER = "./echr_data";
// ==========================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Аналоги экстракторов с бэкенда
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

async function uploadDirectly() {
  if (!fs.existsSync(DATA_FOLDER)) {
    console.error(`Папка ${DATA_FOLDER} не найдена! Создайте ее и положите туда ваши 17 JSON файлов.`);
    return;
  }

  const files = fs.readdirSync(DATA_FOLDER).filter(f => f.endsWith(".json"));
  if (files.length === 0) {
    console.warn(`В папке ${DATA_FOLDER} нет .json файлов.`);
    return;
  }

  console.log(`Найдено ${files.length} файлов. Получение существующих echr_case_id из базы...`);
  
  // Получаем уже существующие ID, чтобы не дублировать
  const { data: existingRecords } = await supabase.from('legal_practice_kb').select('echr_case_id').not('echr_case_id', 'is', null);
  const existingIds = new Set(existingRecords?.map(r => r.echr_case_id) || []);

  const batchSize = 50;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const file of files) {
    const filePath = `${DATA_FOLDER}/${file}`;
    console.log(`\n📄 Начинаем обработку файла: ${file}`);
    
    let items: any[] = [];
    try {
      const rawData = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(rawData);
      items = Array.isArray(parsed) ? parsed : [parsed];
    } catch (err) {
      console.error(`❌ Ошибка чтения файла ${file}:`, err);
      continue;
    }

    console.log(`Найдено ${items.length} дел в ${file}.`);
    
    let fileInserted = 0;
    let fileSkipped = 0;
    let fileErrors = 0;

    for (let i = 0; i < items.length; i += batchSize) {
      const chunk = items.slice(i, i + batchSize);
      const rowsToInsert = [];

      for (const caseObj of chunk) {
        const stableId = caseObj.itemid || caseObj.appno || caseObj.application_no;
        
        if (stableId && existingIds.has(String(stableId))) {
          fileSkipped++;
          continue;
        }

        const rawText = extractCaseText(caseObj);
        const contentText = rawText.replace(/\u0000/g, "").slice(0, 500000);
        
        if (!contentText) {
          fileSkipped++;
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

        rowsToInsert.push({
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

        // Сразу помечаем как "уже в очереди", чтобы не добавить дубликат в эту же пачку
        if (stableId) existingIds.add(String(stableId));
      }

      if (rowsToInsert.length > 0) {
        // Используем upsert вместо insert, чтобы игнорировать дубликаты по echr_case_id
        const { error } = await supabase.from('legal_practice_kb').upsert(rowsToInsert, { 
          onConflict: 'echr_case_id'
        });
        
        if (error) {
          console.error(`Ошибка батча:`, error.message);
          fileErrors += rowsToInsert.length;
        } else {
          fileInserted += rowsToInsert.length;
          rowsToInsert.forEach(r => { if (r.echr_case_id) existingIds.add(r.echr_case_id) });
        }
      }

      process.stdout.write(`\r(${file}) Прогресс: ${Math.min(i + batchSize, items.length)} / ${items.length} `);
    }
    
    console.log(`\nИтог по файлу ${file}: ✅ ${fileInserted} | ⏭️ ${fileSkipped} | ❌ ${fileErrors}`);
    totalInserted += fileInserted;
    totalSkipped += fileSkipped;
    totalErrors += fileErrors;
  }

  console.log("\n==============================");
  console.log("🔥 ОБЩИЙ ИТОГ ПО ВСЕМ ФАЙЛАМ:");
  console.log(`✅ Загружено абсолютно новых: ${totalInserted}`);
  console.log(`⏭️ Пропущено (уже есть / пустые): ${totalSkipped}`);
  console.log(`❌ Ошибок при загрузке: ${totalErrors}`);
  console.log("==============================");
}

uploadDirectly().catch(console.error);
