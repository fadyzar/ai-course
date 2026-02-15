import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function shuffleOptions(question: any): any {
  const correctIdx = question.correctAnswer;
  const correctText = question.options[correctIdx];

  const optionsWithFlags = question.options.map((opt: string, idx: number) => ({
    text: opt,
    isCorrect: idx === correctIdx
  }));

  for (let i = optionsWithFlags.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [optionsWithFlags[i], optionsWithFlags[j]] = [optionsWithFlags[j], optionsWithFlags[i]];
  }

  const newCorrectIdx = optionsWithFlags.findIndex(opt => opt.isCorrect);

  return {
    prompt: question.prompt,
    options: optionsWithFlags.map(opt => opt.text),
    correctAnswer: newCorrectIdx
  };
}

function extractTextFromHtml(html: string): string {
  const withoutTags = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return withoutTags;
}

async function generateQuestionsWithClaude(
  claudeApiKey: string,
  pageContent: string
): Promise<any[]> {
  console.log(`[CLAUDE] Generating questions from content`);
  console.log(`[CLAUDE] Content length: ${pageContent.length} chars`);

  const prompt = `אתה מומחה פדגוגי ליצירת שאלות בחינה מקצועיות. קיבלת את התוכן הבא:

${pageContent}

משימתך: צור 4-6 שאלות בוחן מקצועיות ויצירתיות שבוחנות הבנה מעמיקה של החומר.

דרישות לשאלות:
1. כל שאלה בוחנת הבנה מעמיקה - לא רק שינון של עובדות
2. 4 אפשרויות תשובה לכל שאלה
3. התשובות הלא נכונות צריכות להיות סבירות וקרובות לנושא (לא ברורות מיידית שהן שגויות)
4. וודא שהתשובה הנכונה נמצאת במיקום שונה בכל שאלה (אינדקס 0, 1, 2, או 3)
5. גוון השאלות:
   - שאלות הבנה: "מהי המשמעות של...?", "מדוע...?"
   - שאלות יישום: "איך ניתן להשתמש ב...?", "מה יקרה אם...?"
   - שאלות ניתוח: "מה ההבדל בין... ל...?", "מה הקשר בין...?"
   - שאלות הערכה: "מהי ההשלכה של...?", "איזו גישה עדיפה...?"

החזר JSON בלבד בפורמט:
{
  "questions": [
    {
      "prompt": "שאלה יצירתית שבוחנת הבנה?",
      "options": ["אפשרות 1", "אפשרות 2", "אפשרות 3", "אפשרות 4"],
      "correctAnswer": 2
    }
  ]
}

דוגמאות לשאלות טובות:
- "מהי ההשלכה המרכזית של הרעיון שהוצג בחומר?"
- "איך ניתן ליישם את העיקרון הזה במצב אמיתי?"
- "מה ההבדל המהותי בין שני המושגים?"

דוגמאות לשאלות רעות (אל תיצור כאלה):
- "איזה מושג הוזכר בטקסט?" (רק שינון)
- "מה הצבע של...?" (לא רלוונטי להבנה)`;

  console.log(`[CLAUDE] Sending request to Anthropic API...`);
  const requestBody = {
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 3000,
    temperature: 0.8,
    messages: [{ role: "user", content: prompt }],
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": claudeApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestBody),
  });

  console.log(`[CLAUDE] Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[CLAUDE] API error response: ${errorText}`);
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  console.log(`[CLAUDE] Response received, model: ${result.model}`);

  const contentText = result.content[0].text;
  console.log(`[CLAUDE] Content text length: ${contentText.length}`);

  const jsonMatch = contentText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error(`[CLAUDE] Failed to extract JSON from response`);
    throw new Error("Failed to extract JSON from Claude response");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  console.log(`[CLAUDE] Parsed OK - questions: ${parsed.questions?.length}`);

  if (parsed.questions && Array.isArray(parsed.questions)) {
    parsed.questions = parsed.questions.map(shuffleOptions);
    console.log(`[CLAUDE] Shuffled ${parsed.questions.length} questions`);
  }

  return parsed.questions || [];
}

Deno.serve(async (req: Request) => {
  console.log(`[ENTRY] extract-questions-ai called`);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { courseId, pageId } = await req.json();
    console.log(`[REQUEST] courseId: ${courseId}, pageId: ${pageId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const claudeApiKey = Deno.env.get("CLAUDE_API_KEY");

    if (!claudeApiKey) {
      throw new Error("CLAUDE_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[FETCH] Loading page ${pageId}...`);
    const { data: page, error: pageError } = await supabase
      .from("course_pages")
      .select("html_content")
      .eq("id", pageId)
      .maybeSingle();

    if (pageError || !page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    console.log(`[EXTRACT] Extracting text from HTML...`);
    const textContent = extractTextFromHtml(page.html_content);
    console.log(`[EXTRACT] Extracted ${textContent.length} chars of text`);

    if (textContent.length < 50) {
      console.log(`[SKIP] Page content too short, skipping AI generation`);
      return new Response(
        JSON.stringify({
          success: true,
          extracted: 0,
          questions: [],
          message: "Page content too short for question generation"
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log(`[AI] Generating questions with Claude...`);
    const aiQuestions = await generateQuestionsWithClaude(claudeApiKey, textContent);
    console.log(`[AI] Generated ${aiQuestions.length} questions`);

    const questionsToInsert = aiQuestions.map((q) => ({
      course_id: courseId,
      page_id: pageId,
      type: "single_choice",
      prompt: q.prompt,
      options: q.options,
      correct_answer: [q.options[q.correctAnswer]],
      confidence: 0.85,
      reviewed_by_teacher: false,
    }));

    console.log(`[SAVE] Saving ${questionsToInsert.length} questions to database...`);
    const { data, error } = await supabase
      .from("questions")
      .insert(questionsToInsert)
      .select();

    if (error) {
      console.error(`[SAVE] Error saving questions:`, error);
      throw error;
    }

    console.log(`[SUCCESS] Saved ${data?.length || 0} questions`);

    return new Response(
      JSON.stringify({
        success: true,
        extracted: data?.length || 0,
        questions: data,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error(`[ERROR]`, error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
