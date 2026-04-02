# Production-аудит кодовой базы AiLegalArmenia
## Глубокий статический анализ — 15 февраля 2026

---

## 1. РЕЗЮМЕ

| Категория | Критич. | Высокий | Средний | Низкий |
|-----------|---------|---------|---------|--------|
| Безопасность | 2 | 3 | 4 | 2 |
| Архитектура | 0 | 2 | 3 | 2 |
| Производительность | 0 | 1 | 2 | 3 |
| Надёжность | 0 | 2 | 2 | 1 |
| **Итого** | **2** | **8** | **11** | **8** |

**Общая оценка: 7.2 / 10** — система зрелая, с глубокой безопасностью AI-слоя, но с несколькими критическими пробелами в CORS и PWA-кэшировании.

---

## 2. БЕЗОПАСНОСТЬ

### 🔴 КРИТИЧЕСКИЕ

#### SEC-CRIT-1: Wildcard CORS на всех Edge Functions
**Файлы:** 28 edge functions  
**Проблема:** Все функции используют `"Access-Control-Allow-Origin": "*"`, несмотря на наличие готового модуля `edge-security.ts` с fail-closed CORS allowlist.  
**Риск:** Любой домен может вызывать API от имени залогиненного пользователя (CSRF-атака через bearer token).  
**Рекомендация:** Мигрировать все функции на `getCorsHeaders()` из `_shared/edge-security.ts`. Настроить `ALLOWED_ORIGINS` как секрет с перечислением production-доменов.

#### SEC-CRIT-2: PWA Workbox кэширует устаревший домен Supabase
**Файл:** `vite.config.ts:50`  
**Проблема:** `runtimeCaching` настроен на домен `dbrhbbaoeurjveconszd.supabase.co`, который не соответствует текущему проекту (`dbrhbbaoeurjveconszd`).  
**Риск:** Кэш не работает для текущего API, но потенциально может кэшировать stale-ответы при смене проекта.  
**Рекомендация:** Обновить паттерн на текущий домен или использовать `import.meta.env.VITE_SUPABASE_URL`.

### 🟠 ВЫСОКИЕ

#### SEC-HIGH-1: Расширения PostgreSQL в public-схеме
**Источник:** Supabase Linter (WARN 1, 2)  
**Проблема:** Extensions установлены в `public` вместо отдельной схемы (напр. `extensions`).  
**Риск:** Пользователи с доступом к `public` получают доступ к функциям расширений.  
**Рекомендация:** Мигрировать расширения в схему `extensions`.

#### SEC-HIGH-2: Overly permissive RLS policy (USING true)
**Источник:** Supabase Linter (WARN 3)  
**Проблема:** Хотя бы одна таблица имеет INSERT/UPDATE/DELETE policy с `USING (true)`.  
**Рекомендация:** Провести ревью всех RLS-политик с `true` и ограничить до конкретных ролей.

#### SEC-HIGH-3: Leaked password protection отключена
**Источник:** Supabase Linter (WARN 4)  
**Проблема:** Пользователи могут использовать скомпрометированные пароли.  
**Рекомендация:** Включить через Cloud настройки Auth.

### 🟡 СРЕДНИЕ

#### SEC-MED-1: `(supabase as any).rpc('soft_delete_case_file', ...)` 
**Файл:** `src/hooks/useCaseFiles.ts:119`  
**Проблема:** Кастинг к `any` для обхода типизации. RPC может не существовать или иметь другую сигнатуру.  
**Рекомендация:** Добавить RPC в типы или использовать `.rpc()` с правильной типизацией.

#### SEC-MED-2: `remember_me` — сессия в sessionStorage без очистки
**Файл:** `src/pages/Login.tsx:80-87`  
**Проблема:** При `rememberMe=false` данные перемещаются из localStorage в sessionStorage. Однако Supabase SDK продолжает использовать localStorage (конфиг `client.ts`), что может привести к рассинхронизации.  
**Рекомендация:** Либо конфигурировать `storage` в Supabase-клиенте динамически, либо удалить логику `rememberMe`.

#### SEC-MED-3: Телефонный номер в Login.tsx захардкожен
**Файл:** `src/pages/Login.tsx:214`  
**Проблема:** Номер `+374 10 123 456` выглядит как заглушка, не как реальный контактный номер.  
**Рекомендация:** Использовать i18n-ключ или env-переменную.

#### SEC-MED-4: `generate-document` использует `supabase` без объявления
**Файл:** `supabase/functions/generate-document/index.ts:85`  
**Проблема:** Переменная `supabase` используется в вызове `dualSearch({ supabase, ... })`, но не объявлена в скоупе. `createClient` вызывается только для `authClient`.  
**Риск:** Runtime-ошибка `ReferenceError: supabase is not defined` при любом запросе генерации документа с RAG.  
**Рекомендация:** Добавить создание service_role клиента перед блоком RAG.

### 🟢 НИЗКИЕ

#### SEC-LOW-1: `dangerouslySetInnerHTML` используется только в chart.tsx (shadcn)
Не является пользовательским вводом — безопасно.

#### SEC-LOW-2: No rate limiting на frontend
Нет debounce/throttle на критических формах (login, chat).

---

## 3. АРХИТЕКТУРА

### 🟠 ВЫСОКИЕ

#### ARCH-HIGH-1: QueryClient без кастомных настроек
**Файл:** `src/App.tsx:29`  
**Проблема:** `new QueryClient()` без `defaultOptions` — retry 3 раза, staleTime = 0, refetch на фокус окна.  
**Влияние:** Избыточные запросы к API, особенно при переключении вкладок.  
**Рекомендация:**
```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

#### ARCH-HIGH-2: Дублирование auth-логики
**Файлы:** `useAuth.ts`, `ProtectedRoute.tsx`  
**Проблема:** Оба модуля независимо вызывают `supabase.auth.getSession()` и `onAuthStateChange()`. `ProtectedRoute` не использует `useAuth()`, создавая две конкурирующие подписки.  
**Рекомендация:** Ввести `AuthProvider` (React Context) и использовать единую подписку.

### 🟡 СРЕДНИЕ

#### ARCH-MED-1: Монолитные Edge Functions
**Файлы:** `legal-practice-import/index.ts` (919 строк), `ai-analyze/index.ts` (810+ строк)  
**Проблема:** Сложно тестировать, отлаживать, добавлять функциональность.  
**Рекомендация:** Вынести бизнес-логику в отдельные модули, оставив в `index.ts` только роутинг.

#### ARCH-MED-2: Дуализм хранения (knowledge_base vs legal_documents)
Две параллельные системы хранения нормативных текстов усложняют поиск и обновление.  
**Рекомендация:** Задокументировать чёткие границы и миграционный план.

#### ARCH-MED-3: i18n — двойной импорт конфигурации
**Файлы:** `src/main.tsx:5`, `src/App.tsx:10`  
**Проблема:** `import "@/i18n/config"` вызывается дважды.  
**Рекомендация:** Удалить из `App.tsx` (достаточно в `main.tsx`).

### 🟢 НИЗКИЕ

#### ARCH-LOW-1: Lazy loading правильно реализован
Dashboard, AdminPanel и другие тяжёлые страницы загружаются по требованию.

#### ARCH-LOW-2: Skip-to-content ссылка присутствует
Accessibility baseline соблюдён.

---

## 4. ПРОИЗВОДИТЕЛЬНОСТЬ

### 🟠 ВЫСОКИЕ

#### PERF-HIGH-1: `useBulkImport` — последовательная обработка
**Файл:** `src/hooks/useBulkImport.ts:290`  
**Проблема:** Файлы обрабатываются строго последовательно (for...of + await).  
**Рекомендация:** Параллельная обработка с ограничением concurrency (Promise.allSettled + semaphore, batch по 3-5).

### 🟡 СРЕДНИЕ

#### PERF-MED-1: `useAuth()` — три подписки на каждом рендере
Каждый вызов `useAuth()` создаёт новый `useEffect` с подпиской. При использовании в нескольких компонентах — множественные подписки.

#### PERF-MED-2: `buildPreview()` пересоздаётся при каждом рендере
**Файл:** `ImportWizard.tsx:190`  
Зависит от `source, files, url, urlList, pastedText, jsonlRecords, options` — но вызывается только на шаге 3→4.

### 🟢 НИЗКИЕ

#### PERF-LOW-1: `useMemo` для `normalizeUsername` не нужен
**Файл:** `Login.tsx:47`  
Чистая функция без вычислительной нагрузки — `useMemo` без пользы.

#### PERF-LOW-2: React.forwardRef в UI-компонентах
Все shadcn-компоненты используют `forwardRef` — корректно.

#### PERF-LOW-3: Отсутствует React.StrictMode
`src/main.tsx` не оборачивает `<App />` в `<StrictMode>`.

---

## 5. НАДЁЖНОСТЬ

### 🟠 ВЫСОКИЕ

#### REL-HIGH-1: Нет глобального Error Boundary
**Файл:** `src/App.tsx`  
**Проблема:** Необработанная ошибка в любом lazy-loaded компоненте крашит всё приложение.  
**Рекомендация:** Обернуть `<Routes>` в `<ErrorBoundary>` с фоллбэком.

#### REL-HIGH-2: Edge Functions не имеют таймаутов на AI-вызовы
**Файлы:** Все `fetch("https://ai.gateway.lovable.dev/...")` вызовы.  
**Проблема:** При зависании AI gateway функция держит соединение до таймаута Deno (по умолчанию 150 сек).  
**Рекомендация:** Использовать `AbortController` с таймаутом 30-60 сек.

### 🟡 СРЕДНИЕ

#### REL-MED-1: `ProtectedRoute` не обрабатывает expired session
Если сессия истекла между `getSession()` и рендером, пользователь может увидеть мгновенный flash контента перед редиректом.

#### REL-MED-2: Отсутствие retry-логики в edge functions при 429
При rate limit AI gateway функции возвращают ошибку, но не ретраят с экспоненциальным backoff.

### 🟢 НИЗКИЕ

#### REL-LOW-1: `clearAll()` в useBulkImport правильно синхронизирует ref и state
Реализация корректна.

---

## 6. AI-СПЕЦИФИЧНЫЕ ПРОВЕРКИ

### ✅ Prompt Injection Protection — ЗРЕЛАЯ
- `prompt-armor.ts`: 15+ паттернов детекции, нейтрализация, логирование
- Fenced data blocks (`BEGIN USER DATA / END USER DATA`)
- `ANTI_INJECTION_RULES` добавляется ко всем системным промптам
- JSON output validation + repair pass через lightweight модель

### ✅ RAG Pipeline — PRODUCTION-GRADE
- Гибридный поиск (vector + keyword) через `dualSearch()`
- Token budget limiter (`applyBudgets()`) для контроля контекста
- Temporal filtering по дате дела
- PII redaction для логов

### ✅ Model Config — ЦЕНТРАЛИЗОВАННАЯ
- `model-config.ts` определяет все модели и параметры
- Единый gateway `ai.gateway.lovable.dev`
- Structured logging через `safe-logger.ts`

### ⚠️ Hallucination Guard — НУЖДАЕТСЯ В УСИЛЕНИИ
- Модели иногда игнорируют `DATA_GAP` инструкцию и заполняют пробелы
- Нет post-processing проверки наличия `_____` маркеров в выходе
- **Рекомендация:** Добавить валидацию в edge functions перед возвратом ответа

---

## 7. МАТРИЦА ПРИОРИТЕТОВ

| # | Найдено | Приоритет | Усилие |
|---|---------|-----------|--------|
| SEC-CRIT-1 | Wildcard CORS | P0 | 2-3ч |
| SEC-MED-4 | `supabase` undefined в generate-document | P0 | 15м |
| SEC-CRIT-2 | PWA кэш неверный домен | P1 | 15м |
| REL-HIGH-1 | Нет ErrorBoundary | P1 | 30м |
| ARCH-HIGH-1 | QueryClient defaults | P1 | 15м |
| ARCH-HIGH-2 | Auth Provider | P2 | 2ч |
| SEC-HIGH-3 | Leaked password protection | P2 | 5м |
| REL-HIGH-2 | AI timeout | P2 | 1ч |
| PERF-HIGH-1 | Параллельный bulk import | P3 | 2ч |
| ARCH-MED-1 | Рефакторинг edge functions | P3 | 4ч |

---

## 8. ЧТО РЕАЛИЗОВАНО ХОРОШО

1. **RLS на всех 36 таблицах** — 100% покрытие, все таблицы имеют `rowsecurity = true` с от 1 до 9 политик
2. **Auth guard на всех AI-функциях** — Bearer token проверяется через `getUser()`
3. **Модульная система промптов** — разделение по типам анализа, ролям, юрисдикциям
4. **Lazy loading** — тяжёлые страницы загружаются по требованию
5. **i18n** — 3 языка (HY, RU, EN) с полным покрытием
6. **Input sanitization** — глубокая очистка Unicode, NUL-байтов, управляющих символов
7. **Audit logging** — таблица `audit_logs` с IP, user_agent, действием
8. **PII encryption** — отдельная таблица `encrypted_pii` с IV
9. **Soft delete** — кейсы и файлы используют `deleted_at` вместо физического удаления
10. **Service Role Key** не утекает на фронтенд (проверено: 0 вхождений в `src/`)

---

*Отчёт сгенерирован: 15.02.2026*  
*Охват: 36 таблиц, 28 edge functions, ~200 компонентов, ~50 000 LOC*
