import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SlideContent {
  slideNumber: number;
  title: string;
  content: string;
}

async function extractFromPPTX(fileBuffer: ArrayBuffer): Promise<SlideContent[]> {
  const JSZip = (await import("npm:jszip@3.10.1")).default;
  const zip = await JSZip.loadAsync(fileBuffer);

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/)?.[1] ?? "0");
      const nb = parseInt(b.match(/slide(\d+)/)?.[1] ?? "0");
      return na - nb;
    });

  const slides: SlideContent[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async("text");

    const textNodes = xml.match(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g) ?? [];
    const texts = textNodes
      .map((t) => t.replace(/<[^>]+>/g, "").trim())
      .filter((t) => t.length > 0);

    if (texts.length === 0) continue;

    const title = texts[0];
    const body = texts.slice(1).join("\n");

    slides.push({
      slideNumber: i + 1,
      title,
      content: body || title,
    });
  }

  return slides;
}

async function extractFromDOCX(fileBuffer: ArrayBuffer): Promise<SlideContent[]> {
  const mammoth = await import("npm:mammoth@1.8.0");
  const result = await mammoth.extractRawText({ arrayBuffer: fileBuffer });
  const text = result.value;

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p: string) => p.trim())
    .filter((p: string) => p.length > 20);

  return paragraphs.map((content: string, index: number) => ({
    slideNumber: index + 1,
    title: `עמוד ${index + 1}`,
    content,
  }));
}

async function extractFromPDF(fileBuffer: ArrayBuffer): Promise<SlideContent[]> {
  try {
    const pdfParse = (await import("npm:pdf-parse@1.1.1")).default;
    const result = await pdfParse(Buffer.from(fileBuffer));
    const text = result.text;

    const pages = text
      .split(/\f/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0);

    if (pages.length > 0) {
      return pages.map((content: string, index: number) => ({
        slideNumber: index + 1,
        title: `עמוד ${index + 1}`,
        content,
      }));
    }
  } catch (e) {
    console.warn("[PDF] pdf-parse failed:", e);
  }

  return [{
    slideNumber: 1,
    title: "תוכן הקובץ",
    content: "לא ניתן לחלץ תוכן מקובץ זה אוטומטית. אנא פתח את הקובץ ידנית.",
  }];
}

function buildHtmlContent(slide: SlideContent): string {
  const lines = slide.content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const bodyHtml = lines
    .map((line) => {
      if (line.startsWith("•") || line.startsWith("-") || line.startsWith("*")) {
        return `<li class="text-slate-700">${line.replace(/^[•\-*]\s*/, "")}</li>`;
      }
      return `<p class="text-slate-700 leading-relaxed">${line}</p>`;
    })
    .join("\n");

  const hasListItems = lines.some(
    (l) => l.startsWith("•") || l.startsWith("-") || l.startsWith("*")
  );

  const wrappedBody = hasListItems
    ? `<ul class="space-y-2 list-disc pr-6">${bodyHtml}</ul>`
    : `<div class="space-y-3">${bodyHtml}</div>`;

  return `
    <div class="space-y-6">
      <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 class="text-2xl font-bold text-slate-900 mb-4">${slide.title}</h2>
        ${wrappedBody}
      </div>
    </div>
  `;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { courseId, assetId } = await req.json();
    if (!courseId || !assetId) throw new Error("Missing courseId or assetId");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: asset, error: assetError } = await supabase
      .from("course_assets")
      .select("*")
      .eq("id", assetId)
      .maybeSingle();

    if (assetError) throw new Error(`Asset query failed: ${assetError.message}`);
    if (!asset) throw new Error(`Asset not found: ${assetId}`);

    console.log(`[CONVERT] Asset: ${asset.original_name} (type: ${asset.file_type})`);

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("course-assets")
      .download(asset.storage_path);

    if (downloadError) throw new Error(`Download failed: ${downloadError.message}`);
    if (!fileData) throw new Error("Downloaded file is null");

    const fileBuffer = await fileData.arrayBuffer();
    console.log(`[CONVERT] File size: ${fileBuffer.byteLength} bytes`);

    let slides: SlideContent[] = [];

    if (asset.file_type === "pptx" || asset.file_type === "ppt") {
      slides = await extractFromPPTX(fileBuffer);
    } else if (asset.file_type === "docx" || asset.file_type === "doc") {
      slides = await extractFromDOCX(fileBuffer);
    } else if (asset.file_type === "pdf") {
      slides = await extractFromPDF(fileBuffer);
    } else {
      throw new Error(`Unsupported file type: ${asset.file_type}`);
    }

    console.log(`[CONVERT] Extracted ${slides.length} slides`);

    if (slides.length === 0) {
      throw new Error("No content found in file");
    }

    await supabase.from("course_sections").delete().eq("course_id", courseId);

    const allSections: any[] = [];
    const allPages: any[] = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];

      const { data: section, error: sectionError } = await supabase
        .from("course_sections")
        .insert({
          course_id: courseId,
          title: slide.title,
          order_index: i,
          source_slide_id: `slide_${slide.slideNumber}`,
        })
        .select()
        .maybeSingle();

      if (sectionError) throw new Error(`Section creation failed: ${sectionError.message}`);
      if (!section) throw new Error("Section created but no data returned");
      allSections.push(section);

      const htmlContent = buildHtmlContent(slide);

      const { data: page, error: pageError } = await supabase
        .from("course_pages")
        .insert({
          course_id: courseId,
          section_id: section.id,
          order_index: i,
          html_content: htmlContent,
          source_refs: { slide_number: slide.slideNumber },
          is_ai_generated: false,
        })
        .select()
        .maybeSingle();

      if (pageError) throw new Error(`Page creation failed: ${pageError.message}`);
      if (!page) throw new Error("Page created but no data returned");
      allPages.push(page);
    }

    await supabase
      .from("courses")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", courseId);

    console.log(`[CONVERT] Done: ${allSections.length} sections, ${allPages.length} pages`);

    return new Response(
      JSON.stringify({
        success: true,
        sections: allSections.length,
        pages: allPages.length,
        questions: 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error(`[CONVERT ERROR] ${error.message}`);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
