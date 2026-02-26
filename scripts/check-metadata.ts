import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function run() {
  const { data, error } = await sb
    .from("cba_chunks")
    .select("metadata")
    .range(0, 9);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  for (const row of data ?? []) {
    console.log(JSON.stringify(row.metadata));
  }
}

run().catch(console.error);
