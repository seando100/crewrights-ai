import { openai } from "./openai";
import { supabaseServer } from "./supabaseServer";

export interface CBAChunk {
  text_content: string;
  metadata: Record<string, unknown>;
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

  return (data as CBAChunk[]) ?? [];
}
