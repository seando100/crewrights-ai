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

// Fetch neighboring chunks from the same section around an anchor chunk_index.
// Context chunks get similarity = 0 so primary vector matches still dominate ordering.
async function fetchSectionContext(
  sectionNumber: string,
  anchorChunkIndex: number,
  airline: string,
  contractVersion: string
): Promise<CBAChunk[]> {
  const { data, error } = await supabaseServer
    .from("cba_chunks")
    .select("text_content, metadata")
    .eq("airline", airline)
    .eq("contract_version", contractVersion)
    .filter("metadata->>section_number", "eq", sectionNumber)
    .limit(100);

  if (error || !data) return [];

  const minIndex = anchorChunkIndex - 3;
  const maxIndex = anchorChunkIndex + 6;

  return (data as { text_content: unknown; metadata: unknown }[])
    .filter((row) => {
      const meta = row.metadata as Record<string, unknown>;
      const idx = meta?.chunk_index;
      return typeof idx === "number" && idx >= minIndex && idx <= maxIndex;
    })
    .sort((a, b) => {
      const idxA = ((a.metadata as Record<string, unknown>).chunk_index as number);
      const idxB = ((b.metadata as Record<string, unknown>).chunk_index as number);
      return idxA - idxB;
    })
    .slice(0, 20)
    .map((row) => {
      const meta = row.metadata as Record<string, unknown>;
      return {
        text_content: row.text_content as string,
        similarity: 0,
        metadata: {
          chunk_index: meta.chunk_index as number,
          section_number: (meta.section_number as string | null) ?? null,
          section_title: (meta.section_title as string | null) ?? null,
        },
      };
    });
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
    match_count: 8,
  });

  if (error) {
    throw new Error(`Vector search failed: ${error.message}`);
  }

  const rows: unknown[] = data ?? [];

  const primaryMatches: CBAChunk[] = rows.map((row) => {
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

  // ── Section context expansion ───────────────────────────────────────────
  // For the top 1-2 vector matches, pull neighboring chunks from the same
  // section so the model can see the full rule structure (thresholds, tiers,
  // exceptions) rather than just the single closest chunk.
  if (primaryMatches.length > 0) {
    // Build a map of section_number → anchor chunk_index (first occurrence wins)
    const sectionAnchors = new Map<string, number>();
    for (const match of primaryMatches.slice(0, 2)) {
      const sec = match.metadata.section_number;
      if (sec && !sectionAnchors.has(sec)) {
        sectionAnchors.set(sec, match.metadata.chunk_index);
      }
    }

    try {
      const contextResults = await Promise.all(
        Array.from(sectionAnchors.entries()).map(([sectionNumber, anchorIndex]) =>
          fetchSectionContext(sectionNumber, anchorIndex, airline, contractVersion)
        )
      );

      // Merge: primary matches first (preserve similarity order), then context
      const seenIndices = new Set(primaryMatches.map((m) => m.metadata.chunk_index));
      const merged = [...primaryMatches];

      for (const chunk of contextResults.flat()) {
        if (!seenIndices.has(chunk.metadata.chunk_index)) {
          seenIndices.add(chunk.metadata.chunk_index);
          merged.push(chunk);
        }
      }

      return merged;
    } catch {
      // Section context fetch failed — return primary matches unchanged
      return primaryMatches;
    }
  }

  return primaryMatches;
}
