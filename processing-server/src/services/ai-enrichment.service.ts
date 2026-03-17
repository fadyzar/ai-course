import Anthropic from '@anthropic-ai/sdk';
import { QuestionOutput } from '../types/index.js';
import { logger } from '../utils/logger.js';

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.CLAUDE_API_KEY) return null;
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
  }
  return _client;
}

export interface EnrichedPage {
  summary: string;
  questions: QuestionOutput[];
}

function extractJson(text: string): any {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {}
  // Extract from code block
  const block = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (block) {
    try {
      return JSON.parse(block[1].trim());
    } catch {}
  }
  // Extract first {...}
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return JSON.parse(obj[0]);
    } catch {}
  }
  return null;
}

export async function enrichPage(
  pageIndex: number,
  textContent: string,
  slideTitle: string
): Promise<EnrichedPage | null> {
  const client = getClient();
  if (!client || textContent.trim().length < 20) return null;

  const truncated = textContent.substring(0, 3000);

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `אתה עוזר ליצירת קורסים דיגיטליים. קרא את התוכן הבא וצור:
1. סיכום מקצועי בעברית (2-3 משפטים)
2. 3 שאלות אמריקאיות בעברית עם 4 אפשרויות כל אחת

כותרת: ${slideTitle}
תוכן:
${truncated}

החזר JSON בלבד בפורמט הזה (ללא טקסט נוסף):
{
  "summary": "...",
  "questions": [
    {
      "prompt": "...",
      "options": ["...", "...", "...", "..."],
      "correctAnswer": "..."
    }
  ]
}`,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const parsed = extractJson(responseText);

    if (!parsed || !parsed.summary || !Array.isArray(parsed.questions)) {
      logger.warn({ pageIndex }, '[AI] Invalid response structure');
      return null;
    }

    const questions: QuestionOutput[] = parsed.questions
      .filter((q: any) => q.prompt && Array.isArray(q.options) && q.options.length >= 2)
      .slice(0, 3)
      .map((q: any) => ({
        pageIndex,
        type: 'single_choice' as const,
        prompt: String(q.prompt),
        options: q.options.map(String),
        correctAnswer: [String(q.correctAnswer || q.options[0])],
        confidence: 0.85,
      }));

    return { summary: String(parsed.summary), questions };
  } catch (err: any) {
    logger.warn({ pageIndex, err: err.message }, '[AI] Enrichment failed, skipping');
    return null;
  }
}

export async function enrichPagesBatch(
  pages: Array<{ index: number; text: string; title: string }>,
  concurrency = 5
): Promise<Map<number, EnrichedPage>> {
  const results = new Map<number, EnrichedPage>();
  const client = getClient();
  if (!client) {
    logger.info('[AI] No CLAUDE_API_KEY, skipping enrichment');
    return results;
  }

  // Process in batches of `concurrency`
  for (let i = 0; i < pages.length; i += concurrency) {
    const batch = pages.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((p) => enrichPage(p.index, p.text, p.title))
    );

    for (let j = 0; j < batch.length; j++) {
      const res = settled[j];
      if (res.status === 'fulfilled' && res.value) {
        results.set(batch[j].index, res.value);
      }
    }
  }

  return results;
}
