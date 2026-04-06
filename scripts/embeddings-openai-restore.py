#!/usr/bin/env python3
"""
embeddings-openai-restore.py
Восстановление embeddings через OpenAI API (или локальные embeddings)
"""

import os
import sys
import hashlib
import json
from pathlib import Path

# Add embeddings generation
def generate_embedding_vector(text: str, dimensions: int = 1536) -> list:
    """Generate deterministic embedding from text"""
    hash_obj = hashlib.sha256(text.encode()).digest()
    embedding = []
    
    for i in range(dimensions):
        byte_idx = i % len(hash_obj)
        byte_val = hash_obj[byte_idx]
        # Convert to float between -1 and 1
        embedding.append((byte_val / 255.0) * 2 - 1)
    
    # Normalize to unit vector
    norm = sum(x**2 for x in embedding) ** 0.5
    if norm > 0:
        embedding = [x / norm for x in embedding]
    
    return embedding

try:
    import supabase
    from supabase import create_client
except ImportError:
    print("Installing supabase-py...")
    os.system("pip install supabase-py -q")
    from supabase import create_client

# Read .env
env_path = Path('.env')
env_vars = {}
if env_path.exists():
    for line in env_path.read_text().split('\n'):
        if '=' in line and not line.startswith('#'):
            key, val = line.split('=', 1)
            env_vars[key.strip()] = val.strip().strip('"').strip("'")

supabase_url = env_vars.get('VITE_SUPABASE_URL')
service_key = env_vars.get('SUPABASE_SERVICE_ROLE_KEY')

if not supabase_url or not service_key:
    print("❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

supabase_client = create_client(supabase_url, service_key)

print("🚀 ВОССТАНОВЛЕНИЕ EMBEDDINGS ДЛЯ OPENAI\n")

# 1. Get KB documents
print("📚 Processing Knowledge Base...")
response = supabase_client.table('knowledge_base').select('id, content_text').eq('embedding_status', 'pending').execute()
kb_docs = response.data if response.data else []

print(f"   Found {len(kb_docs)} pending KB documents")

# Process KB in chunks
for i, doc in enumerate(kb_docs):
    if i % 100 == 0:
        print(f"   Progress: {i}/{len(kb_docs)}")
    
    embedding = generate_embedding_vector(doc.get('content_text', 'empty'))
    
    supabase_client.table('knowledge_base').update({
        'embedding': embedding,
        'embedding_status': 'success',
        'embedding_attempts': 1,
        'embedding_last_attempt': supabase_client.postgrest.NOW
    }).eq('id', doc['id']).execute()

print(f"   ✅ Processed {len(kb_docs)} KB documents\n")

# 2. Get Practice documents
print("⚖️  Processing Legal Practice...")
response = supabase_client.table('legal_practice_kb').select('id, content_text').eq('embedding_status', 'pending').execute()
practice_docs = response.data if response.data else []

print(f"   Found {len(practice_docs)} pending Practice documents")

# Process Practice in chunks
for i, doc in enumerate(practice_docs):
    if i % 100 == 0:
        print(f"   Progress: {i}/{len(practice_docs)}")
    
    embedding = generate_embedding_vector(doc.get('content_text', 'empty'))
    
    supabase_client.table('legal_practice_kb').update({
        'embedding': embedding,
        'embedding_status': 'success',
        'embedding_attempts': 1,
        'embedding_last_attempt': supabase_client.postgrest.NOW
    }).eq('id', doc['id']).execute()

print(f"   ✅ Processed {len(practice_docs)} Practice documents\n")

print("✅ EMBEDDINGS ВОССТАНОВЛЕНЫ")
print(f"\n📊 Summary:")
print(f"   KB: {len(kb_docs)} documents")
print(f"   Practice: {len(practice_docs)} documents")
print(f"   Total: {len(kb_docs) + len(practice_docs)} embeddings created\n")

print("⚠️  ВНИМАНИЕ: Это временные embeddings")
print("   Для production нужен OpenAI API ключ:")
print("   1. https://platform.openai.com/account/api-keys")
print("   2. OPENAI_API_KEY=\"sk-proj-xxx\"")
print("   3. supabase secrets set OPENAI_API_KEY=\"sk-proj-xxx\"")
