import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function run() {
  const { count, error: countError } = await supabase
    .from("cba_chunks")
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.error("Count error:", countError.message);
    process.exit(1);
  }

  console.log(`Total rows in cba_chunks: ${count}`);

  const { data, error: selectError } = await supabase
    .from("cba_chunks")
    .select("text_content")
    .limit(5);

  if (selectError) {
    console.error("Select error:", selectError.message);
    process.exit(1);
  }

  console.log("\nFirst 5 rows:\n");
  for (const row of data ?? []) {
    console.log("---");
    console.log(row.text_content.slice(0, 200));
  }
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
