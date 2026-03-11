import os
import json
import requests
import sys
import time
import urllib.parse

# ==============================================================================
# НАСТРОЙКИ (ИЗМЕНИТЕ ПОД СВОИ НУЖДЫ)
# ==============================================================================

# 1. ПУТЬ К ПАПКЕ С ВАШИМИ JSON ФАЙЛАМИ
JSON_DIR = r"C:\Users\Admin\Desktop\Hayk\AILEGALARMENIA\Кодексы,законы\armenian_law\ARLIS\arlis_pdfs\output_json"

# 2. ДАННЫЕ ВАШЕГО СУПАБЕЙЗ
SUPABASE_URL = "https://dbrhbbaoeurjveconszd.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRicmhiYmFvZXVyanZlY29uc3pkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzAwNjY3NiwiZXhwIjoyMDg4NTgyNjc2fQ.F6CsMyyTctwVXAFSUQcuQvRjvtSrtIcn0mNQ-YtZjwM"

# 3. РАЗМЕР ПАЧКИ
BATCH_SIZE = 25 # Уменьшаем размер пачки, чтобы обрывов связи не было

# ==============================================================================

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"  # Это важно, чтобы получать ID созданных записей
}

POST_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def upload_json_files():
    if not os.path.exists(JSON_DIR):
        print(f"❌ Ошибка: Папка '{JSON_DIR}' не найдена!")
        return

    json_files = [f for f in os.listdir(JSON_DIR) if f.lower().endswith(".json")]
    
    if not json_files:
        print(f"⚠️ В папке '{JSON_DIR}' не найдено .json файлов.")
        return

    print(f"🚀 Найдено JSON файлов: {len(json_files)}. Начинаем правильную структуру загрузки (Документ -> Чанки)...")

    total_success_docs = 0
    total_success_chunks = 0
    total_skipped = 0
    total_errors = 0

    for idx, filename in enumerate(json_files, 1):
        file_path = os.path.join(JSON_DIR, filename)
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            print(f"[{idx}/{len(json_files)}] ❌ Ошибка чтения '{filename}': {e}")
            total_errors += 1
            continue

        if not isinstance(data, dict) or "chunks" not in data:
            print(f"[{idx}/{len(json_files)}] ❌ Ошибка: В файле '{filename}' нет ключа 'chunks'. Пропускаем.")
            total_errors += 1
            continue
            
        doc_title = data.get("title", filename.replace(".json", ""))
        source_name = data.get("source_file", filename)
        
        print(f"\n[{idx}/{len(json_files)}] Обработка: '{doc_title}'")
        
        # --- ЗАЩИТА ОТ ДУБЛИКАТОВ ---
        # Проверяем, есть ли уже файл с таким source_name в базе
        encoded_source = urllib.parse.quote(source_name)
        try:
            check_res = requests.get(
                f"{SUPABASE_URL}/rest/v1/knowledge_base?source_name=eq.{encoded_source}&select=id",
                headers={**HEADERS, "Prefer": "return=minimal"}
            )
            if check_res.status_code == 200:
                existing_docs = check_res.json()
                if existing_docs and len(existing_docs) > 0:
                    print(f"    ⏭️ Документ уже существует в базе (ID: {existing_docs[0]['id']}). Пропускаем.")
                    total_skipped += 1
                    continue
            elif check_res.status_code >= 400:
                print(f"    ⚠️ ПРЕДУПРЕЖДЕНИЕ: Не удалось проверить дубликаты ({check_res.status_code}).")
        except Exception as e:
            print(f"    ⚠️ Ошибка соединения при проверке дубликатов: {e}")
        # ----------------------------

        # ШАГ 1: Создаем Главный Документ в `knowledge_base`
        kb_payload = {
            "title": doc_title,
            "source_name": source_name,
            "content_text": doc_title, # Для JSON-файлов сюда кидаем заголовок (весь текст в чанках)
            "category": "other",
            "is_active": True,
            "embedding_status": "success" # РЕШЕНО: В базе допускаются только 'pending', 'success', 'failed'. Так как чанки уже есть, ставим 'success'
        }
        
        kb_id = None
        max_retries_doc = 3
        for attempt in range(max_retries_doc):
            try:
                kb_res = requests.post(
                    f"{SUPABASE_URL}/rest/v1/knowledge_base", 
                    headers=HEADERS, 
                    json=kb_payload
                )
                if kb_res.status_code >= 400:
                    print(f"    ❌ Ошибка создания документа '{doc_title}': {kb_res.text}")
                    break
                    
                inserted_kb = kb_res.json()
                if inserted_kb and len(inserted_kb) > 0:
                    kb_id = inserted_kb[0].get("id")
                    total_success_docs += 1
                break
                    
            except Exception as e:
                 print(f"    ⚠️ Попытка {attempt+1}/{max_retries_doc} Ошибка соединения при создании документа: {e}")
                 time.sleep(2)
                 if attempt == max_retries_doc - 1:
                     print("    ❌ Не удалось создать документ после всех попыток.")

        if not kb_id:
            total_errors += 1
            continue

        # ШАГ 2: Загружаем чанки (куски) для этого Документа
        chunks_data = data["chunks"]
        records_count = len(chunks_data)
        print(f"    > Создан документ в БД (ID: {kb_id}). Готовим {records_count} чанков к вставке...")

        adapted_chunks = []
        for c_idx, chunk in enumerate(chunks_data, 1):
            adapted_chunks.append({
                "kb_id": kb_id,                      # Привязываем к главному документу
                "chunk_index": c_idx,
                "chunk_type": "article",
                "chunk_text": chunk.get("text", ""), # Важно! В JSON 'text', а в БД 'chunk_text'
                "is_active": True
            })

        # Пачками кидаем в knowledge_base_chunks
        for i in range(0, len(adapted_chunks), BATCH_SIZE):
            batch = adapted_chunks[i:i + BATCH_SIZE]
            
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    # ВНИМАНИЕ: Целевая таблица 'knowledge_base_chunks'
                    res = requests.post(
                        f"{SUPABASE_URL}/rest/v1/knowledge_base_chunks", 
                        headers=POST_HEADERS, 
                        json=batch
                    )

                    if res.status_code >= 400:
                        print(f"    ❌ Ошибка вставки чанков {i}-{i+len(batch)}: {res.text}")
                        if attempt == max_retries - 1:
                           total_errors += len(batch)
                        time.sleep(2)
                    else:
                        total_success_chunks += len(batch)
                        break
                        
                except Exception as e:
                    print(f"    ⚠️ Попытка {attempt+1}/{max_retries} Ошибка сети при вставке чанков {i}-{i+len(batch)}: {e}")
                    time.sleep(3) # Ждем перед повтором
                    if attempt == max_retries - 1:
                       total_errors += len(batch)

    print("\n" + "="*50)
    print(f"🎉 ЗАГРУЗКА ИЗ ПАПКИ ЗАВЕРШЕНА!")
    print(f"✅ Успешно создано документов: {total_success_docs}")
    print(f"✅ Успешно прикреплено чанков: {total_success_chunks}")
    print(f"⏭️ Пропущено дубликатов: {total_skipped}")
    print(f"❌ Возникло ошибок: {total_errors}")
    print("="*50)

if __name__ == "__main__":
    upload_json_files()

