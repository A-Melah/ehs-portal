import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIAuditResult } from '@/types';

// Use the standard v1 client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function runComplianceAudit(
  failureDescription: string,
  legalContext: string,
  assetType: string
): Promise<AIAuditResult> {
  // Use 'gemini-2.0-flash' to ensure it finds the most stable version
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `
    You are an expert EHS (Environment, Health & Safety) compliance auditor in Nigeria.
    You are analyzing an inspection failure against statutory regulations.

    ASSET TYPE: ${assetType}
    FAILURE DETECTED: ${failureDescription}

    RELEVANT LEGAL CONTEXT:
    ${legalContext}

    Respond ONLY with a valid JSON object in this format:
    {
      "breach_detected": true,
      "breach_level": "minor" | "moderate" | "critical",
      "legal_references": ["Section X of Factories Act", "..."],
      "verdict": "...",
      "recommended_actions": ["..."]
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned) as AIAuditResult;
  } catch (error) {
    console.error("AI Audit Error:", error);
    return {
      breach_detected: true,
      breach_level: 'moderate',
      legal_references: ['Check statutory requirements manually'],
      verdict: 'AI analysis service temporarily unavailable.',
      recommended_actions: ['Manual review required.'],
    };
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  // text-embedding-004 is the correct model for vector search
  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.warn("text-embedding-004 failed, using embedding-001 fallback:", error);
    // FALLBACK: Use embedding-001 which is the most compatible across all tiers
    const fallbackModel = genAI.getGenerativeModel({ model: 'embedding-001' });
    const fallbackResult = await fallbackModel.embedContent(text);
    return fallbackResult.embedding.values;
  }
}