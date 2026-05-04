/**
 * Seed script: generates vector embeddings for all regulations
 * that don't have one yet, using Google text-embedding-004.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/seed-embeddings.ts
 *
 * Requires .env.local to be loaded. Install dotenv if needed:
 *   npm install dotenv
 */

import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Generates vector embeddings using the current stable model.
 * In 2026, 'text-embedding-004' is deprecated. 
 * Use 'text-embedding-005' or 'gemini-embedding-001'.
 */
async function generateEmbedding(text: string, attempt = 0): Promise<number[]> {
  try {
    // text-embedding-005 is the 2026 standard for high-performance 768/3072 dims
    const model = genAI.getGenerativeModel({ model: "text-embedding-005" });
    
const result = await model.embedContent({
  content: { 
    role: 'user', // Add this line to satisfy the TS error
    parts: [{ text }] 
  },
  taskType: TaskType.RETRIEVAL_DOCUMENT,
});

    return result.embedding.values;
  } catch (error: any) {
    // 429 = Rate limit hit (common on Free Tier)
    if (error.message?.includes('429') && attempt < 5) {
      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
      console.log(`\n⏳ Rate limited. Retrying in ${delay}ms...`);
      await sleep(delay);
      return generateEmbedding(text, attempt + 1);
    }
    
    // 404 usually means an incorrect model name or region mismatch
    if (error.message?.includes('404')) {
      console.error("\n❌ Model not found. Ensure you aren't using 'text-embedding-004'.");
    }

    throw error;
  }
}

async function main() {
  console.log('🔍 Fetching regulations without embeddings...');

  // Select only what we need to minimize data transfer
  const { data: regulations, error } = await supabase
    .from('regulations')
    .select('id, statute_title, section, content')
    .is('embedding', null);

  if (error) {
    console.error('❌ Failed to fetch regulations:', error.message);
    process.exit(1);
  }

  if (!regulations?.length) {
    console.log('✅ All regulations already have embeddings.');
    return;
  }

  console.log(`📋 Found ${regulations.length} regulations to embed.\n`);

  let success = 0;
  let failed = 0;

  for (const reg of regulations) {
    // Combine title + section + content for richer semantic context
    const text = `Statute: ${reg.statute_title}\nSection: ${reg.section}\nContent: ${reg.content}`;

    try {
      process.stdout.write(`Embedding: ${reg.statute_title.substring(0, 20)}... § ${reg.section}... `);

      const embedding = await generateEmbedding(text);

      const { error: updateError } = await supabase
        .from('regulations')
        .update({ embedding })
        .eq('id', reg.id);

      if (updateError) throw new Error(updateError.message);

      process.stdout.write(`✓ (${embedding.length} dims)\n`);
      success++;

      // Gemini Free Tier can be sensitive; 500ms is a safe pace
      await sleep(500);

    } catch (err: any) {
      console.log(`✗ FAILED: ${err.message}`);
      failed++;
      await sleep(2000); // Longer backoff
    }
  }

  console.log(`\n📊 Done. ${success} succeeded, ${failed} failed.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

