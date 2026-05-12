/**
 * Seed script: generates vector embeddings for all regulations
 * that don't have one yet, using Google gemini-embedding-001.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/seed-embeddings.ts
 *
 * Requires .env.local to be loaded. Install dotenv if needed:
 *   npm install dotenv
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function generateEmbedding(text: string): Promise<number[]> {
  const model  = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.embedContent({
    content:  { parts: [{ text }], role: 'user' },
    taskType: 'RETRIEVAL_DOCUMENT' as any,
  });
  return result.embedding.values.slice(0, 1024);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔍 Fetching regulations without embeddings...');

  const { data: regulations, error } = await supabase
    .from('regulations')
    .select('id, statute_title, section, content, embedding')
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
  let failed  = 0;

  for (const reg of regulations) {
    // Combine title + section + content for richer embeddings
    const text = `${reg.statute_title} — ${reg.section}\n\n${reg.content}`;

    try {
      process.stdout.write(`  Embedding: ${reg.statute_title} § ${reg.section}... `);

      const embedding = await generateEmbedding(text);

      const { error: updateError } = await supabase
        .from('regulations')
        .update({ embedding })
        .eq('id', reg.id);

      if (updateError) throw new Error(updateError.message);

      console.log(`✓ (${embedding.length} dims — should be 3072)`);
      success++;

      // Rate limit: Gemini free tier = 1500 RPM, be safe at 300ms
      await sleep(300);

    } catch (err: any) {
      console.log(`✗ FAILED: ${err.message}`);
      failed++;
      await sleep(1000); // back off on error
    }
  }

  console.log(`\n📊 Done. ${success} succeeded, ${failed} failed.`);

  if (failed > 0) {
    console.log('💡 Re-run the script to retry failed rows.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});