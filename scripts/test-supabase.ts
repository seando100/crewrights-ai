import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SECRET_KEY!;

console.log("URL:", url);
console.log("Key present:", !!key);

const supabase = createClient(url, key);

async function test() {
  const { data, error } = await supabase
    .from("cba_chunks")
    .select("id")
    .limit(1);

  if (error) {
    console.error("Supabase error:", JSON.stringify(error, null, 2));
    process.exit(1);
  }

  console.log("Connected. Row sample:", data);
}

test().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
