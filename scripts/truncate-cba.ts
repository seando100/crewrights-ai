import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function run() {
  const { error: deleteError } = await supabase
    .from("cba_chunks")
    .delete()
    .not("id", "is", null);

  if (deleteError) {
    console.error("Delete failed:", JSON.stringify(deleteError, null, 2));
    process.exit(1);
  }

  console.log("Delete complete.");

  const { count, error: countError } = await supabase
    .from("cba_chunks")
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.error("Count failed:", JSON.stringify(countError, null, 2));
    process.exit(1);
  }

  console.log(`Row count after delete: ${count}`);

  if (count !== 0) {
    console.error("ERROR: Table is not empty.");
    process.exit(1);
  }

  console.log("Verified: table is empty. Ready for fresh ingestion.");
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
