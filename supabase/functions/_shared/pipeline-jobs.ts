import { callInternalFunction } from "./edge-security.ts";

export type PipelineSourceTable = "knowledge_base" | "legal_practice_kb";
type PipelineJobType = "chunk" | "embed" | "enrich";

interface QueuePipelineJobsParams {
  supabase: {
    from: (table: string) => {
      upsert: (values: Record<string, unknown>[], options?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
  };
  sourceTable: PipelineSourceTable;
  documentIds: string[];
  enqueueEmbed?: boolean;
  enqueueEnrich?: boolean;
  resetExisting?: boolean;
  triggerOrchestrator?: boolean;
}

const UPSERT_BATCH_SIZE = 500;

function buildJobRows(
  documentIds: string[],
  sourceTable: PipelineSourceTable,
  jobType: PipelineJobType,
): Record<string, unknown>[] {
  return documentIds.map((documentId) => ({
    document_id: documentId,
    source_table: sourceTable,
    job_type: jobType,
    status: "pending",
    attempts: 0,
    last_error: null,
    started_at: null,
    completed_at: null,
  }));
}

async function upsertJobs(
  supabase: QueuePipelineJobsParams["supabase"],
  rows: Record<string, unknown>[],
  resetExisting: boolean,
): Promise<number> {
  let queued = 0;

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await supabase
      .from("practice_chunk_jobs")
      .upsert(batch, {
        onConflict: "document_id,source_table,job_type",
        ignoreDuplicates: !resetExisting,
      });

    if (error) {
      throw new Error(`Failed to queue pipeline jobs: ${error.message}`);
    }

    queued += batch.length;
  }

  return queued;
}

export async function queuePipelineJobs({
  supabase,
  sourceTable,
  documentIds,
  enqueueEmbed = true,
  enqueueEnrich = sourceTable === "legal_practice_kb",
  resetExisting = false,
  triggerOrchestrator = true,
}: QueuePipelineJobsParams): Promise<{ chunk: number; embed: number; enrich: number }> {
  if (documentIds.length === 0) {
    return { chunk: 0, embed: 0, enrich: 0 };
  }

  const uniqueIds = [...new Set(documentIds)];

  const chunk = await upsertJobs(
    supabase,
    buildJobRows(uniqueIds, sourceTable, "chunk"),
    resetExisting,
  );

  const embed = enqueueEmbed
    ? await upsertJobs(
        supabase,
        buildJobRows(uniqueIds, sourceTable, "embed"),
        resetExisting,
      )
    : 0;

  const enrich = enqueueEnrich
    ? await upsertJobs(
        supabase,
        buildJobRows(uniqueIds, sourceTable, "enrich"),
        resetExisting,
      )
    : 0;

  if (triggerOrchestrator) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (supabaseUrl) {
      callInternalFunction(
        `${supabaseUrl}/functions/v1/practice-pipeline-orchestrator`,
        { source_table: sourceTable },
        { timeoutMs: 10_000 },
      ).catch((error) => {
        console.warn(
          `[pipeline-jobs] orchestrator kick failed for ${sourceTable}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
  }

  return { chunk, embed, enrich };
}
