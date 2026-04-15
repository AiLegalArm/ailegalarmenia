#!/usr/bin/env node
/**
 * Load PDF files → deduplicate → chunk → insert into Supabase
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PDFParse } from "pdf-parse";
import { encode } from "gpt-3-encoder";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// -------------- Configuration --------------
const SUPABASE_URL = "https://dbrhbbaoeurjveconszd.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY environment variable not set");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Папка с PDF‑файлами
const PDF_ROOT =
  "C:\\Users\\Admin\\Desktop\\Hayk\\AILEGALARMENIA\\Кодексы,законы\\armenian_law\\ARLIS\\arlis_pdfs";

// -------------- Utilities --------------
async function hashContent(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function chunkText(text, maxTokens = 1000) {
  const tokens = encode(text);
  const chunks = [];
  for (let i = 0; i < tokens.length; i += maxTokens) {
    const slice = tokens.slice(i, i + maxTokens);
    chunks.push(slice.map((t) => t).join(""));
  }
  return chunks;
}

async function getExistingDocHashes() {
  const { data, error } = await supabase
    .from("pdf_documents")
    .select("content_hash");
  if (error) {
    console.error("⚠️ Ошибка получения существующих хешей:", error);
    return new Set();
  }
  return new Set(data.map((r) => r.content_hash).filter(Boolean));
}

async function getExistingChunkHashes() {
  const { data, error } = await supabase
    .from("legal_chunks")
    .select("content_hash");
  if (error) {
    console.error("⚠️ Ошибка получения хешей чанков:", error);
    return new Set();
  }
  return new Set(data.map((r) => r.content_hash).filter(Boolean));
}

// -------------- Main Logic --------------
async function loadPdfFolder() {
  console.log("\n📂 Сканирую папку:", PDF_ROOT);
  if (!fs.existsSync(PDF_ROOT)) {
    console.error("❌ Папка не найдена:", PDF_ROOT);
    return;
  }

  const files = fs
    .readdirSync(PDF_ROOT)
    .filter((f) => f.toLowerCase().endsWith(".pdf"));
  console.log(`🔎 Найдено PDF‑файлов: ${files.length}`);

  const existingDocHashes = await getExistingDocHashes();
  const existingChunkHashes = await getExistingChunkHashes();

  let newDocs = 0;
  let dupDocs = 0;
  let totalChunks = 0;
  let newChunks = 0;

  for (const file of files) {
    const fullPath = path.join(PDF_ROOT, file);
    const buffer = fs.readFileSync(fullPath);

    let pdfData;
    try {
      const pdfParse = new PDFParse();
      pdfData = await pdfParse.processBuffer(buffer);
    } catch (e) {
      console.warn(`⚠️ Не удалось распарсить ${file}:`, e.message);
      continue;
    }
    const text = pdfData.text.trim();
    if (!text) {
      console.warn(`⚠️ Пустой текст в ${file}`);
      continue;
    }

    const docHash = await hashContent(text);
    const isDuplicate = existingDocHashes.has(docHash);
    if (isDuplicate) {
      dupDocs++;
      continue;
    }

    const docRecord = {
      file_name: file,
      file_path: fullPath,
      content_hash: docHash,
      source_type: "pdf",
      is_active: true,
      embedding_status: "pending",
    };

    const { error: docErr, data: docData } = await supabase
      .from("pdf_documents")
      .insert([docRecord])
      .select("id")
      .single();

    if (docErr) {
      console.error(`❌ Ошибка вставки ${file}:`, docErr.message);
      continue;
    }
    const docId = docData.id;
    newDocs++;

    const chunks = chunkText(text, 1000);
    totalChunks += chunks.length;

    const chunkRecords = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const chunkHash = await hashContent(docHash + "_" + i);
      if (existingChunkHashes.has(chunkHash)) continue;

      chunkRecords.push({
        parent_document_id: docId,
        chunk_index: i,
        content_text: chunkText,
        content_hash: chunkHash,
        embedding_status: "pending",
      });
    }

    const BATCH = 100;
    for (let i = 0; i < chunkRecords.length; i += BATCH) {
      const batch = chunkRecords.slice(i, i + BATCH);
      const { error: chunkErr } = await supabase.from("legal_chunks").insert(batch);
      if (chunkErr) {
        console.error(`❌ Ошибка вставки чанков (batch ${i / BATCH}):`, chunkErr.message);
        continue;
      }
      newChunks += batch.length;
    }

    console.log(`✅ ${file} → ${chunks.length} чанков`);
  }

  console.log("\n=================== 📊 ЗАГРУЗКА ЗАВЕРШЕНА ===================");
  console.log(`🆕 Новых PDF‑документов   : ${newDocs}`);
  console.log(`🔁 Дубликатов (пропущено) : ${dupDocs}`);
  console.log(`🧩 Всего чанков          : ${totalChunks}`);
  console.log(`🆕 Новых чанков          : ${newChunks}`);
  console.log("================================================================\n");
}

loadPdfFolder().catch((e) => {
  console.error("❌ Фатальная ошибка:", e);
  process.exit(1);
});
