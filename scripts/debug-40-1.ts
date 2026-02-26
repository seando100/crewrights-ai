import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";

async function run() {
  const pdfPath = path.join(process.cwd(), "data", "2024-CBA_121724.pdf");
  const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
  const data = await parser.getText();
  await parser.destroy();
  const raw = data.text;

  let idx = 0;
  while (true) {
    idx = raw.indexOf("40-1", idx);
    if (idx === -1) { console.log("Not found"); break; }

    const snippet = raw.slice(Math.max(0, idx - 100), idx + 200);
    const isInTOC = snippet.toLowerCase().includes("table of contents") || snippet.includes("......");

    if (isInTOC) { idx += 1; continue; }

    console.log("Found non-TOC occurrence at index", idx);
    console.log(JSON.stringify(raw.slice(Math.max(0, idx - 600), idx + "40-1".length + 600)));
    break;
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
