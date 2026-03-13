import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "avi", "mkv", "m4v", "mpeg", "mpg", "ogv", "3gp"];
const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/x-matroska", "video/mpeg", "video/ogg", "video/3gpp"];

function isVideoAsset(asset: { file_type?: string; original_name?: string }): boolean {
  const fileType = asset.file_type?.toLowerCase() || "";
  if (VIDEO_MIME_TYPES.includes(fileType)) return true;
  const ext = (asset.original_name || "").split(".").pop()?.toLowerCase() || "";
  return VIDEO_EXTENSIONS.includes(fileType) || VIDEO_EXTENSIONS.includes(ext);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

async function extractDocx(buffer: ArrayBuffer): Promise<string[]> {
  const mammoth = await import("npm:mammoth@1.8.0");
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const text = result.value;
  const sections = text.split(/\n\n+/).filter((s: string) => s.trim().length > 50);
  if (sections.length === 0 && text.trim().length > 0) {
    return [text.trim()];
  }
  return sections.map((s: string) => s.trim());
}

async function extractPdfText(buffer: ArrayBuffer): Promise<string[]> {
  const { PDFDocument } = await import("npm:pdf-lib@1.17.1");
  const bytes = new Uint8Array(buffer);
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  const pages: string[] = [];
  for (let i = 0; i < totalPages; i++) {
    pages.push(`עמוד ${i + 1} מתוך ${totalPages}`);
  }

  const claudeApiKey = Deno.env.get("CLAUDE_API_KEY");
  if (!claudeApiKey) {
    return pages;
  }

  const allTexts: string[] = [];
  const CHUNK = 10;
  for (let start = 0; start < totalPages; start += CHUNK) {
    const end = Math.min(start + CHUNK, totalPages);
    const indices = Array.from({ length: end - start }, (_, i) => start + i);

    let chunkBase64: string;
    if (start === 0 && end === totalPages) {
      chunkBase64 = toBase64(bytes);
    } else {
      const chunkDoc = await PDFDocument.create();
      const copied = await chunkDoc.copyPages(pdfDoc, indices);
      copied.forEach((page: any) => chunkDoc.addPage(page));
      const chunkBytes = await chunkDoc.save();
      chunkBase64 = toBase64(new Uint8Array(chunkBytes));
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 40960,
        temperature: 0.1,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: chunkBase64 },
            },
            {
              type: "text",
              text: `חלץ את הטקסט המלא מכל עמוד במסמך זה. החזר מערך JSON בלבד:
["טקסט עמוד 1...", "טקסט עמוד 2...", ...]
שמור על כל הטקסט המקורי ללא שינוי.`,
            },
          ],
        }],
      }),
    });

    if (response.ok) {
      const result = await response.json();
      const text = result.content[0].text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) {
            allTexts.push(...parsed.map((t: any) => String(t).trim()).filter((t: string) => t.length > 0));
            continue;
          }
        } catch (_) {}
      }
    }

    for (let i = start; i < end; i++) {
      allTexts.push(`עמוד ${i + 1} מתוך ${totalPages}`);
    }
  }

  return allTexts.length > 0 ? allTexts : pages;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripAllTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, "");
}

async function extractPptx(buffer: ArrayBuffer): Promise<string[]> {
  try {
    const JSZip = (await import("npm:jszip@3.10.1")).default;
    const zip = await JSZip.loadAsync(buffer);

    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)?.[0] || "0");
        const nb = parseInt(b.match(/\d+/)?.[0] || "0");
        return na - nb;
      });

    const slides: string[] = [];
    for (const slideFile of slideFiles) {
      const xml = await zip.files[slideFile].async("text");
      const paragraphs: string[] = [];

      const paraMatches = xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g);
      for (const paraMatch of paraMatches) {
        const paraXml = paraMatch[1];
        const runTexts: string[] = [];
        const runMatches = paraXml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g);
        for (const run of runMatches) {
          const text = decodeXmlEntities(run[1]).trim();
          if (text.length > 0) runTexts.push(text);
        }
        const line = runTexts.join("").trim();
        if (line.length > 0) paragraphs.push(line);
      }

      const combined = paragraphs.join("\n").trim();
      if (combined.length > 0) slides.push(combined);
    }

    return slides.length > 0 ? slides : ["לא נמצא תוכן בקובץ המצגת"];
  } catch (err) {
    console.error("[PPTX] extraction error:", err);
    return ["לא ניתן לחלץ את תוכן המצגת"];
  }
}

type PageItem =
  | { type: "text"; title: string; content: string }
  | { type: "video"; title: string; videoUrl: string; originalName: string };

function buildHtml(courseTitle: string, pages: PageItem[]): string {
  const sidebarItems = pages
    .map((p, i) => {
      const icon = p.type === "video" ? "&#9654;" : "";
      return `<button class="sidebar-item${i === 0 ? " active" : ""}" onclick="goToPage(${i})" id="sidebar-${i}">
      <span class="sidebar-num">${i + 1}</span>
      ${icon ? `<span class="sidebar-icon">${icon}</span>` : ""}
      <span class="sidebar-title">${escapeHtml(p.title)}</span>
    </button>`;
    })
    .join("\n");

  const pageSlides = pages
    .map((p, i) => {
      const inner = p.type === "video"
        ? `<div class="video-wrapper">
          <video class="course-video" controls controlsList="nodownload" preload="metadata">
            <source src="${p.videoUrl}" type="video/mp4">
            <source src="${p.videoUrl}">
            <p class="video-fallback">הדפדפן שלך אינו תומך בנגן הוידאו. <a href="${p.videoUrl}" target="_blank">לחץ כאן לצפייה</a></p>
          </video>
        </div>`
        : `<div class="page-content"><div class="content-text">${escapeHtml((p as any).content).replace(/\n/g, "<br>")}</div></div>`;

      return `<div class="page-slide" id="page-${i}" style="display:${i === 0 ? "block" : "none"}">
      <div class="page-hero${p.type === "video" ? " page-hero-video" : ""}">
        <div class="page-hero-badge">${p.type === "video" ? "&#9654; וידאו &nbsp;" : ""}${i + 1} / ${pages.length}</div>
        <h1 class="page-hero-title">${escapeHtml(p.title)}</h1>
      </div>
      ${inner}
    </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(courseTitle)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap');
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --sidebar-w: 280px;
      --header-h: 60px;
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --bg: #f1f5f9;
      --surface: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --text2: #334155;
      --text3: #64748b;
      --text4: #94a3b8;
      --shadow: 0 1px 3px rgba(0,0,0,0.07);
      --r: 10px;
      --r-sm: 6px;
    }
    body { font-family: 'Heebo', sans-serif; background: var(--bg); color: var(--text); direction: rtl; line-height: 1.65; -webkit-font-smoothing: antialiased; }
    .layout { display: flex; min-height: 100vh; }
    .sidebar { width: var(--sidebar-w); background: #1e293b; position: fixed; top: 0; right: 0; bottom: 0; z-index: 40; display: flex; flex-direction: column; overflow: hidden; transition: transform 0.3s ease; }
    .sidebar-top { background: #0f172a; padding: 20px 18px 16px; flex-shrink: 0; }
    .course-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .course-icon { width: 38px; height: 38px; border-radius: 8px; background: var(--primary); display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 17px; flex-shrink: 0; }
    .course-name { font-size: 14px; font-weight: 700; color: #f1f5f9; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .course-stats { font-size: 12px; color: #64748b; margin-bottom: 0; }
    .sidebar-list { flex: 1; overflow-y: auto; padding: 8px 0 20px; scrollbar-width: thin; scrollbar-color: #334155 transparent; }
    .sidebar-list::-webkit-scrollbar { width: 3px; }
    .sidebar-list::-webkit-scrollbar-thumb { background: #334155; }
    .sidebar-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 18px; background: none; border: none; border-right: 3px solid transparent; color: #94a3b8; font-family: inherit; font-size: 13px; cursor: pointer; text-align: right; transition: all 0.15s; line-height: 1.35; }
    .sidebar-item:hover { background: #334155; color: #e2e8f0; }
    .sidebar-item.active { background: rgba(37,99,235,0.15); border-right-color: var(--primary); color: #93c5fd; font-weight: 600; }
    .sidebar-num { min-width: 22px; height: 22px; border-radius: 5px; background: #334155; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #64748b; flex-shrink: 0; }
    .sidebar-item.active .sidebar-num { background: var(--primary); color: white; }
    .sidebar-icon { font-size: 10px; color: #60a5fa; flex-shrink: 0; }
    .sidebar-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .main { flex: 1; margin-right: var(--sidebar-w); display: flex; flex-direction: column; min-height: 100vh; }
    .header { background: var(--surface); border-bottom: 1px solid var(--border); height: var(--header-h); position: sticky; top: 0; z-index: 30; display: flex; align-items: center; justify-content: space-between; padding: 0 28px; box-shadow: var(--shadow); }
    .header-right { display: flex; align-items: center; gap: 14px; }
    .mobile-menu-btn { display: none; padding: 6px 8px; border: none; background: none; cursor: pointer; color: var(--text3); font-size: 20px; border-radius: var(--r-sm); }
    .mobile-menu-btn:hover { background: var(--bg); }
    .page-counter { display: flex; align-items: baseline; gap: 4px; }
    .page-counter-cur { font-size: 22px; font-weight: 800; color: var(--text); }
    .page-counter-sep { font-size: 16px; color: var(--text4); font-weight: 300; }
    .page-counter-total { font-size: 15px; color: var(--text4); }
    .header-left { display: flex; align-items: center; gap: 8px; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 18px; border-radius: var(--r-sm); font-size: 13px; font-family: inherit; font-weight: 600; cursor: pointer; transition: all 0.15s; border: 1px solid var(--border); background: var(--surface); color: var(--text2); }
    .btn:hover:not(:disabled) { background: var(--bg); }
    .btn:disabled { opacity: 0.4; cursor: default; }
    .btn-primary { background: var(--primary); border-color: var(--primary); color: white; }
    .btn-primary:hover:not(:disabled) { background: var(--primary-dark); border-color: var(--primary-dark); }
    .content { max-width: 840px; margin: 0 auto; padding: 32px 28px 80px; width: 100%; }
    .page-hero { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: var(--r); padding: 36px 40px; margin-bottom: 24px; text-align: center; position: relative; overflow: hidden; }
    .page-hero::before { content: ''; position: absolute; top: -40px; left: -40px; width: 180px; height: 180px; border-radius: 50%; background: rgba(37,99,235,0.12); }
    .page-hero-video { background: linear-gradient(135deg, #0c1a2e 0%, #0f172a 100%); }
    .page-hero-video::before { background: rgba(37,99,235,0.18); }
    .page-hero-badge { display: inline-flex; align-items: center; background: rgba(37,99,235,0.25); color: #93c5fd; font-size: 12px; font-weight: 600; padding: 4px 14px; border-radius: 20px; margin-bottom: 14px; border: 1px solid rgba(37,99,235,0.3); position: relative; z-index: 1; }
    .page-hero-title { font-size: 26px; font-weight: 900; color: #f1f5f9; line-height: 1.25; position: relative; z-index: 1; }
    .page-content { background: var(--surface); border-radius: var(--r); border: 1px solid var(--border); padding: 32px 36px; margin-bottom: 20px; box-shadow: var(--shadow); font-size: 16px; line-height: 1.9; color: var(--text2); }
    .content-text { white-space: pre-wrap; word-break: break-word; }
    .video-wrapper { background: #000; border-radius: var(--r); overflow: hidden; margin-bottom: 20px; box-shadow: 0 4px 24px rgba(0,0,0,0.18); }
    .course-video { width: 100%; max-height: 520px; display: block; background: #000; }
    .video-fallback { padding: 32px; text-align: center; color: var(--text3); font-size: 14px; }
    .video-fallback a { color: var(--primary); text-decoration: underline; }
    .bottom-nav { display: flex; justify-content: space-between; align-items: center; margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--border); }
    .sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 35; }
    .sidebar-overlay.show { display: block; }
    @media (max-width: 768px) {
      .sidebar { transform: translateX(100%); }
      .sidebar.open { transform: translateX(0); }
      .main { margin-right: 0; }
      .mobile-menu-btn { display: flex; }
      .content { padding: 20px 16px 60px; }
      .page-content { padding: 22px 18px; }
      .page-hero { padding: 28px 22px; }
      .page-hero-title { font-size: 20px; }
      .header { padding: 0 14px; }
      .course-video { max-height: 260px; }
    }
    @media print {
      .sidebar, .header, .btn, .mobile-menu-btn, .sidebar-overlay { display: none !important; }
      .main { margin-right: 0 !important; }
      .page-slide { display: block !important; page-break-after: always; }
      .content { max-width: 100%; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar()"></div>
    <nav class="sidebar" id="sidebar">
      <div class="sidebar-top">
        <div class="course-brand">
          <div class="course-icon">${escapeHtml(courseTitle.charAt(0))}</div>
          <div class="course-name">${escapeHtml(courseTitle)}</div>
        </div>
        <div class="course-stats">${pages.length} עמודים</div>
      </div>
      <div class="sidebar-list">
        ${sidebarItems}
      </div>
    </nav>
    <main class="main">
      <header class="header">
        <div class="header-right">
          <button class="mobile-menu-btn" onclick="toggleSidebar()">&#9776;</button>
          <div class="page-counter">
            <span class="page-counter-cur" id="pageNum">1</span>
            <span class="page-counter-sep">/</span>
            <span class="page-counter-total">${pages.length}</span>
          </div>
        </div>
        <div class="header-left">
          <button class="btn" id="prevBtn" onclick="prevPage()" disabled>&rarr; הקודם</button>
          <button class="btn btn-primary" id="nextBtn" onclick="nextPage()">הבא &larr;</button>
        </div>
      </header>
      <div class="content">
        ${pageSlides}
        <div class="bottom-nav">
          <button class="btn" onclick="prevPage()" id="prevBtn2" disabled>&rarr; העמוד הקודם</button>
          <button class="btn btn-primary" onclick="nextPage()" id="nextBtn2">העמוד הבא &larr;</button>
        </div>
      </div>
    </main>
  </div>
  <script>
    var cur = 0;
    var total = ${pages.length};
    function goToPage(idx) {
      if (idx < 0 || idx >= total) return;
      var old = document.getElementById('page-' + cur);
      if (old) old.style.display = 'none';
      cur = idx;
      var newEl = document.getElementById('page-' + cur);
      if (newEl) newEl.style.display = 'block';
      document.querySelectorAll('.sidebar-item').forEach(function(el, i) {
        el.classList.toggle('active', i === idx);
      });
      var active = document.getElementById('sidebar-' + idx);
      if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      document.getElementById('pageNum').textContent = cur + 1;
      ['prevBtn','prevBtn2'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.disabled = cur === 0;
      });
      ['nextBtn','nextBtn2'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.disabled = cur === total - 1;
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (window.innerWidth <= 768) closeSidebar();
    }
    function nextPage() { goToPage(cur + 1); }
    function prevPage() { goToPage(cur - 1); }
    function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebarOverlay').classList.toggle('show');
    }
    function closeSidebar() {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('show');
    }
    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { nextPage(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { prevPage(); e.preventDefault(); }
    });
  </script>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Missing env vars");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization");

    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { courseId } = await req.json();
    if (!courseId) throw new Error("Missing courseId");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: course } = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .maybeSingle();

    if (!course) throw new Error("Course not found");
    if (course.owner_id !== user.id) throw new Error("Unauthorized");

    const { data: assets } = await supabase
      .from("course_assets")
      .select("*")
      .eq("course_id", courseId)
      .order("created_at");

    if (!assets || assets.length === 0) throw new Error("No assets found for this course");

    const allPages: PageItem[] = [];

    for (const asset of assets) {
      console.log(`[CONVERT] Processing asset: ${asset.original_name} (${asset.file_type})`);

      if (isVideoAsset(asset)) {
        console.log(`[CONVERT] Video detected: ${asset.original_name}`);
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from("course-assets")
          .createSignedUrl(asset.storage_path, 604800);

        if (signedUrlError || !signedUrlData?.signedUrl) {
          console.error(`[CONVERT] Signed URL failed for ${asset.original_name}:`, signedUrlError);
          allPages.push({
            type: "text",
            title: asset.original_name,
            content: "לא ניתן ליצור קישור לסרטון. אנא נסה שוב מאוחר יותר.",
          });
        } else {
          const nameWithoutExt = asset.original_name.replace(/\.[^/.]+$/, "");
          allPages.push({
            type: "video",
            title: nameWithoutExt,
            videoUrl: signedUrlData.signedUrl,
            originalName: asset.original_name,
          });
        }
        continue;
      }

      const { data: fileData, error: downloadError } = await supabase.storage
        .from("course-assets")
        .download(asset.storage_path);

      if (downloadError || !fileData) {
        console.error(`[CONVERT] Download failed for ${asset.original_name}:`, downloadError);
        allPages.push({ type: "text", title: asset.original_name, content: "לא ניתן לטעון את הקובץ" });
        continue;
      }

      const buffer = await fileData.arrayBuffer();
      const fileType = asset.file_type?.toLowerCase();

      try {
        let sections: string[] = [];

        if (fileType === "docx") {
          sections = await extractDocx(buffer);
        } else if (fileType === "pdf") {
          sections = await extractPdfText(buffer);
        } else if (fileType === "pptx") {
          sections = await extractPptx(buffer);
        } else {
          const text = new TextDecoder().decode(buffer);
          const parts = text.split(/\n\n+/).filter((s) => s.trim().length > 20);
          sections = parts.length > 0 ? parts : [text];
        }

        sections.forEach((content, idx) => {
          const firstLine = content.split("\n")[0].trim();
          const title = firstLine.length > 5 && firstLine.length <= 80
            ? firstLine
            : `${asset.original_name} - חלק ${idx + 1}`;
          allPages.push({ type: "text", title, content });
        });
      } catch (extractErr: any) {
        console.error(`[CONVERT] Extraction failed for ${asset.original_name}:`, extractErr.message);
        allPages.push({ type: "text", title: asset.original_name, content: `שגיאה בחילוץ תוכן: ${extractErr.message}` });
      }
    }

    if (allPages.length === 0) {
      allPages.push({ type: "text", title: course.title, content: "לא נמצא תוכן בקבצים המועלים" });
    }

    const html = buildHtml(course.title, allPages);

    return new Response(
      JSON.stringify({ html, filename: `${course.title}.html` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[CONVERT-DIRECT] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
