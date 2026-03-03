# Pipeline Setup Roadmap (v2)

## Current State
- Orchestrator boots every minute but silently fails (522 errors)
- Workers get 522 Connection timed out from Supabase RPC
- cron-job.org times out at 30s
- Supabase infra experiencing transient connection issues

---

## Phase 1: Harden Orchestrator ✏️
- [ ] Add fetch timeout (25s per worker call)
- [ ] Add retry logic for 5xx/522 errors
- [ ] Improve error logging
- [ ] Return partial results even if some workers fail

## Phase 2: Harden Workers ✏️
- [ ] Handle HTML error responses (522 returns HTML)
- [ ] Add graceful degradation on transient errors

## Phase 3: External Cron Setup (cron-job.org) ⚙️
- [ ] Set timeout to 120-180 seconds
- [ ] Verify x-internal-key header matches CRON_WORKER_KEY
- [ ] Test successful 200 response

## Phase 4: Verify End-to-End ✅
- [ ] Check orchestrator logs show stage=chunk/embed/enrich
- [ ] Check worker logs show picked > 0
- [ ] Confirm pipeline processes documents automatically

---

## Secrets Checklist
- CRON_WORKER_KEY — set in Lovable, must match cron-job.org header
- INTERNAL_INGEST_KEY — used by orchestrator→worker calls
- OPENAI_API_KEY — used by embed and enrich workers
