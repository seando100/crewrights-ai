import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

function detectSectionHeader(line: string) {
  const match = line.match(/^SECTION\s+(\d+)\s*[-–—]\s*(.+)$/i);
  if (!match) return null;

  return {
    section_number: match[1],
    section_title: match[2].trim(),
  };
}

function cleanText(text: string): string {
  return text
    // Remove page markers like "-- 12 of 345 --"
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "")
    // Remove lines that are only numbers and whitespace
    .replace(/^\s*[\d]+\s*$/gm, "")
    // Collapse runs of more than 2 blank lines into 2
    .replace(/(\n\s*){3,}/g, "\n\n");
}

function chunkText(text: string, maxChars = 1400): string[] {
  const paras = text
    .split(/\n\s*\n/g)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buffer = "";

  for (const p of paras) {
    if ((buffer + " " + p).length > maxChars) {
      if (buffer.trim()) chunks.push(buffer.trim());
      buffer = p;
    } else {
      buffer = buffer ? `${buffer}\n\n${p}` : p;
    }
  }

  if (buffer.trim()) chunks.push(buffer.trim());

  return chunks;
}

async function embed(text: string) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return response.data[0].embedding;
}

async function main() {
  console.log("Ingestion starting...");

  const pdfPath = path.join(
    process.cwd(),
    "data",
    "2024-CBA_121724.pdf"
  );

  if (!fs.existsSync(pdfPath)) {
    throw new Error("PDF not found at /data/2024-CBA_121724.pdf");
  }

  const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
  const data = await parser.getText();
  await parser.destroy();
  const rawText = data.text;

  const lines = rawText.split("\n");

  for (const line of lines) {
    const detected = detectSectionHeader(line.trim());
    if (detected) {
      console.log(
        `Detected SECTION ${detected.section_number} - ${detected.section_title}`
      );
    }
  }

  const chunks = chunkText(cleanText(rawText));
  console.log(`Extracted ${chunks.length} chunks`);

  let currentSectionNumber: string | null = null;
  let currentSectionTitle: string | null = null;

  for (let i = 0; i < chunks.length; i++) {
    const text_content = chunks[i];

    if (text_content.toLowerCase().includes("table of contents")) {
      console.log(`Skipping TOC chunk at index ${i}`);
      continue;
    }

    const sectionMatch = text_content.match(/SECTION\s+(\d+)\s*[-–—]\s*([A-Z][A-Z\s(),/&–—-]*?)(?=\s+[A-Z]\.)/);
    if (sectionMatch) {
      currentSectionNumber = sectionMatch[1];
      currentSectionTitle = sectionMatch[2].trim();
    }

    const embedding = await embed(text_content);

    const { error } = await supabaseServer.from("cba_chunks").insert({
      airline: "American Airlines",
      union_name: "APFA",
      contract_version: "2024-CBA_121724",
      text_content,
      metadata: {
        chunk_index: i,
        section_number: currentSectionNumber,
        section_title: currentSectionTitle,
      },
      embedding,
    });

    if (error) {
      console.error("Insert error:", error);
      process.exit(1);
    }

    if (i % 25 === 0) {
      console.log(`Inserted ${i}/${chunks.length}`);
    }
  }

  console.log("Ingestion complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
