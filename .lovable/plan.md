## Подключение Lovable AI Gateway

### Текущее состояние
- `LOVABLE_API_KEY` уже настроен в секретах ✅
- Маршрутизация в `supabase/functions/_shared/openai-router.ts` + `ai-provider.ts` поддерживает 3 провайдера: `gateway` (Lovable), `openai` (прямой), `openrouter`
- В таблице `app_settings` ключа `ai_provider` **нет** → код по умолчанию использует `gateway`, но это неявно
- Хардкод-исключения: эмбеддинги (`generate-embeddings`, `practice-embed-worker`) принудительно идут в OpenAI (нужен `text-embedding-3-small`)

### Что сделаю
1. Записать в `public.app_settings` явную строку `('ai_provider', 'gateway')`, чтобы все функции гарантированно шли через Lovable AI Gateway.
2. Очистить `_provider_cache` (5-секундный кэш сам обновится — отдельных действий не нужно).
3. Проверить через `supabase--curl_edge_functions` один из роутеров (`legal-chat` ping), чтобы убедиться, что вызов идёт через `ai.gateway.lovable.dev` без 401/402.

### Карта моделей: что куда подключено и зачем

| Функция / роль | Модель через Lovable Gateway | Зачем именно эта модель |
|---|---|---|
| `ai-analyze` (анализ дела) | `anthropic/claude-3.5-sonnet` | Длинные армянские юр. тексты, аккуратное цитирование, сильное «justification» |
| `multi-agent-analyze` | `anthropic/claude-3.5-sonnet` | Многошаговое рассуждение нескольких агентов с большим окном |
| `generate-complaint` | `anthropic/claude-3.5-sonnet` | Драфтинг жалоб (низкая температура 0.1, юр. формулировки) |
| `legal-chat` | `anthropic/claude-3.5-sonnet` | RAG-чат: точность ссылок + связные ответы |
| `analyze-files-for-complaint` | `anthropic/claude-3.5-sonnet` | Разбор материалов дела перед генерацией жалобы |
| `generate-document` | `anthropic/claude-3.5-sonnet` | Генерация юр. документов |
| `admin-ai-chat` | `anthropic/claude-3.5-sonnet` | Админ-ассистент по БД и операциям |
| `echr-translate`, `translate-to-armenian`, `map-reduce-summarize` | `anthropic/claude-3.5-sonnet` | Армянский требует сильной модели для качества перевода и сжатия |
| `extract-case-fields` | `google/gemini-2.5-pro` | Строгий JSON, дешевле Claude, хорошо удерживает схему |
| `kb-search-assistant` | `google/gemini-2.5-pro` (json_mode) | Короткие JSON-ключи поиска |
| `legal-practice-import`, `prompt-armor-repair` | `google/gemini-2.5-pro` | Структурированное извлечение / починка JSON |
| `ai-analyze:precedent_citation / cross_exam / deadline_rules / law_update_summary` | `google/gemini-2.5-pro` | Под-роли с жёстким JSON-выходом |
| `audio-transcribe`, `ocr-process`, `kb-scrape-batch`, `kb-fetch-pdf-content` | `google/gemini-2.5-flash` | Мультимодал (vision/аудио), быстро и дёшево, идёт через `gateway-bypass.ts` |
| `legal-practice-enrich`, `vector-search-rerank`, `practice-ai-enrich-worker` | `openai/gpt-4.1-mini` | Дешёвый rerank/обогащение карточек практики |
| `generate-embeddings` | `openai/text-embedding-3-small` (прямой OpenAI, **не** через шлюз) | pgvector завязан на 1536-dim вектор OpenAI; смена сломает индексы |

### Технические детали
- Файлы менять не нужно — провайдер выбирается рантаймом из `app_settings`.
- Изменение применится через ≤5 секунд (TTL кэша провайдера в `ai-provider.ts`).
- Прямые вызовы OpenAI для эмбеддингов остаются — это сознательный архитектурный выбор (см. memory `cross-provider-compatibility`).
- `OPENROUTER_API_KEY` остаётся в секретах как «аварийный» путь, но не используется, пока `ai_provider = gateway`.

### Верификация
- `SELECT * FROM app_settings WHERE key='ai_provider'` → должно вернуть `gateway`
- `curl_edge_functions` POST на `legal-chat` (короткий запрос) → 200 OK, в логах `model_used: anthropic/claude-3.5-sonnet`, `endpoint: ai.gateway.lovable.dev`
