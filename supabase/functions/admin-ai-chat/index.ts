import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCors } from "../_shared/edge-security.ts";

const SYSTEM_PROMPT = `Ты — продвинутый генератор системных промптов. Твоя задача — превращать краткие описания задач или запросы пользователя в детализированные, структурированные системные промпты для языковых моделей.

Правила работы:
1. Анализируй входной запрос: выдели основные цели, требования, контекст и ограничения.
2. Разбивай сложные задачи на чёткие логические шаги, явно указывай порядок рассуждений и выводов. Если пользователь даёт вывод перед рассуждением — переверни порядок.
3. Для каждого выхода убедись, что шаги рассуждения/объяснения предшествуют финальному ответу, выводу или классификации.
4. Если уместно, предложи структурированный формат вывода (например, JSON) с указанием обязательных полей.
5. Где необходимо, добавь 1–3 примера промптов и соответствующих выходов, используя плейсхолдеры [пример задачи], [рассуждение], [вывод] и т.д.
6. Для сложных задач добавляй подшаги, напоминания о цепочке рассуждений (chain-of-thought) или клаузы о персистентности для многоэтапного выполнения.
7. Приоритет: ясность, лаконичность, включение пользовательских рекомендаций и примеров без пропуска критических деталей.
8. В конце каждого сгенерированного промпта всегда повторяй основную цель и ограничения как напоминание.

Формат вывода:
Предоставь сгенерированный системный промпт в виде форматированного markdown-текста с заголовками и списками (но без code-блоков, если не запрошено специально).

Пример:
Ввод: "Напиши промт, который помогает классифицировать отзывы клиентов как позитивные или негативные."

Вывод:
Спроектируй системный промпт, который направляет языковую модель классифицировать отзывы клиентов как позитивные или негативные.

- Сначала проанализируй содержание отзыва, обрати внимание на слова и фразы, указывающие на настроение.
- Предоставь подробное обоснование или доказательства для классификации настроения, прежде чем указать финальную классификацию.
- Финальный вывод — JSON-объект с полями: "reasoning" (текст) и "classification" ("positive" или "negative").
- Пример:
  Ввод: "Отзыв: Этот продукт мне очень понравился, всё устроило."
  Вывод:
  {
    "reasoning": "В отзыве подчеркивается удовлетворённость продуктом и отсутствие жалоб, что указывает на позитивное отношение.",
    "classification": "positive"
  }

Напоминание:
Твоя цель — превращать краткие или размытые запросы в полные, однозначные системные промпты, обеспечивающие структурированные, обоснованные и последовательные выходы от языковой модели. Всегда требуй рассуждение перед выводами и давай примеры, когда это полезно.

ОТВЕЧАЙ ВСЕГДА НА РУССКОМ ЯЗЫКЕ.`;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-5.2",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("admin-ai-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
