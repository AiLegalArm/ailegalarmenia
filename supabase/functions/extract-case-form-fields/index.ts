import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.1";
import { handleCors } from "../_shared/edge-security.ts";

const COURTS_MAP: Record<string, string> = {
  "\u0544\u0549\u0535\u0534": "\u0544\u0561\u0580\u0564\u0578\u0582 \u056b\u0580\u0561\u057e\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u056b \u0565\u057e\u0580\u043e\u043f\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576 (\u0544\u0549\u0535\u0534)",
  "\u054d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056f\u0561\u0576": "\u054d\u0561\u0570\u0574\u0561\u0576\u0561\u0564\u0580\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0573\u057c\u0561\u0562\u0565\u056f": "\u054e\u0573\u057c\u0561\u0562\u0565\u056f \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056b\u0561\u056f\u0561\u0576": "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056b\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0584\u0580\u0565\u0561\u056f\u0561\u0576": "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u057e\u0561\u0580\u0579\u0561\u056f\u0561\u0576": "\u054e\u0565\u0580\u0561\u0584\u0576\u0576\u056b\u0579 \u057e\u0561\u0580\u0579\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u0540\u0561\u056f\u0561\u056f\u0578\u057c\u0578\u0582\u057a\u0581\u056b\u0578\u0576": "\u0540\u0561\u056f\u0561\u056f\u0578\u057c\u0578\u0582\u057a\u0581\u056b\u0578\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u054e\u0561\u0580\u0579\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576": "\u054e\u0561\u0580\u0579\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
  "\u0535\u0580\u0587\u0561\u0576": "\u0535\u0580\u0587\u0561\u0576 \u0584\u0561\u0572\u0561\u0584\u056b \u0568\u0576\u0564\u0570\u0561\u0576\u0578\u0582\u0580 \u056b\u0580\u0561\u057e\u0561\u057d\u0578\u0582\u0569\u0575\u0561\u0576 \u0584\u0580\u0565\u0561\u056f\u0561\u0576 \u0564\u0561\u057f\u0561\u0580\u0561\u0576",
};

const SYSTEM_PROMPT = `Ты — юридический парсер документов для автозаполнения карточки дела в системе AI Legal Armenia (юрисдикция РА).

Тебе передаются тексты одного или нескольких загруженных файлов (включая OCR).
Тексты могут содержать документы разных стадий (первая инстанция, апелляция, кассация и т.д.).

Твоя задача — вернуть строго JSON с полями:
case_number, title, description, case_type, party_role, court_name, current_stage.

СТРОГИЕ ПРАВИЛА:

1) Верни ТОЛЬКО валидный JSON, без markdown-обёрток.
2) Ничего не выдумывай — извлекай только то, что есть в документах.
3) Если поле отсутствует — ставь null или пустую строку "".
4) PII (адреса, телефоны, паспортные данные) маскируй "***".
5) description — 3–8 предложений: предмет спора/обвинения + покрытые стадии + ключевые процессуальные действия + важные даты.

--------------------------------------------------
ОПРЕДЕЛЕНИЕ current_stage (КРИТИЧНО):

Документы могут охватывать ВСЕ стадии от первой инстанции до кассации.

Алгоритм:

1) Для каждого фрагмента определи:
   - doc_date (дата вынесения/создания/заседания)
   - stage_hint:

      cassation \u2192 "\u054E\u0573\u057C\u0561\u0562\u0565\u056F", "\u043A\u0430\u0441\u0441\u0430\u0446", "\u056F\u0561\u057D\u0561\u0581\u056B\u0578\u0576"
      appeal \u2192 "\u057E\u0565\u0580\u0561\u0584\u0576\u0576\u056B\u0579", "\u0561\u057A\u0565\u056C\u056C\u044F\u0446"
      first_instance \u2192 "\u0561\u057C\u0561\u057B\u056B\u0576 \u0561\u057F\u0575\u0561\u0576", "\u043F\u0435\u0440\u0432\u0430\u044F \u0438\u043D\u0441\u0442\u0430\u043D\u0446"
      pretrial \u2192 "\u0584\u0576\u0576\u0579\u0561\u056F\u0561\u0576", "\u0576\u0561\u056D\u0561\u0584\u0576\u0576\u0578\u0582\u0569\u0575\u0578\u0582\u0576", "\u0441\u043B\u0435\u0434\u0441\u0442\u0432"
      enforcement \u2192 "\u0534\u0531\u0540\u053F", "\u0438\u0441\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D"

2) Если есть даты:
   current_stage = стадия документа с САМЫМ ПОЗДНИМ doc_date.

3) Если дат нет:
   выбери по приоритету:
   cassation > appeal > first_instance > pretrial > enforcement > unknown

4) В description обязательно укажи:
   "Материалы охватывают стадии: <перечень>."

Допустимые значения current_stage: "pretrial", "first_instance", "appeal", "cassation", "enforcement", "unknown".

--------------------------------------------------

ОПРЕДЕЛЕНИЕ case_type:

criminal \u2192 "\u0584\u0580\u0565\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E", \u0554\u0555, \u0574\u0565\u0572\u0561\u0564\u0580\u0575\u0561\u056C
civil \u2192 "\u0584\u0561\u0572\u0561\u0584\u0561\u0581\u056B\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E", \u0570\u0561\u0575\u0581, \u057A\u0561\u0570\u0561\u0576\u057B
administrative \u2192 "\u057E\u0561\u0580\u0579\u0561\u056F\u0561\u0576 \u0563\u0578\u0580\u056E"
если конфликт — выбери по большинству явных признаков.

Допустимые значения case_type: "criminal", "civil", "administrative" или null.

--------------------------------------------------

title:

Формат: "<тип дела> — <предмет> — <инстанция>"
Пример: "Гражданское дело — компенсация вреда — кассация"
Максимум 100 символов.

--------------------------------------------------

party_role:

lawyer → если явные признаки адвокатского представительства
client → если заявитель/обвиняемый без указания роли адвоката
auditor → если аудит/проверка
иначе other

--------------------------------------------------

court_name: Полное официальное армянское название суда как указано в документе.

case_number: Паттерны: ԿԴ/1718/02/24, ԵԱԴ/1234/01/25, ԿԴ-1234-2024, XXXX/NN/NN. Верни ТОЧНЫЙ номер как написан.`;

interface FileRef {
  bucket: string;
  path: string;
  name: string;
  mime: string;
  size: number;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors.errorResponse) return cors.errorResponse;
  const corsHeaders = cors.corsHeaders!;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // User client for auth validation
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !claimsData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.user.id;

    // Service client for Storage download (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceKey);

    // --- Parse body ---
    const { files } = await req.json() as { files?: FileRef[] };
    if (!files || !Array.isArray(files) || files.length === 0) {
      return json({ success: false, error: "No files provided" }, 400);
    }

    // --- Download files from Storage and build multimodal content ---
    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: "Extract case information from the following documents:" },
    ];

    for (const fileRef of files.slice(0, 5)) {
      // Security: verify the file path belongs to the requesting user
      if (!fileRef.path.startsWith(`${userId}/`)) {
        return json({ success: false, error: "Access denied to file: " + fileRef.name }, 403);
      }

      const { data: blob, error: dlError } = await adminClient.storage
        .from(fileRef.bucket)
        .download(fileRef.path);

      if (dlError || !blob) {
        console.error(`Download failed for ${fileRef.name}:`, dlError);
        return json({ success: false, error: `Download failed: ${fileRef.name}` }, 400);
      }

      const bytes = new Uint8Array(await blob.arrayBuffer());

      if (fileRef.mime.startsWith("image/")) {
        // Image → multimodal vision
        const b64 = bytesToBase64(bytes);
        userContent.push(
          { type: "text", text: `\nDocument: "${fileRef.name}"` },
          { type: "image_url", image_url: { url: `data:${fileRef.mime};base64,${b64}` } },
        );
      } else if (fileRef.mime === "application/pdf") {
        // PDF → send as image_url with data URI (GPT-5 supports PDF input)
        const b64 = bytesToBase64(bytes);
        userContent.push(
          { type: "text", text: `\nPDF document: "${fileRef.name}"` },
          { type: "image_url", image_url: { url: `data:${fileRef.mime};base64,${b64}` } },
        );
      } else {
        // Text-based files (DOCX, TXT etc.) — decode as text
        try {
          const decoded = new TextDecoder().decode(bytes);
          userContent.push({
            type: "text",
            text: `\nDocument "${fileRef.name}":\n${decoded.slice(0, 10000)}`,
          });
        } catch {
          console.warn(`Could not decode file ${fileRef.name}`);
        }
      }
    }

    // --- Call AI ---
    const { callGatewayBypass } = await import("../_shared/gateway-bypass.ts");

    const result = await callGatewayBypass(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      {
        functionName: "extract-case-fields",
        bypassReason: "multimodal",
        timeoutMs: 120000,
      },
    );

    const aiData = result.data;
    const choices = aiData.choices as Array<Record<string, unknown>> | undefined;
    const message = (choices?.[0] as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
    const content = (message?.content as string || "").trim();

    let extracted: Record<string, string> = {};
    try {
      const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      extracted = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", content.slice(0, 300));
      return json({ success: false, error: "AI response parsing failed" }, 500);
    }

    // Normalize court_name
    if (extracted.court_name) {
      const courtLower = extracted.court_name.toLowerCase();
      for (const [key, value] of Object.entries(COURTS_MAP)) {
        if (courtLower.includes(key.toLowerCase())) {
          extracted.court_name = value;
          break;
        }
      }
    }

    // Validate case_type
    const validTypes = ["criminal", "civil", "administrative"];
    if (!validTypes.includes(extracted.case_type || "")) {
      extracted.case_type = "";
    }

    // Validate stage — map new values and legacy values
    const stageMap: Record<string, string> = {
      preliminary: "pretrial",
      echr: "unknown",
    };
    if (extracted.current_stage && stageMap[extracted.current_stage]) {
      extracted.current_stage = stageMap[extracted.current_stage];
    }
    const validStages = ["pretrial", "first_instance", "appeal", "cassation", "enforcement", "unknown"];
    if (!validStages.includes(extracted.current_stage || "")) {
      extracted.current_stage = "unknown";
    }

    return json({ success: true, fields: extracted });
  } catch (error) {
    console.error("Error in extract-case-form-fields:", error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

/** Convert Uint8Array to base64 string (Deno-compatible) */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
