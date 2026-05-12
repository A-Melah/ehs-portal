import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIAuditResult } from '@/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function runComplianceAudit(
  failureDescription: string,
  legalContext: string,
  assetType: string
): Promise<AIAuditResult> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
You are an expert EHS (Environment, Health & Safety) compliance auditor in Nigeria.
You are analyzing an inspection failure against statutory regulations.

ASSET TYPE: ${assetType}
FAILURE DETECTED: ${failureDescription}

RELEVANT LEGAL CONTEXT (from Factories Act / NESREA regulations):
${legalContext}

Based on the failure and the legal context above, provide a structured compliance verdict.
Respond ONLY with a valid JSON object in this exact format:
{
  "breach_detected": true,
  "breach_level": "minor" | "moderate" | "critical",
  "legal_references": ["Section X of Factories Act", "..."],
  "verdict": "A clear 2-3 sentence explanation of the breach and its legal implications.",
  "recommended_actions": ["Action 1", "Action 2", "Action 3"]
}

Breach levels:
- "minor": cosmetic or procedural issue, low risk
- "moderate": operational risk, requires prompt attention
- "critical": immediate safety hazard, requires shutdown or emergency action
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  // Strip markdown code fences if present
  const cleaned = text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(cleaned) as AIAuditResult;
  } catch {
    // Fallback if JSON parsing fails
    return {
      breach_detected: true,
      breach_level: 'moderate',
      legal_references: ['Unable to parse specific references'],
      verdict: text,
      recommended_actions: ['Review the failure manually and consult EHS manager.'],
    };
  }
}

export async function generateEmbedding(text: string, retries = 3): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await (model as any).embedContent({
        content: { parts: [{ text }], role: 'user' },
        outputDimensionality: 1024,
      });
      return result.embedding.values;
    } catch (e: any) {
      const isTransient = e?.message?.includes('500') || e?.message?.includes('503') || e?.message?.includes('429');
      if (isTransient && attempt < retries) {
        const wait = attempt * 2000; // 2s, 4s backoff
        console.warn(`[embedding] attempt ${attempt} failed, retrying in ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw e;
      }
    }
  }
  throw new Error('Embedding failed after ' + retries + ' attempts');
}