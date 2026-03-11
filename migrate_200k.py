import os
import time
import requests

# ==============================================================================
# КОНФИГУРАЦИЯ БАЗ (ЗАПОЛНИ СВОИМИ ДАННЫМИ)
# ==============================================================================

# 1. ТЕСТОВАЯ БАЗА (ОТКУДА БЕРЕМ 200 000 ДОКУМЕНТОВ)
OLD_URL = "https://<ТВОЙ_СТАРЫЙ_ПРОЕКТ>.supabase.co"
OLD_KEY = "ey..." # Service Role Key от старой базы

# 2. БОЕВАЯ БАЗА (КУДА ЛЬЕМ ДОКУМЕНТЫ)
NEW_URL = "https://dbrhbbaoeurjveconszd.supabase.co"
NEW_KEY = "ey..." # Service Role Key от текущей базы 
# (можешь взять его из твоего локального .env файла)

# ==============================================================================

HEADERS_OLD = {
    "apikey": OLD_KEY,
    "Authorization": f"Bearer {OLD_KEY}",
    "Content-Type": "application/json",
    "Prefer": "count=exact"
}

HEADERS_NEW = {
    "apikey": NEW_KEY,
    "Authorization": f"Bearer {NEW_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal" # Чтобы не жрал память при вставке
}

def migrate_table(table_name, batch_size=1000):
    print(f"\n🚀 Начинаем перенос таблицы: {table_name}")
    
    # 1. Узнаем сколько всего записей
    res = requests.get(f"{OLD_URL}/rest/v1/{table_name}?select=id", headers=HEADERS_OLD)
    content_range = res.headers.get("content-range", "")
    if not content_range:
        print(f"Таблица {table_name} пуста или нет доступа.")
        return
        
    total_records = int(content_range.split("/")[1])
    print(f"📊 Всего записей найдено: {total_records}")
    
    offset = 0
    while offset < total_records:
        start_time = time.time()
        print(f"⏳ Скачиваем записи {offset} - {offset + batch_size}...")
        
        # Скачиваем пачку
        res_data = requests.get(
            f"{OLD_URL}/rest/v1/{table_name}?select=*",
            headers=HEADERS_OLD,
            params={"offset": offset, "limit": batch_size}
        )
        
        data = res_data.json()
        if not data:
            break
            
        # Загружаем пачку в новую базу
        insert_res = requests.post(
            f"{NEW_URL}/rest/v1/{table_name}",
            headers=HEADERS_NEW,
            json=data
        )
        
        if insert_res.status_code >= 400:
            print(f"❌ Ошибка вставки: {insert_res.text}")
            break
            
        offset += batch_size
        print(f"✅ Перенесено {offset}/{total_records} (за {round(time.time() - start_time, 2)} сек)")

print("=== ЗАПУСК МИГРАЦИИ 200 000 ДОКУМЕНТОВ ===")
# Сначала переносим сами документы
migrate_table("knowledge_base", 1000)
migrate_table("legal_practice_kb", 1000)

# Потом переносим чанки (если они там есть)
migrate_table("knowledge_base_chunks", 1000)
migrate_table("legal_practice_kb_chunks", 1000)

print("\n🎉 Миграция успешно завершена!")
