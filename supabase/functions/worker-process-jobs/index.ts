import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BATCH_SIZE = 15;
const PARALLEL_BATCHES = 5;
const AI_MODEL = "claude-3-haiku-20240307";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_RETRIES = 2;

function sanitizeText(text: string): string {
  return text.replace(/\u0000/g, "").replace(/\x00/g, "").trim();
}

function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    for (let j = 0; j < slice.length; j++) {
      binary += String.fromCharCode(slice[j]);
    }
  }
  return btoa(binary);
}

async function callClaude(
  apiKey: string,
  messages: any[],
  maxTokens: number = 8192,
  retries: number = MAX_RETRIES,
  extraHeaders: Record<string, string> = {},
  temperature: number = 0.5
): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          ...extraHeaders,
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: maxTokens,
          temperature,
          messages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[CLAUDE] Attempt ${attempt + 1} failed (${response.status}): ${errText.substring(0, 500)}`);
        if (attempt < retries && (response.status === 429 || response.status >= 500)) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        throw new Error(`Claude API ${response.status}: ${errText.substring(0, 200)}`);
      }

      const result = await response.json();
      return result.content[0].text;
    } catch (e: any) {
      if (attempt < retries && !e.message?.includes("Claude API")) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Max retries exceeded");
}

const PDF_CHUNK_PAGES = 10;

async function extractPdfWithClaude(
  claudeApiKey: string,
  pdfBytes: Uint8Array,
  logFn: (msg: string) => Promise<void>
): Promise<string[]> {
  const { PDFDocument } = await import("npm:pdf-lib@1.17.1");
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();
  const allTexts: string[] = [];

  console.log(`[PDF-AI] Starting extraction for ${totalPages} pages, ${Math.ceil(totalPages / PDF_CHUNK_PAGES)} chunks`);

  for (let start = 0; start < totalPages; start += PDF_CHUNK_PAGES) {
    const end = Math.min(start + PDF_CHUNK_PAGES, totalPages);
    const indices = Array.from({ length: end - start }, (_, i) => start + i);

    console.log(`[PDF-AI] Processing chunk ${start + 1}-${end}`);

    let chunkBase64: string;
    if (start === 0 && end === totalPages && totalPages <= PDF_CHUNK_PAGES) {
      chunkBase64 = toBase64(pdfBytes);
    } else {
      const chunkDoc = await PDFDocument.create();
      const copied = await chunkDoc.copyPages(pdfDoc, indices);
      copied.forEach((page: any) => chunkDoc.addPage(page));
      const chunkBytes = await chunkDoc.save();
      chunkBase64 = toBase64(new Uint8Array(chunkBytes));
    }

    await logFn(`מחלץ עמודים ${start + 1}-${end} מתוך ${totalPages} עם AI...`);

    try {
      const text = await callClaude(
        claudeApiKey,
        [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: chunkBase64,
              },
            },
            {
              type: "text",
              text: `חלץ את הטקסט המלא מכל עמוד במסמך PDF זה.

החזר מערך JSON בלבד (ללא markdown, ללא הסברים):
["טקסט עמוד 1...", "טקסט עמוד 2...", ...]

שמור על עברית תקינה וסדר העמודים.`,
            },
          ],
        }],
        40960,
        MAX_RETRIES,
        {},
        0.3
      );

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          const validPages = parsed
            .filter((p: any) => typeof p === "string" && p.trim().length > 5)
            .map((p: string) => p.trim());
          if (validPages.length > 0) {
            allTexts.push(...validPages);
            console.log(`[PDF-AI] Chunk ${start + 1}-${end}: extracted ${validPages.length} pages, total now: ${allTexts.length}`);
            continue;
          }
        }
      }

      console.warn(`[PDF-AI] JSON parse failed for chunk ${start + 1}-${end}, using text split`);
      const sections = text.split(/\n{3,}/).map((t: string) => t.trim()).filter((t: string) => t.length > 20);
      if (sections.length > 0) {
        allTexts.push(...sections);
        console.log(`[PDF-AI] Chunk ${start + 1}-${end}: fallback split to ${sections.length} sections, total now: ${allTexts.length}`);
      }
    } catch (e: any) {
      console.error(`[PDF-AI] Chunk ${start + 1}-${end} failed: ${e.message}`);
      await logFn(`חילוץ עמודים ${start + 1}-${end} נכשל, ממשיך...`);
    }
  }

  console.log(`[PDF-AI] Extraction complete: ${allTexts.length} pages extracted from ${totalPages} page PDF`);
  return allTexts;
}

async function log(
  supabase: any,
  jobId: string,
  level: string,
  message: string,
  progress: number,
  meta: Record<string, any> = {}
) {
  console.log(`[JOB ${jobId}] [${level}] ${message} (${progress}%)`);
  try {
    await supabase.from("processing_logs").insert({
      job_id: jobId,
      level,
      message,
      meta: { ...meta, progress },
    });
    await supabase
      .from("jobs")
      .update({
        progress,
        metadata: { current_step: message, ...meta },
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } catch (e: any) {
    console.error("Log insert failed:", e.message);
  }
}

async function extractContent(
  asset: any,
  fileData: Blob,
  claudeApiKey: string | undefined,
  logFn: (msg: string) => Promise<void>
): Promise<string[]> {
  const fileType = asset.file_type?.toLowerCase();

  if (fileType === "docx" || fileType === "doc") {
    try {
      const mammoth = await import("npm:mammoth@1.8.0");
      const buffer = await fileData.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      const text = result.value;
      if (text && text.trim().length > 20) {
        const sections = text
          .split(/\n\n+/)
          .filter((s: string) => s.trim().length > 20);
        if (sections.length > 0) return sections.map((s: string) => s.trim());
        const chunks = [];
        const words = text.split(/\s+/);
        for (let i = 0; i < words.length; i += 300) {
          chunks.push(words.slice(i, i + 300).join(" "));
        }
        return chunks.length > 0 ? chunks : [text.substring(0, 5000)];
      }
    } catch (e: any) {
      console.error("DOCX extraction failed:", e.message);
    }
    return [`תוכן מ-${asset.original_name}`];
  }

  if (fileType === "pptx" || fileType === "ppt") {
    try {
      const JSZip = (await import("npm:jszip@3.10.1")).default;
      const buffer = await fileData.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);
      const slideFiles = Object.keys(zip.files)
        .filter((f) => f.startsWith("ppt/slides/slide") && f.endsWith(".xml"))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)/)?.[1] || "0");
          const numB = parseInt(b.match(/slide(\d+)/)?.[1] || "0");
          return numA - numB;
        });

      const pages: string[] = [];
      for (const slideFile of slideFiles) {
        const xml = await zip.files[slideFile].async("text");
        const textMatches = xml.match(/<a:t>([^<]*)<\/a:t>/g);
        if (textMatches) {
          const text = textMatches
            .map((m: string) => m.replace(/<\/?a:t>/g, ""))
            .join(" ")
            .trim();
          if (text.length > 5) {
            pages.push(text);
          }
        }
      }
      if (pages.length > 0) return pages;
    } catch (e: any) {
      console.error("PPTX extraction failed:", e.message);
    }
    return [`תוכן מ-${asset.original_name}`];
  }

  if (fileType === "pdf") {
    const pdfBytes = new Uint8Array(await fileData.arrayBuffer());

    if (claudeApiKey) {
      await logFn("משתמש ב-AI לחילוץ תוכן PDF...");
      try {
        const aiPages = await extractPdfWithClaude(claudeApiKey, pdfBytes, logFn);
        if (aiPages.length > 0) {
          console.log(`[PDF] Claude extracted ${aiPages.length} text sections`);
          return aiPages;
        } else {
          console.warn("[PDF] Claude returned 0 pages, creating placeholder pages");
          const { PDFDocument } = await import("npm:pdf-lib@1.17.1");
          const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
          const pageCount = pdfDoc.getPageCount();
          await logFn(`נכשל חילוץ AI, יוצר ${pageCount} דפים לעיבוד בסיסי...`);
          return Array.from({ length: pageCount }, (_, i) => `עמוד ${i + 1} מתוך ${pageCount} - ${asset.original_name}`);
        }
      } catch (e: any) {
        console.error("[PDF] Claude extraction failed:", e.message);
        await logFn(`AI חילוץ PDF נכשל: ${e.message.substring(0, 100)}, יוצר דפים בסיסיים...`);

        try {
          const { PDFDocument } = await import("npm:pdf-lib@1.17.1");
          const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
          const pageCount = pdfDoc.getPageCount();
          console.log(`[PDF] Creating ${pageCount} placeholder pages`);
          return Array.from({ length: pageCount }, (_, i) => `עמוד ${i + 1} מתוך ${pageCount} - ${asset.original_name}`);
        } catch (pdfErr: any) {
          console.error("[PDF] Failed to get page count:", pdfErr.message);
          return [`תוכן PDF מקובץ ${asset.original_name} - לא ניתן לקרוא את הקובץ`];
        }
      }
    }

    console.log("[PDF] No Claude API key, creating basic placeholder");
    return [`תוכן PDF מקובץ ${asset.original_name} - AI לא זמין`];
  }

  return [`תוכן מקובץ ${asset.original_name}`];
}

interface PageResult {
  pageNum: number;
  summary: string;
  questions: Array<{ prompt: string; options: string[]; correctAnswer: number }>;
  aiGenerated: boolean;
}

function shuffleQuestionOptions(question: any): any {
  if (!question.options || !Array.isArray(question.options)) return question;

  const correctIdx = typeof question.correctAnswer === "number" ? question.correctAnswer : 0;
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

async function generateBatchAI(
  claudeApiKey: string,
  pagesWithIndex: Array<{ index: number; content: string }>,
  totalPages: number
): Promise<PageResult[]> {
  const pagesBlock = pagesWithIndex
    .map((p) => `=== עמוד ${p.index} מתוך ${totalPages} ===\n${p.content.substring(0, 2500)}`)
    .join("\n\n");

  const prompt = `אתה פרופסור מומחה ליצירת חומרי לימוד אקדמיים. קראת ${pagesWithIndex.length} עמודים ממסמך לימודי.

צור לכל עמוד:

1. **סיכום מקצועי** (5-7 משפטים):
   - פתח עם הרעיון המרכזי של העמוד
   - הסבר את המושגים העיקריים והגדרותיהם
   - תאר קשרים והשלכות
   - סכם עם מסקנה או עיקרון מרכזי
   - השתמש בשפה אקדמית מדויקת

2. **שאלת בחינה מתקדמת** עם 4 אפשרויות תשובה:

   דוגמאות לשאלות מצוינות:
   - "כיצד ניתן ליישם את העיקרון X במצב Y?"
   - "מה ההבדל המהותי בין גישת X לגישת Y?"
   - "מהי ההשלכה העיקרית של X על Y?"
   - "איזה מהגורמים הבאים משפיע ביותר על X?"

   דרישות:
   ✓ שאלה שבוחנת הבנה עמוקה (לא שינון עובדות)
   ✓ כל 4 התשובות נשמעות סבירות למי שלא קרא היטב
   ✓ התשובה הנכונה מבוססת על התוכן
   ✓ המסיחים (תשובות שגויות) הם קרובים לנושא אך לא נכונים
   ✗ אסור: "מהו הנושא?", "מה כתוב?", "מה מוזכר?"

${pagesBlock}

החזר JSON בלבד (ללא markdown, ללא הסברים):
{"pages":[{"pageNum":1,"summary":"סיכום מפורט ומקצועי בן 5-7 משפטים המסביר את הרעיון המרכזי, המושגים והקשרים.","questions":[{"prompt":"שאלת הבנה עמוקה שבוחנת יישום או ניתוח?","options":["תשובה מפורטת ונכונה","מסיח סביר וקרוב לנושא","מסיח שני סביר","מסיח שלישי סביר"],"correctAnswer":2}]}]}

הערות:
- correctAnswer הוא מספר 0-3 (אינדקס התשובה הנכונה)
- גוון את מיקום התשובה הנכונה - לא תמיד באינדקס 0
- סיכום איכותי חייב להיות לפחות 100 מילים`;

  const text = await callClaude(claudeApiKey, [{ role: "user", content: prompt }], 16384, MAX_RETRIES, {}, 0.7);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in AI response");

  const parsed = JSON.parse(jsonMatch[0]);
  const pages = parsed.pages || [];

  return pages.map((p: any) => ({
    ...p,
    aiGenerated: true,
    questions: (p.questions || []).map((q: any) => {
      const normalized = {
        ...q,
        correctAnswer: typeof q.correctAnswer === "number" ? q.correctAnswer : 0,
      };
      return shuffleQuestionOptions(normalized);
    }),
  }));
}

function generateFallbackBatch(
  pagesWithIndex: Array<{ index: number; content: string }>
): PageResult[] {
  return pagesWithIndex.map((p) => {
    const content = p.content;
    const sentences = content.split(/[.!?。]\s*/).filter((s) => s.trim().length > 10);

    let summary: string;
    if (sentences.length >= 3) {
      summary = `עמוד זה עוסק ב: ${sentences[0].trim()}. ${sentences[1].trim()}. בנוסף, ${sentences[2].trim()}.`;
    } else if (sentences.length > 0) {
      summary = `עמוד זה עוסק ב: ${sentences[0].trim()}.`;
    } else {
      const truncated = content.substring(0, 200).trim();
      summary = `תקציר: ${truncated}${content.length > 200 ? "..." : ""}`;
    }

    const words = content.split(/\s+/).filter((w) => w.length > 3);
    const uniqueWords = [...new Set(words)].slice(0, 30);
    const mainTopic = uniqueWords.slice(0, 5).join(" ");
    const altTopic1 = uniqueWords.slice(10, 15).join(" ") || "ניהול משאבי אנוש בארגון";
    const altTopic2 = uniqueWords.slice(20, 25).join(" ") || "תכנון אסטרטגי ארוך טווח";

    return {
      pageNum: p.index,
      summary,
      aiGenerated: false,
      questions: [
        {
          prompt: `מהו הרעיון העיקרי שעולה מתוכן עמוד ${p.index}?`,
          options: [
            mainTopic || `הנושא המרכזי של עמוד ${p.index}`,
            altTopic1,
            altTopic2,
            "אף אחת מהתשובות הנ\"ל",
          ],
          correctAnswer: 0,
        },
      ],
    };
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function processJob(supabase: any, job: any) {
  const claudeApiKey = Deno.env.get("CLAUDE_API_KEY");
  const useAI = !!claudeApiKey;

  await supabase
    .from("jobs")
    .update({ status: "processing", progress: 0, updated_at: new Date().toISOString() })
    .eq("id", job.id);

  await log(supabase, job.id, "info", "מתחיל עיבוד...", 5);

  if (!useAI) {
    await log(supabase, job.id, "warning", "מפתח API של Claude לא נמצא - העיבוד יהיה בסיסי בלבד", 5);
  }

  const { data: existingSections } = await supabase
    .from("course_sections")
    .select("id")
    .eq("course_id", job.course_id);

  if (existingSections && existingSections.length > 0) {
    for (const section of existingSections) {
      await supabase.from("course_pages").delete().eq("section_id", section.id);
    }
    await supabase.from("course_sections").delete().eq("course_id", job.course_id);
    await supabase.from("questions").delete().eq("course_id", job.course_id);
  }

  const { data: assets } = await supabase
    .from("course_assets")
    .select("*")
    .eq("course_id", job.course_id)
    .order("created_at", { ascending: true });

  if (!assets || assets.length === 0) {
    const { data: section } = await supabase
      .from("course_sections")
      .insert({ course_id: job.course_id, title: "מבוא", order_index: 0 })
      .select()
      .maybeSingle();

    if (section) {
      await supabase.from("course_pages").insert({
        course_id: job.course_id,
        section_id: section.id,
        order_index: 0,
        html_content: `<div dir="rtl" class="max-w-4xl mx-auto p-8"><h1 class="text-3xl font-bold mb-4">לא הועלו קבצים</h1><p>העלה קובץ כדי לבנות קורס.</p></div>`,
      });
    }
    return;
  }

  let allPages: Array<{ index: number; content: string; assetName: string }> = [];

  const logFn = async (msg: string) => {
    await log(supabase, job.id, "info", msg, 8);
  };

  for (const asset of assets) {
    await log(supabase, job.id, "info", `מוריד ${asset.original_name}...`, 8);

    const { data: fileData, error: dlError } = await supabase.storage
      .from("course-assets")
      .download(asset.storage_path);

    if (dlError) {
      await log(supabase, job.id, "warning", `לא ניתן להוריד ${asset.original_name}: ${dlError.message}`, 9);
      continue;
    }

    const pages = await extractContent(asset, fileData, claudeApiKey, logFn);
    for (let i = 0; i < pages.length; i++) {
      allPages.push({
        index: allPages.length + 1,
        content: sanitizeText(pages[i]),
        assetName: sanitizeText(asset.original_name),
      });
    }

    await log(supabase, job.id, "info", `חולצו ${pages.length} עמודים מ-${asset.original_name}`, 10);
  }

  if (allPages.length === 0) {
    await log(supabase, job.id, "error", "לא חולץ תוכן מהקבצים", 10);
    throw new Error("לא חולץ תוכן מהקבצים");
  }

  const totalPages = allPages.length;
  await log(
    supabase,
    job.id,
    "info",
    `סה"כ ${totalPages} עמודים. ${useAI ? `מעבד ב-AI (${BATCH_SIZE} עמודים במקבץ, ${PARALLEL_BATCHES} במקביל)` : "בונה ללא AI"}...`,
    12
  );

  const batches: Array<Array<{ index: number; content: string }>> = [];
  for (let i = 0; i < allPages.length; i += BATCH_SIZE) {
    batches.push(
      allPages.slice(i, i + BATCH_SIZE).map((p) => ({ index: p.index, content: p.content }))
    );
  }

  const totalBatches = batches.length;
  const allResults: Map<number, PageResult> = new Map();
  let processedBatches = 0;
  let aiSuccessCount = 0;
  let aiFallbackCount = 0;

  for (let i = 0; i < totalBatches; i += PARALLEL_BATCHES) {
    const chunk = batches.slice(i, i + PARALLEL_BATCHES);
    const startPage = chunk[0][0].index;
    const lastChunk = chunk[chunk.length - 1];
    const endPage = lastChunk[lastChunk.length - 1].index;

    const currentProgress = Math.round(12 + (processedBatches / totalBatches) * 75);
    console.log(`[PROCESS] Processing pages ${startPage}-${endPage} of ${totalPages} (${currentProgress}%)`);

    await log(
      supabase,
      job.id,
      "info",
      `מעבד עמודים ${startPage}-${endPage} מתוך ${totalPages}...`,
      currentProgress,
      { batch: processedBatches + 1, total_batches: totalBatches }
    );

    const promises = chunk.map(async (batch) => {
      const batchStart = batch[0].index;
      const batchEnd = batch[batch.length - 1].index;

      if (useAI) {
        try {
          console.log(`[AI] Starting batch ${batchStart}-${batchEnd}`);
          const result = await generateBatchAI(claudeApiKey!, batch, totalPages);
          aiSuccessCount++;
          console.log(`[AI] SUCCESS batch ${batchStart}-${batchEnd}, got ${result.length} pages`);
          return result;
        } catch (e: any) {
          aiFallbackCount++;
          console.error(`[AI] FAILED batch ${batchStart}-${batchEnd}: ${e.message}`);
          return generateFallbackBatch(batch);
        }
      } else {
        return generateFallbackBatch(batch);
      }
    });

    const results = await Promise.all(promises);
    let pagesInThisChunk = 0;
    for (const batchResult of results) {
      for (const pageResult of batchResult) {
        allResults.set(pageResult.pageNum, pageResult);
        pagesInThisChunk++;
      }
      processedBatches++;
    }
    console.log(`[PROCESS] Chunk complete: ${pagesInThisChunk} pages added, total in map: ${allResults.size}`);
  }

  console.log(`[PROCESS] Final: ${allResults.size} pages in results, AI success: ${aiSuccessCount}, fallback: ${aiFallbackCount}`);

  if (aiFallbackCount > 0) {
    await log(
      supabase,
      job.id,
      "warning",
      `AI נכשל ב-${aiFallbackCount} מקבצים (${aiSuccessCount} הצליחו), שאלות בסיסיות נוצרו כגיבוי`,
      88
    );
  }

  await log(supabase, job.id, "info", `שומר ${totalPages} עמודים למסד הנתונים...`, 88);

  let totalQuestionsCreated = 0;

  const PAGE_INSERT_BATCH = 20;
  for (let i = 0; i < allPages.length; i += PAGE_INSERT_BATCH) {
    const pageSlice = allPages.slice(i, i + PAGE_INSERT_BATCH);

    const sectionsToInsert = pageSlice.map((p, idx) => ({
      course_id: job.course_id,
      title: `עמוד ${p.index}`,
      order_index: i + idx,
      source_slide_id: `page_${p.index}`,
    }));

    const { data: insertedSections } = await supabase
      .from("course_sections")
      .insert(sectionsToInsert)
      .select();

    if (!insertedSections) continue;

    const pagesToInsert = pageSlice.map((p, idx) => {
      const aiResult = allResults.get(p.index);
      const summary = sanitizeText(aiResult?.summary || p.content.substring(0, 500));
      const escapedContent = escapeHtml(sanitizeText(p.content));
      const escapedSummary = escapeHtml(summary);
      const isAI = aiResult?.aiGenerated ?? false;

      return {
        course_id: job.course_id,
        section_id: insertedSections[idx]?.id,
        order_index: i + idx,

        html_content: `
          <div dir="rtl" class="max-w-4xl mx-auto space-y-6 py-4">
            <div class="border-b border-slate-200 pb-3">
              <div class="flex items-center justify-between">
                <h2 class="text-2xl font-bold text-slate-900">עמוד ${p.index}</h2>
                <span class="text-sm text-slate-400">עמוד ${p.index} מתוך ${totalPages}</span>
              </div>
            </div>
            <div class="bg-teal-50 p-5 rounded-xl border border-teal-200" style="border-right: 4px solid #0d9488;">
              <h3 class="text-base font-bold text-teal-900 mb-2">סיכום</h3>
              <p class="text-slate-800 leading-relaxed text-base">${escapedSummary}</p>
            </div>
            <details class="group bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
              <summary class="cursor-pointer p-4 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors select-none">
                הצג תוכן מקורי
              </summary>
              <div class="px-5 pb-5 pt-0">
                <p class="text-slate-700 whitespace-pre-wrap leading-relaxed text-sm">${escapedContent}</p>
              </div>
            </details>
          </div>
        `,
        source_refs: { page_number: p.index, ai: isAI, model: isAI ? AI_MODEL : null },
      };
    });

    const { data: insertedPages, error: pagesError } = await supabase
      .from("course_pages")
      .insert(pagesToInsert)
      .select();

    if (pagesError) {
      console.error(`[SAVE] Pages insert error:`, JSON.stringify(pagesError));
      await log(supabase, job.id, "warning", `שגיאה בשמירת עמודים: ${pagesError.message}`, 90);
    }

    if (!insertedPages || insertedPages.length === 0) continue;

    const questionsToInsert: any[] = [];
    for (let idx = 0; idx < pageSlice.length; idx++) {
      const p = pageSlice[idx];
      const aiResult = allResults.get(p.index);
      const pageId = insertedPages[idx]?.id;
      if (!aiResult?.questions || !pageId) continue;

      for (const q of aiResult.questions) {
        if (!q.prompt || !q.options || q.options.length < 2) continue;
        const sanitizedOptions = q.options.map((o: string) => sanitizeText(String(o)));
        const correctIdx = Math.min(Math.max(q.correctAnswer || 0, 0), sanitizedOptions.length - 1);
        const correctText = sanitizedOptions[correctIdx];
        questionsToInsert.push({
          course_id: job.course_id,
          page_id: pageId,
          type: "single_choice",
          prompt: sanitizeText(q.prompt),
          options: sanitizedOptions,
          correct_answer: [correctText],
          confidence: aiResult.aiGenerated ? 0.85 : 0.5,
          reviewed_by_teacher: false,
        });
      }
    }

    if (questionsToInsert.length > 0) {
      await supabase.from("questions").insert(questionsToInsert);
      totalQuestionsCreated += questionsToInsert.length;
    }

    const saveProgress = Math.round(88 + ((i + PAGE_INSERT_BATCH) / totalPages) * 10);
    await log(
      supabase,
      job.id,
      "info",
      `נשמרו ${Math.min(i + PAGE_INSERT_BATCH, totalPages)}/${totalPages} עמודים, ${totalQuestionsCreated} שאלות`,
      Math.min(saveProgress, 98)
    );
  }

  await log(
    supabase,
    job.id,
    "info",
    `סיים: ${totalPages} עמודים, ${totalQuestionsCreated} שאלות${useAI ? ` (${aiSuccessCount} מקבצי AI הצליחו)` : ""}`,
    99
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select("*")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(5);

    if (jobsError) throw jobsError;

    const results: any[] = [];

    for (const job of jobs || []) {
      console.log(`[WORKER] Processing job ${job.id}`);
      let success = false;
      let error: string | null = null;

      try {
        await processJob(supabase, job);
        success = true;

        await supabase
          .from("courses")
          .update({ status: "ready", updated_at: new Date().toISOString() })
          .eq("id", job.course_id);

        await log(supabase, job.id, "info", "הקורס מוכן!", 100);
      } catch (err: any) {
        error = err.message;
        console.error(`[WORKER] Job failed:`, err.message);
        await supabase.from("processing_logs").insert({
          job_id: job.id,
          level: "error",
          message: `נכשל: ${err.message}`,
        });
      }

      await supabase
        .from("jobs")
        .update({
          status: success ? "completed" : "failed",
          progress: success ? 100 : undefined,
          error,
          metadata: success
            ? { current_step: "הושלם בהצלחה!" }
            : { current_step: `נכשל: ${error}` },
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      results.push({ id: job.id, success, error });
    }

    return new Response(
      JSON.stringify({ processed: results.length, jobs: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[WORKER] Fatal:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
