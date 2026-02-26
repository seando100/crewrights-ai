import { openai } from "./openai";
import { supabaseServer } from "./supabaseServer";

export interface CBAChunkMetadata {
  chunk_index: number;
  section_number: string | null;
  section_title: string | null;
}

export interface CBAChunk {
  text_content: string;
  metadata: CBAChunkMetadata;
  similarity: number;
}

export async function queryCBA(
  question: string,
  airline: string,
  contractVersion: string
): Promise<CBAChunk[]> {
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: question,
  });

  const embedding = embeddingResponse.data[0].embedding;

  const { data, error } = await supabaseServer.rpc("match_cba_chunks", {
    query_embedding: embedding,
    filter_airline: airline,
    filter_contract_version: contractVersion,
    match_count: 5,
  });

  if (error) {
    throw new Error(`Vector search failed: ${error.message}`);
  }

  const rows: unknown[] = data ?? [];

  return rows.map((row) => {
    if (
      typeof (row as Record<string, unknown>).text_content !== "string" ||
      typeof (row as Record<string, unknown>).similarity !== "number" ||
      typeof (row as Record<string, unknown>).metadata !== "object" ||
      (row as Record<string, unknown>).metadata === null
    ) {
      throw new Error("Malformed CBA chunk returned from database");
    }

    const metadata = (row as Record<string, unknown>).metadata as Record<string, unknown>;

    if (
      typeof metadata.chunk_index !== "number" ||
      (metadata.section_number !== null && typeof metadata.section_number !== "string") ||
      (metadata.section_title !== null && typeof metadata.section_title !== "string")
    ) {
      throw new Error("Malformed CBA chunk returned from database");
    }

    return {
      text_content: (row as Record<string, unknown>).text_content as string,
      similarity: (row as Record<string, unknown>).similarity as number,
      metadata: {
        chunk_index: metadata.chunk_index as number,
        section_number: metadata.section_number as string | null,
        section_title: metadata.section_title as string | null,
      },
    };
  });
}
