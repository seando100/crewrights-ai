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
  const upper = rawText.toUpperCase();

  const first = upper.indexOf("SICK LEAVE");
  const second = upper.indexOf("SICK LEAVE", first + 1);

  console.log(`First occurrence at index: ${first}`);
  console.log(`Second occurrence at index: ${second}`);

  if (second === -1) {
    console.log("Second occurrence not found.");
    return;
  }

  const start = Math.max(0, second - 500);
  const end = Math.min(rawText.length, second + "SICK LEAVE".length + 500);
  console.log("\n=== 500 chars around second occurrence ===");
  console.log(JSON.stringify(rawText.slice(start, end)));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
