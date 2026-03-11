import os
import time
import requests
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError as e:
    print(f"Критическая ошибка: Не удалось импортировать fitz (PyMuPDF). Ошибка: {e}")
    print("Убедитесь, что запускаете скрипт правильной версией Python, где установлена эта библиотека.")
    sys.exit(1)

# ==============================================================================
# НАСТРОЙКИ (ИЗМЕНИТЕ ПОД СВОИ НУЖДЫ)
# ==============================================================================

# 1. ПУТЬ К ВАШИМ ЛОКАЛЬНЫМ ФАЙЛАМ
FILES_DIR = r"C:\Users\Admin\Desktop\Hayk\AILEGALARMENIA\Кодексы,законы\armenian_law\ARLIS\arlis_pdfs"

# 2. В КАКУЮ ТАБЛИЦУ ГРУЗИМ?
TARGET_TABLE = "knowledge_base"

# 3. КАТЕГОРИЯ ПО УМОЛЧАНИЮ (для knowledge_base)
DEFAULT_CATEGORY = "other"

# 4. ДАННЫЕ ВАШЕГО СУПАБЕЙЗ
SUPABASE_URL = "https://dbrhbbaoeurjveconszd.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRicmhiYmFvZXVyanZlY29uc3pkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzAwNjY3NiwiZXhwIjoyMDg4NTgyNjc2fQ.F6CsMyyTctwVXAFSUQcuQvRjvtSrtIcn0mNQ-YtZjwM"

# ==============================================================================

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def extract_text_from_pdf(pdf_path):
    text = ""
    try:
        doc = fitz.open(pdf_path)
        for page in doc:
            # Сначала пытаемся вытащить реальный текст
            page_text = page.get_text("text")
            if page_text.strip():
                text += page_text + "\n"
        doc.close()
    except Exception as e:
        print(f"Ошибка при чтении PDF ({pdf_path}): {e}")
        
    return text.strip()

def upload_local_files():
    if not os.path.exists(FILES_DIR):
        print(f"❌ Ошибка: Папка '{FILES_DIR}' не найдена!")
        return

    # Ищем и TXT, и PDF
    files = [f for f in os.listdir(FILES_DIR) if f.lower().endswith((".txt", ".pdf"))]
    
    if not files:
        print(f"⚠️ В папке '{FILES_DIR}' не найдено .txt или .pdf файлов.")
        return

    print(f"🚀 Найдено файлов: {len(files)}. Начинаем загрузку в таблицу '{TARGET_TABLE}'...")
    
    success_count = 0
    error_count = 0

    for idx, filename in enumerate(files, 1):
        file_path = os.path.join(FILES_DIR, filename)
        
        # Названием документа будет имя файла без расширения
        title = os.path.splitext(filename)[0]
        ext = os.path.splitext(filename)[1].lower()
        
        try:
            content_text = ""
            if ext == ".txt":
                with open(file_path, "r", encoding="utf-8") as f:
                    content_text = f.read()
            elif ext == ".pdf":
                content_text = extract_text_from_pdf(file_path)
                
            if not content_text.strip():
                print(f"[{idx}/{len(files)}] ⚠️ Файл '{filename}' пуст (или PDF содержит только картинки-сканы без текста). Пропускаем.")
                continue

            # Подготавливаем данные в зависимости от таблицы (по вашей схеме)
            if TARGET_TABLE == "knowledge_base":
                payload = {
                    "title": title,
                    "content_text": content_text,
                    "category": DEFAULT_CATEGORY,
                    "is_active": True,
                    "embedding_status": "pending" # Важно для запуска оркестратора
                }
            elif TARGET_TABLE == "legal_practice_kb":
                payload = {
                    "title": title,
                    "content_text": content_text,
                    # Обязательные поля для legal_practice_kb
                    "court_type": "first_instance", 
                    "practice_category": "civil",
                    "outcome": "granted",
                    "is_active": True,
                    "embedding_status": "pending"
                }

            # Отправляем в Supabase
            res = requests.post(
                f"{SUPABASE_URL}/rest/v1/{TARGET_TABLE}", 
                headers=HEADERS, 
                json=payload
            )

            if res.status_code >= 400:
                print(f"[{idx}/{len(files)}] ❌ Ошибка при загрузке '{filename}': {res.text}")
                error_count += 1
            else:
                print(f"[{idx}/{len(files)}] ✅ Успешно загружен: '{title}'")
                success_count += 1
                
        except Exception as e:
            print(f"[{idx}/{len(files)}] ❌ Ошибка чтения файла '{filename}': {e}")
            error_count += 1

    print("\n" + "="*50)
    print(f"🎉 ЗАГРУЗКА ЗАВЕРШЕНА!")
    print(f"✅ Успешно: {success_count} файлов")
    print(f"❌ Ошибок: {error_count} файлов")
    print("="*50)
    print("\nТеперь вы можете запустить `SELECT enqueue_batch_kb(5000);` в SQL Editor Supabase,")
    print("чтобы система начала автоматически резать эти тексты на чанки!")

if __name__ == "__main__":
    if "СЮДА_ВСТАВЬТЕ" in SUPABASE_KEY:
        print("⚠️ ОШИБКА: Вы забыли вставить ваш SUPABASE_SERVICE_ROLE_KEY в скрипт!")
        print("Возьмите ключ из Supabase -> Project Settings -> API -> service_role secret")
    else:
        upload_local_files()
