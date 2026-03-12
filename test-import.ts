import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import fs from "fs";

// Using the same JSON example provided by the user
const testCase = {
  "__articles": "13;13+P1-1;P1-1", "__conclusion": "...", 
  "_decision_body": "...", "applicability": "", 
  "application": "MS WORD", "appno": "33888/05", 
  "article": ["p1-1", "13"], 
  "attachments": {"001-95845.docx": {}}, 
  "conclusion": [{"article": "p1-1", "base_article": "p1-1", "details": ["Article 1 of Protocol No. 1 - Protection of property"], "element": "Violation of Article 13+P1-1 - Right to an effective remedy", "type": "violation"}], 
  "content": {"001-95845.docx": [{"content": "PROCEDURE", "elements": [{"content": "1. The case originated..."}]}]}, 
  "country": {"alpha2": "rs", "name": "Serbia"}, 
  "itemid": "001-95845"
};

async function test() {
  const sb = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
  );
  
  // Call the function as the front end does
  const { data, error } = await sb.functions.invoke("echr-import", {
    body: { rawContent: [testCase], practiceCategory: "echr" },
  });

  console.log("Response:", JSON.stringify(data, null, 2));
  console.log("Error:", error);
}

test();
