import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SlideContent {
  slideNumber: number;
  content: string;
  isChapterSlide: boolean;
}

async function extractTextFromFile(
  fileBuffer: ArrayBuffer,
  fileType: string
): Promise<SlideContent[]> {
  console.log(`[EXTRACT] Starting extraction for file type: ${fileType}, buffer size: ${fileBuffer.byteLength} bytes`);

  if (fileType === "docx") {
    console.log(`[EXTRACT] Importing mammoth for DOCX parsing...`);
    const mammoth = await import("npm:mammoth@1.8.0");
    console.log(`[EXTRACT] Mammoth imported, extracting raw text...`);
    const result = await mammoth.extractRawText({ arrayBuffer: fileBuffer });
    const text = result.value;
    console.log(`[EXTRACT] Raw text extracted, length: ${text.length} chars`);
    console.log(`[EXTRACT] First 200 chars: ${text.substring(0, 200)}`);

    const sections = text.split(/\n\n+/).filter((s: string) => s.trim().length > 0);
    console.log(`[EXTRACT] Split into ${sections.length} sections`);
    return sections.map((content: string, index: number) => ({
      slideNumber: index + 1,
      content: content.trim(),
      isChapterSlide: false,
    }));
  }

  if (fileType === "pptx") {
    console.log(`[EXTRACT] PPTX file - returning placeholder content`);
    return [{
      slideNumber: 1,
      content: "תוכן המצגת (בימוש מלא יחלץ את התוכן מכל השקופיות)",
      isChapterSlide: false,
    }];
  }

  if (fileType === "pdf") {
    console.log(`[EXTRACT] PDF file - returning placeholder content`);
    return [{
      slideNumber: 1,
      content: "תוכן ה-PDF (בימוש מלא יחלץ את התוכן מכל העמודים)",
      isChapterSlide: false,
    }];
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}

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

async function generateContentWithClaude(
  claudeApiKey: string,
  slideContent: string,
  slideNumber: number
): Promise<{ summary: string; questions: any[] }> {
  console.log(`[CLAUDE] Generating content for slide ${slideNumber}`);
  console.log(`[CLAUDE] Content length: ${slideContent.length} chars`);
  console.log(`[CLAUDE] API key starts with: ${claudeApiKey.substring(0, 10)}...`);

  const prompt = `אתה מומחה פדגוגי ליצירת חומרי לימוד מתקדמים. קיבלת את התוכן הבא מעמוד ${slideNumber}:

${slideContent}

משימתך:

1. **סיכום מקצועי** (2-4 פסקאות):
   - זהה את הרעיונות המרכזיים והקשרים ביניהם
   - הסבר את המושגים בצורה ברורה ומעמיקה
   - הוסף הקשר רחב יותר ודוגמאות אם רלוונטי
   - השתמש בשפה אקדמית אך מובנת

2. **4-6 שאלות בוחן מקצועיות**:
   - כל שאלה בוחנת הבנה מעמיקה (לא רק שינון)
   - 4 אפשרויות תשובה לכל שאלה
   - התשובות הלא נכונות צריכות להיות סבירות וקרובות לנושא (לא ברורות שהן שגויות)
   - וודא שהתשובה הנכונה לא תמיד במיקום הראשון - שנה את המיקום בכל שאלה
   - השאלות צריכות לבחון:
     * הבנת מושגים מרכזיים
     * יכולת ליישם את הידע
     * ניתוח וחשיבה ביקורתית
     * קשרים בין רעיונות

החזר JSON בלבד בפורמט:
{
  "summary": "סיכום מקצועי מפורט...",
  "questions": [
    {
      "prompt": "שאלה שבוחנת הבנה מעמיקה?",
      "options": ["אפשרות 1", "אפשרות 2", "אפשרות 3", "אפשרות 4"],
      "correctAnswer": 2
    }
  ]
}

דוגמה לשאלה טובה:
"מהי ההשלכה המרכזית של הרעיון שהוצג?" במקום "איזה מושג הוזכר?"`;

  console.log(`[CLAUDE] Sending request to Anthropic API...`);
  const requestBody = {
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 4096,
    temperature: 0.7,
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
  console.log(`[CLAUDE] Response received, model: ${result.model}, stop_reason: ${result.stop_reason}`);
  console.log(`[CLAUDE] Usage: input=${result.usage?.input_tokens}, output=${result.usage?.output_tokens}`);

  const contentText = result.content[0].text;
  console.log(`[CLAUDE] Content text length: ${contentText.length}`);
  console.log(`[CLAUDE] First 200 chars: ${contentText.substring(0, 200)}`);

  const jsonMatch = contentText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error(`[CLAUDE] Failed to extract JSON from response`);
    console.error(`[CLAUDE] Full response text: ${contentText}`);
    throw new Error("Failed to extract JSON from Claude response");
  }

  console.log(`[CLAUDE] JSON extracted successfully, parsing...`);
  const parsed = JSON.parse(jsonMatch[0]);
  console.log(`[CLAUDE] Parsed OK - summary length: ${parsed.summary?.length}, questions: ${parsed.questions?.length}`);

  if (parsed.questions && Array.isArray(parsed.questions)) {
    parsed.questions = parsed.questions.map(shuffleOptions);
    console.log(`[CLAUDE] Shuffled ${parsed.questions.length} questions`);
  }

  return parsed;
}

Deno.serve(async (req: Request) => {
  console.log(`[ENTRY] ===== convert-with-ai called =====`);
  console.log(`[ENTRY] Method: ${req.method}`);
  console.log(`[ENTRY] URL: ${req.url}`);
  console.log(`[ENTRY] Headers: ${JSON.stringify(Object.fromEntries(req.headers.entries()))}`);

  if (req.method === "OPTIONS") {
    console.log(`[ENTRY] OPTIONS request, returning CORS headers`);
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log(`[STEP 1] Checking environment variables...`);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const claudeApiKey = Deno.env.get("CLAUDE_API_KEY");

    console.log(`[STEP 1] SUPABASE_URL: ${supabaseUrl ? "SET (" + supabaseUrl.substring(0, 30) + "...)" : "NOT SET"}`);
    console.log(`[STEP 1] SUPABASE_ANON_KEY: ${supabaseAnonKey ? "SET (length=" + supabaseAnonKey.length + ")" : "NOT SET"}`);
    console.log(`[STEP 1] SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? "SET (length=" + supabaseServiceKey.length + ")" : "NOT SET"}`);
    console.log(`[STEP 1] CLAUDE_API_KEY: ${claudeApiKey ? "SET (starts with: " + claudeApiKey.substring(0, 10) + "..., length=" + claudeApiKey.length + ")" : "NOT SET"}`);

    const allEnvKeys = Object.keys(Deno.env.toObject());
    console.log(`[STEP 1] All available env vars: ${JSON.stringify(allEnvKeys)}`);

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      const missing = [];
      if (!supabaseUrl) missing.push("SUPABASE_URL");
      if (!supabaseServiceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseAnonKey) missing.push("SUPABASE_ANON_KEY");
      throw new Error(`Missing Supabase environment variables: ${missing.join(", ")}`);
    }

    if (!claudeApiKey) {
      throw new Error("CLAUDE_API_KEY not configured. Available env vars: " + allEnvKeys.join(", "));
    }

    console.log(`[STEP 2] Checking authorization header...`);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }
    console.log(`[STEP 2] Auth header present, length: ${authHeader.length}`);

    console.log(`[STEP 3] Parsing request body...`);
    const body = await req.json();
    const { courseId, assetId } = body;
    console.log(`[STEP 3] courseId: ${courseId}, assetId: ${assetId}`);
    console.log(`[STEP 3] Full body: ${JSON.stringify(body)}`);

    console.log(`[STEP 4] Authenticating user...`);
    const token = authHeader.replace("Bearer ", "");
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      console.error(`[STEP 4] Auth FAILED:`, authError);
      throw new Error(`Unauthorized: ${authError?.message || "No user found"}`);
    }
    console.log(`[STEP 4] User authenticated: ${user.id} (${user.email})`);

    console.log(`[STEP 5] Creating service role client...`);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[STEP 6] Fetching asset ${assetId} from database...`);
    const { data: asset, error: assetError } = await supabase
      .from("course_assets")
      .select("*")
      .eq("id", assetId)
      .maybeSingle();

    if (assetError) {
      console.error(`[STEP 6] Asset query error:`, JSON.stringify(assetError));
      throw new Error(`Asset query failed: ${assetError.message}`);
    }
    if (!asset) {
      console.error(`[STEP 6] Asset not found: ${assetId}`);
      throw new Error(`Asset not found: ${assetId}`);
    }
    console.log(`[STEP 6] Asset found: name=${asset.original_name}, type=${asset.file_type}, path=${asset.storage_path}, status=${asset.status}`);

    console.log(`[STEP 7] Downloading file from storage bucket "course-assets", path: ${asset.storage_path}`);
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("course-assets")
      .download(asset.storage_path);

    if (downloadError) {
      console.error(`[STEP 7] Download FAILED:`, JSON.stringify(downloadError));
      throw new Error(`Storage download failed: ${downloadError.message}`);
    }
    if (!fileData) {
      throw new Error("Downloaded file data is null");
    }
    console.log(`[STEP 7] File downloaded, size: ${fileData.size} bytes, type: ${fileData.type}`);

    console.log(`[STEP 8] Extracting text from ${asset.file_type} file...`);
    const fileBuffer = await fileData.arrayBuffer();
    const slides = await extractTextFromFile(fileBuffer, asset.file_type);
    console.log(`[STEP 8] Extracted ${slides.length} slides/sections`);
    slides.forEach((s, i) => {
      console.log(`[STEP 8] Slide ${i + 1}: ${s.content.substring(0, 100)}...`);
    });

    const allSections: any[] = [];
    const allPages: any[] = [];
    const allQuestions: any[] = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      console.log(`\n[STEP 9.${i + 1}] ===== Processing slide ${i + 1}/${slides.length} =====`);

      console.log(`[STEP 9.${i + 1}a] Calling Claude API...`);
      const aiResult = await generateContentWithClaude(claudeApiKey, slide.content, slide.slideNumber);
      console.log(`[STEP 9.${i + 1}a] Claude returned: summary=${aiResult.summary?.length} chars, questions=${aiResult.questions?.length}`);

      const sectionTitle = `דף ${slide.slideNumber}`;

      console.log(`[STEP 9.${i + 1}b] Creating section: "${sectionTitle}"...`);
      const { data: section, error: sectionError } = await supabase
        .from("course_sections")
        .insert({
          course_id: courseId,
          title: sectionTitle,
          order_index: i,
          source_slide_id: `slide_${slide.slideNumber}`,
        })
        .select()
        .maybeSingle();

      if (sectionError) {
        console.error(`[STEP 9.${i + 1}b] Section creation FAILED:`, JSON.stringify(sectionError));
        throw new Error(`Section creation failed: ${sectionError.message}`);
      }
      if (!section) {
        throw new Error("Section created but no data returned");
      }
      allSections.push(section);
      console.log(`[STEP 9.${i + 1}b] Section created: ${section.id}`);

      const htmlContent = `
        <div class="space-y-6">
          <div class="prose prose-lg max-w-none">
            <h2 class="text-3xl font-bold text-slate-900 mb-4">${sectionTitle}</h2>
            <div class="bg-slate-50 p-6 rounded-lg mb-6">
              <h3 class="text-xl font-semibold text-slate-800 mb-3">תוכן מקורי:</h3>
              <p class="text-slate-700 whitespace-pre-wrap">${slide.content}</p>
            </div>
            <div class="bg-blue-50 p-6 rounded-lg">
              <h3 class="text-xl font-semibold text-blue-900 mb-3">סיכום:</h3>
              <p class="text-slate-800 leading-relaxed">${aiResult.summary}</p>
            </div>
          </div>
        </div>
      `;

      console.log(`[STEP 9.${i + 1}c] Creating page for section ${section.id}...`);
      const { data: page, error: pageError } = await supabase
        .from("course_pages")
        .insert({
          course_id: courseId,
          section_id: section.id,
          order_index: i,
          html_content: htmlContent,
          source_refs: { slide_id: `slide_${slide.slideNumber}` },
          is_ai_generated: true,
          ai_metadata: {
            model: "claude-3-5-sonnet-20241022",
            generated_at: new Date().toISOString(),
            slide_number: slide.slideNumber,
          },
        })
        .select()
        .maybeSingle();

      if (pageError) {
        console.error(`[STEP 9.${i + 1}c] Page creation FAILED:`, JSON.stringify(pageError));
        throw new Error(`Page creation failed: ${pageError.message}`);
      }
      if (!page) {
        throw new Error("Page created but no data returned");
      }
      allPages.push(page);
      console.log(`[STEP 9.${i + 1}c] Page created: ${page.id}`);

      console.log(`[STEP 9.${i + 1}d] Creating ${aiResult.questions.length} questions...`);
      for (let qi = 0; qi < aiResult.questions.length; qi++) {
        const q = aiResult.questions[qi];
        console.log(`[STEP 9.${i + 1}d] Question ${qi + 1}: "${q.prompt?.substring(0, 60)}..."`);

        const { data: question, error: questionError } = await supabase
          .from("questions")
          .insert({
            course_id: courseId,
            page_id: page.id,
            type: "single_choice",
            prompt: q.prompt,
            options: q.options,
            correct_answer: [q.options[q.correctAnswer]],
            confidence: 0.9,
            reviewed_by_teacher: false,
          })
          .select()
          .maybeSingle();

        if (questionError) {
          console.error(`[STEP 9.${i + 1}d] Question ${qi + 1} FAILED:`, JSON.stringify(questionError));
          throw new Error(`Question creation failed: ${questionError.message}`);
        }
        if (!question) {
          throw new Error("Question created but no data returned");
        }
        allQuestions.push(question);
        console.log(`[STEP 9.${i + 1}d] Question ${qi + 1} created: ${question.id}`);
      }
    }

    console.log(`[STEP 10] Updating course status to "ready"...`);
    const { error: updateError } = await supabase
      .from("courses")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", courseId);

    if (updateError) {
      console.error(`[STEP 10] Course update FAILED:`, JSON.stringify(updateError));
      throw new Error(`Course update failed: ${updateError.message}`);
    }
    console.log(`[STEP 10] Course status updated to "ready"`);

    const summary = {
      success: true,
      sections: allSections.length,
      pages: allPages.length,
      questions: allQuestions.length,
    };
    console.log(`[DONE] ===== SUCCESS =====`);
    console.log(`[DONE] ${JSON.stringify(summary)}`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error(`[FATAL] ===== ERROR =====`);
    console.error(`[FATAL] Message: ${error.message}`);
    console.error(`[FATAL] Stack: ${error.stack}`);

    return new Response(
      JSON.stringify({
        error: error.message || "Unknown error occurred",
        details: error.stack || "",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
