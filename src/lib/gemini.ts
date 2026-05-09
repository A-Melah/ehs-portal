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

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.embedContent(text);
  return result.embedding.values;
}