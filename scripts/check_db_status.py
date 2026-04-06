#!/usr/bin/env python3
"""Check current database load status."""

import json
import os
from pathlib import Path
from urllib import error, request


def get_json(url: str, headers: dict) -> dict:
    """Fetch JSON from URL."""
    try:
        req = request.Request(url, headers=headers, method="GET")
        with request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.URLError as e:
        print(f"❌ Connection error: {e}")
        return None


def main():
    # Load environment
    supabase_url = os.getenv("SUPABASE_URL", "https://dbrhbbaoeurjveconszd.supabase.co")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    
    if not service_key:
        print("⚠️  SUPABASE_SERVICE_ROLE_KEY not set")
        print("Set it with: $env:SUPABASE_SERVICE_ROLE_KEY = 'your-key'")
        return
    
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Accept": "application/json"
    }
    
    print("=" * 60)
    print("📊 DATABASE STATUS CHECK")
    print("=" * 60)
    
    # Check knowledge_base
    print("\n📚 KNOWLEDGE_BASE:")
    kb_url = f"{supabase_url}/rest/v1/knowledge_base?select=count()&is_active=eq.true"
    kb_data = get_json(kb_url, headers)
    if kb_data:
        print(f"   Active docs: {kb_data[0]['count'] if kb_data else 'N/A'}")
    
    kb_total = f"{supabase_url}/rest/v1/knowledge_base?select=count()"
    kb_total_data = get_json(kb_total, headers)
    if kb_total_data:
        print(f"   Total docs: {kb_total_data[0]['count'] if kb_total_data else 'N/A'}")
    
    # Check legal_practice_kb
    print("\n🏛️  LEGAL_PRACTICE_KB:")
    practice_url = f"{supabase_url}/rest/v1/legal_practice_kb?select=count()&is_active=eq.true"
    practice_data = get_json(practice_url, headers)
    if practice_data:
        print(f"   Active docs: {practice_data[0]['count'] if practice_data else 'N/A'}")
    
    practice_total = f"{supabase_url}/rest/v1/legal_practice_kb?select=count()"
    practice_total_data = get_json(practice_total, headers)
    if practice_total_data:
        print(f"   Total docs: {practice_total_data[0]['count'] if practice_total_data else 'N/A'}")
    
    # Check legal_chunks
    print("\n📄 LEGAL_CHUNKS:")
    chunks_url = f"{supabase_url}/rest/v1/legal_chunks?select=count()"
    chunks_data = get_json(chunks_url, headers)
    if chunks_data:
        print(f"   Total chunks: {chunks_data[0]['count'] if chunks_data else 'N/A'}")
    
    # Check practice jobs
    print("\n⚙️  PRACTICE_CHUNK_JOBS:")
    jobs_pending = f"{supabase_url}/rest/v1/practice_chunk_jobs?select=count()&status=eq.pending"
    jobs_pending_data = get_json(jobs_pending, headers)
    if jobs_pending_data:
        print(f"   Pending jobs: {jobs_pending_data[0]['count'] if jobs_pending_data else '0'}")
    
    jobs_processing = f"{supabase_url}/rest/v1/practice_chunk_jobs?select=count()&status=eq.processing"
    jobs_proc_data = get_json(jobs_processing, headers)
    if jobs_proc_data:
        print(f"   Processing jobs: {jobs_proc_data[0]['count'] if jobs_proc_data else '0'}")
    
    jobs_completed = f"{supabase_url}/rest/v1/practice_chunk_jobs?select=count()&status=eq.completed"
    jobs_comp_data = get_json(jobs_completed, headers)
    if jobs_comp_data:
        print(f"   Completed jobs: {jobs_comp_data[0]['count'] if jobs_comp_data else '0'}")
    
    # Check legal_documents
    print("\n📖 LEGAL_DOCUMENTS:")
    docs_url = f"{supabase_url}/rest/v1/legal_documents?select=count()"
    docs_data = get_json(docs_url, headers)
    if docs_data:
        print(f"   Total documents: {docs_data[0]['count'] if docs_data else 'N/A'}")
    
    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
