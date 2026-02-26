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
  const rawText = data.text;

  for (const target of ["SECTION 9", "SECTION 38", "SECTION 40"]) {
    const idx = rawText.toUpperCase().indexOf(target);
    if (idx === -1) {
      console.log(`\n=== ${target} NOT FOUND ===\n`);
      continue;
    }
    const start = Math.max(0, idx - 500);
    const end = Math.min(rawText.length, idx + target.length + 500);
    console.log(`\n=== ${target} (found at index ${idx}) ===`);
    console.log(JSON.stringify(rawText.slice(start, end)));
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
