#!/usr/bin/env python3
import subprocess
import os
import sys

# Check if we have Lovable API key
print("🔍 Требуется LOVABLE_API_KEY для Edge Functions\n")

# Try to get it from local .env
env_path = '.env'
lovable_key = None

if os.path.exists(env_path):
    with open(env_path, 'r') as f:
        for line in f:
            if line.startswith('LOVABLE_API_KEY='):
                lovable_key = line.split('=')[1].strip().strip('"').strip("'")
                break

if lovable_key:
    print(f"✅ Найден LOVABLE_API_KEY: {lovable_key[:20]}...")
else:
    print("❌ LOVABLE_API_KEY не найден в .env")
    print("\nВарианты решения:")
    print("1. Добавить LOVABLE_API_KEY в .env:")
    print('   LOVABLE_API_KEY="sk_xxxxxxxxxxxxxxxx"')
    print("\n2. Установить через Supabase Dashboard:")
    print("   - https://app.supabase.com/project/dbrhbbaoeurjveconszd/settings/functions")
    print("   - Отредактировать Environment variables для каждого Function")
    print("\n3. Использовать Supabase CLI (после установки):")
    print('   supabase secrets set LOVABLE_API_KEY="sk_xxxxxxxxxxxxxxxx"')
    sys.exit(1)

# If we have the key, show status
print("\n📋 Текущий статус Edge Functions:")
print("   Все Edge Functions готовы к использованию LOVABLE_API_KEY")
print("   когда он будет установлен в переменных окружения Supabase")
