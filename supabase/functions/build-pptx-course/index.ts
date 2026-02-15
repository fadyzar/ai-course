import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function extractTextFromPDF(fileBuffer: ArrayBuffer): Promise<string[]> {
  return [
    "תוכן עמוד 1 - זהו טקסט לדוגמה שמדמה חילוץ תוכן מ-PDF.",
    "תוכן עמוד 2 - במימוש מלא ישתמשו בספריות כמו pdf-parse.",
  ];
}

async function extractTextFromDOCX(fileBuffer: ArrayBuffer): Promise<string[]> {
  return [
    "תוכן מסמך 1 - זהו טקסט לדוגמה מ-DOCX.",
    "תוכן מסמך 2 - במימוש מלא ישתמשו בספריות כמו mammoth.",
  ];
}

async function generateContentWithAI(
  content: string,
  pageNumber: number
): Promise<{ summary: string; questions: any[] }> {
  const claudeApiKey = Deno.env.get("CLAUDE_API_KEY");

  if (!claudeApiKey) {
    console.warn("CLAUDE_API_KEY not configured, returning demo content");
    return {
      summary: `סיכום דמו לעמוד ${pageNumber}: ${content.substring(0, 100)}...`,
      questions: [
        {
          prompt: `שאלה מעמוד ${pageNumber}?`,
          options: ["תשובה 1", "תשובה 2", "תשובה 3", "תשובה 4"],
          correctAnswer: 0,
        },
      ],
    };
  }

  try {
    const prompt = `אתה עוזר מקצועי ליצירת תוכן לימודי. קיבלת את התוכן הבא מעמוד ${pageNumber}:

${content}

אנא צור:
1. סיכום מקצועי ומפורט של התוכן (2-3 פסקאות) בעברית
2. 3 שאלות אמריקאיות על התוכן, כל שאלה עם 4 אפשרויות

החזר JSON תקני בפורמט הבא:
{
  "summary": "הסיכום...",
  "questions": [
    {
      "prompt": "השאלה?",
      "options": ["א", "ב", "ג", "ד"],
      "correctAnswer": 0
    }
  ]
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Claude API error:", errorText);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const result = await response.json();
    const contentText = result.content[0].text;
    const jsonMatch = contentText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Failed to extract JSON from response");
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error: any) {
    console.error("AI generation error:", error.message);
    return {
      summary: `סיכום של עמוד ${pageNumber}: ${content.substring(0, 200)}...`,
      questions: [
        {
          prompt: `מהו התוכן העיקרי של עמוד ${pageNumber}?`,
          options: ["תשובה 1", "תשובה 2", "תשובה 3", "תשובה 4"],
          correctAnswer: 0,
        },
      ],
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { assetId, courseId } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: asset, error: assetError } = await supabase
      .from("course_assets")
      .select("*")
      .eq("id", assetId)
      .maybeSingle();

    if (assetError) throw assetError;
    if (!asset) throw new Error("Asset not found");

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("course-assets")
      .download(asset.storage_path);

    if (downloadError) {
      console.error("Download error:", downloadError);
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    const fileBuffer = await fileData.arrayBuffer();
    let pages: string[] = [];

    if (asset.file_type === "pdf") {
      pages = await extractTextFromPDF(fileBuffer);
    } else if (asset.file_type === "docx") {
      pages = await extractTextFromDOCX(fileBuffer);
    } else {
      pages = [
        `תוכן מקורי מקובץ ${asset.original_name} - זהו תוכן לדוגמה.`,
        "במימוש מלא, המערכת תחלץ תוכן אמיתי מהקובץ.",
      ];
    }

    const allSections = [];
    const allPages = [];
    const allQuestions = [];

    for (let i = 0; i < pages.length; i++) {
      const pageContent = pages[i];
      const aiResult = await generateContentWithAI(pageContent, i + 1);

      const { data: section, error: sectionError } = await supabase
        .from("course_sections")
        .insert({
          course_id: courseId,
          title: `עמוד ${i + 1}`,
          order_index: i,
          source_slide_id: `page_${i + 1}`,
        })
        .select()
        .maybeSingle();

      if (sectionError) throw sectionError;
      if (section) allSections.push(section);

      const htmlContent = `
        <div class="max-w-4xl mx-auto space-y-6">
          <h2 class="text-4xl font-bold text-slate-900 mb-4">עמוד ${i + 1}</h2>

          <div class="bg-slate-50 p-6 rounded-lg mb-6">
            <h3 class="text-xl font-semibold text-slate-800 mb-3">תוכן מקורי:</h3>
            <p class="text-slate-700 whitespace-pre-wrap leading-relaxed">${pageContent}</p>
          </div>

          <div class="bg-blue-50 p-6 rounded-lg border-r-4 border-blue-500">
            <h3 class="text-xl font-semibold text-blue-900 mb-3">סיכום:</h3>
            <p class="text-slate-800 leading-relaxed">${aiResult.summary}</p>
          </div>
        </div>
      `;

      const { data: page, error: pageError } = await supabase
        .from("course_pages")
        .insert({
          course_id: courseId,
          section_id: section?.id,
          order_index: i,
          html_content: htmlContent,
          source_refs: { page_number: i + 1 },
          is_ai_generated: true,
          ai_metadata: {
            model: "claude-3-5-sonnet-20241022",
            generated_at: new Date().toISOString(),
          },
        })
        .select()
        .maybeSingle();

      if (pageError) throw pageError;
      if (page) allPages.push(page);

      for (const q of aiResult.questions) {
        const { data: question, error: questionError } = await supabase
          .from("questions")
          .insert({
            course_id: courseId,
            page_id: page?.id,
            type: "single_choice",
            prompt: q.prompt,
            options: q.options,
            correct_answer: [q.correctAnswer],
            confidence: 0.8,
            reviewed_by_teacher: false,
          })
          .select()
          .maybeSingle();

        if (questionError) {
          console.error("Question insert error:", questionError);
        } else if (question) {
          allQuestions.push(question);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sections: allSections.length,
        pages: allPages.length,
        questions: allQuestions.length,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Error in build-pptx-course:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.stack
      }),
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
