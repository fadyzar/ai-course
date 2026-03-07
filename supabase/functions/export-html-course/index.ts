import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

    const [sectionsResult, pagesResult, questionsResult] = await Promise.all([
      supabase.from("course_sections").select("*").eq("course_id", courseId).order("order_index"),
      supabase.from("course_pages").select("*").eq("course_id", courseId).order("order_index"),
      supabase.from("questions").select("*").eq("course_id", courseId),
    ]);

    const sections = sectionsResult.data || [];
    const pages = pagesResult.data || [];
    const questions = questionsResult.data || [];

    const pagesHtml = pages.map((page: any, index: number) => {
      const section = sections.find((s: any) => s.id === page.section_id);
      const pageQuestions = questions.filter((q: any) => q.page_id === page.id);

      const questionsHtml = pageQuestions.length > 0
        ? `<div class="questions-section">
            <div class="questions-header">
              <div class="q-icon">?</div>
              <h3>שאלות לבדיקת הבנה</h3>
            </div>
            ${pageQuestions.map((q: any, qi: number) => {
              const opts = Array.isArray(q.options) ? q.options : [];
              let correctText = Array.isArray(q.correct_answer) ? q.correct_answer[0] : q.correct_answer;
              if (/^\d+$/.test(String(correctText))) {
                const idx = parseInt(String(correctText), 10);
                correctText = opts[idx] || correctText;
              }
              const correctIdx = opts.findIndex((opt: any) => String(opt).trim() === String(correctText).trim());
              const safeCorrectIdx = correctIdx >= 0 ? correctIdx : 0;
              return `
                <div class="question-card" id="q-${index}-${qi}">
                  <p class="question-num">שאלה ${qi + 1}</p>
                  <p class="question-prompt">${escapeHtml(q.prompt)}</p>
                  <div class="options-list">
                    ${opts.map((opt: any, oi: number) => `
                      <button class="option-btn" onclick="selectAnswer('q-${index}-${qi}', ${oi}, ${safeCorrectIdx})">
                        <span class="option-letter">${String.fromCharCode(65 + oi)}</span>
                        <span class="option-text">${escapeHtml(String(opt))}</span>
                      </button>
                    `).join("")}
                  </div>
                  <div class="feedback" id="feedback-q-${index}-${qi}"></div>
                </div>
              `;
            }).join("")}
          </div>`
        : "";

      const sectionTitle = section?.title || `עמוד ${index + 1}`;

      return `
        <div class="slide" id="slide-${index}" style="display:${index === 0 ? "flex" : "none"}">
          <div class="slide-inner">
            <div class="slide-header">
              <div class="slide-counter-pill">${index + 1} / ${pages.length}</div>
              <h1 class="slide-title">${escapeHtml(sectionTitle)}</h1>
            </div>
            <div class="slide-body">
              ${page.html_content}
            </div>
            ${questionsHtml}
          </div>
        </div>
      `;
    }).join("\n");

    const sidebarItemsData = pages.map((page: any, index: number) => {
      const section = sections.find((s: any) => s.id === page.section_id);
      return { title: section?.title || `עמוד ${index + 1}`, index };
    });

    const sidebarHtml = sidebarItemsData.map((item) =>
      `<button class="toc-item${item.index === 0 ? " active" : ""}" onclick="goToSlide(${item.index})" id="toc-${item.index}">
        <span class="toc-num">${item.index + 1}</span>
        <span class="toc-title">${escapeHtml(item.title)}</span>
        <span class="toc-dot" id="dot-${item.index}"></span>
      </button>`
    ).join("\n");

    const sidebarDataJson = JSON.stringify(sidebarItemsData);

    const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(course.title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap');

    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --toc-w: 300px;
      --bg: #0d1117;
      --surface: #161b22;
      --surface2: #21262d;
      --border: #30363d;
      --accent: #58a6ff;
      --accent2: #f0883e;
      --accent3: #3fb950;
      --text: #e6edf3;
      --text2: #8b949e;
      --text3: #6e7681;
      --gold: #d29922;
      --slide-bg: #13171f;
    }

    body {
      font-family: 'Heebo', sans-serif;
      background: var(--bg);
      color: var(--text);
      direction: rtl;
      height: 100vh;
      overflow: hidden;
      display: flex;
    }

    /* ── TOC PANEL ── */
    .toc {
      width: var(--toc-w);
      background: var(--surface);
      border-left: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      height: 100vh;
      flex-shrink: 0;
      z-index: 10;
    }

    .toc-header {
      padding: 24px 20px 16px;
      border-bottom: 1px solid var(--border);
    }

    .toc-course-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--accent), #1f6feb);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 900;
      color: white;
      margin-bottom: 12px;
      letter-spacing: -1px;
    }

    .toc-course-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .toc-meta {
      display: flex;
      gap: 14px;
      margin-top: 10px;
    }

    .toc-meta-pill {
      font-size: 11px;
      color: var(--text3);
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 3px 10px;
    }

    .toc-progress {
      padding: 12px 20px;
      border-bottom: 1px solid var(--border);
    }

    .toc-prog-track {
      height: 3px;
      background: var(--surface2);
      border-radius: 2px;
      margin-bottom: 6px;
      overflow: hidden;
    }

    .toc-prog-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), #1f6feb);
      border-radius: 2px;
      transition: width 0.4s cubic-bezier(.4,0,.2,1);
    }

    .toc-prog-text {
      font-size: 11px;
      color: var(--text3);
      display: flex;
      justify-content: space-between;
    }

    .toc-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
      scrollbar-width: thin;
      scrollbar-color: var(--border) transparent;
    }

    .toc-list::-webkit-scrollbar { width: 3px; }
    .toc-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

    .toc-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 9px 20px;
      background: none;
      border: none;
      border-right: 3px solid transparent;
      color: var(--text2);
      font-family: inherit;
      font-size: 13px;
      cursor: pointer;
      text-align: right;
      transition: all 0.15s;
      line-height: 1.4;
    }

    .toc-item:hover { background: var(--surface2); color: var(--text); }

    .toc-item.active {
      background: rgba(88,166,255,0.08);
      border-right-color: var(--accent);
      color: var(--accent);
      font-weight: 600;
    }

    .toc-item.visited { color: #c9d1d9; }

    .toc-num {
      min-width: 24px;
      height: 24px;
      border-radius: 6px;
      background: var(--surface2);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      color: var(--text3);
      flex-shrink: 0;
    }

    .toc-item.active .toc-num {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }

    .toc-item.visited .toc-num {
      background: rgba(63,185,80,0.15);
      border-color: rgba(63,185,80,0.3);
      color: var(--accent3);
    }

    .toc-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .toc-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent3);
      opacity: 0;
      flex-shrink: 0;
      transition: opacity 0.2s;
    }

    .toc-item.visited .toc-dot { opacity: 1; }

    /* ── MAIN AREA ── */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    /* ── TOP BAR ── */
    .topbar {
      height: 56px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 32px;
      flex-shrink: 0;
    }

    .topbar-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .nav-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface2);
      color: var(--text2);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }

    .nav-btn:hover:not(:disabled) {
      background: var(--border);
      color: var(--text);
      border-color: #484f58;
    }

    .nav-btn:disabled { opacity: 0.3; cursor: default; }

    .nav-btn.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #0d1117;
    }

    .nav-btn.primary:hover:not(:disabled) {
      background: #79c0ff;
      border-color: #79c0ff;
    }

    .topbar-center {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .page-dots {
      display: flex;
      gap: 5px;
      align-items: center;
    }

    .page-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--border);
      cursor: pointer;
      transition: all 0.2s;
      border: none;
      padding: 0;
    }

    .page-dot.active {
      background: var(--accent);
      transform: scale(1.4);
    }

    .page-dot.visited { background: rgba(63,185,80,0.5); }

    .topbar-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .page-counter-display {
      font-size: 13px;
      color: var(--text3);
      font-weight: 500;
    }

    .page-counter-display strong {
      color: var(--text);
      font-size: 16px;
      font-weight: 800;
    }

    .kbd-hint {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--text3);
    }

    .kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 20px;
      padding: 0 5px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--surface2);
      font-size: 11px;
      font-family: monospace;
      color: var(--text2);
    }

    /* ── SLIDE AREA ── */
    .slides-viewport {
      flex: 1;
      overflow-y: auto;
      background: var(--slide-bg);
      position: relative;
      scrollbar-width: thin;
      scrollbar-color: var(--border) transparent;
    }

    .slides-viewport::-webkit-scrollbar { width: 6px; }
    .slides-viewport::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    .slide {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      padding: 40px 48px 60px;
      animation: fadeSlide 0.25s ease;
    }

    @keyframes fadeSlide {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .slide-inner {
      max-width: 860px;
      margin: 0 auto;
      width: 100%;
    }

    /* ── SLIDE HEADER ── */
    .slide-header {
      margin-bottom: 32px;
      text-align: center;
    }

    .slide-counter-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(88,166,255,0.1);
      color: var(--accent);
      border: 1px solid rgba(88,166,255,0.25);
      border-radius: 20px;
      padding: 4px 16px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 16px;
      letter-spacing: 0.5px;
    }

    .slide-title {
      font-size: 32px;
      font-weight: 900;
      color: var(--text);
      line-height: 1.25;
      letter-spacing: -0.5px;
    }

    /* ── SLIDE BODY / CONTENT ── */
    .slide-body {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 36px 40px;
      margin-bottom: 24px;
      line-height: 1.85;
      font-size: 16px;
      color: #c9d1d9;
    }

    .slide-body .slide-raw-content {
      margin-bottom: 28px;
      padding-bottom: 28px;
      border-bottom: 1px solid var(--border);
    }

    .slide-body .raw-text {
      line-height: 1.85;
      color: #c9d1d9;
      font-size: 15px;
      white-space: pre-wrap;
    }

    .slide-body .slide-ai-summary {
      background: rgba(88,166,255,0.06);
      border: 1px solid rgba(88,166,255,0.2);
      border-radius: 10px;
      padding: 20px 24px;
    }

    .slide-body .summary-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .slide-body .summary-icon {
      color: var(--accent);
      font-size: 14px;
    }

    .slide-body .summary-label {
      font-size: 12px;
      font-weight: 700;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .slide-body .summary-text {
      color: #c9d1d9;
      line-height: 1.85;
      font-size: 15px;
    }

    /* Fallback for older pages that might have tailwind classes */
    .slide-body h2 { font-size: 22px; font-weight: 800; color: var(--text); margin-bottom: 14px; }
    .slide-body h3 { font-size: 17px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
    .slide-body p { margin-bottom: 10px; }
    .slide-body ul, .slide-body ol { padding-right: 22px; margin-bottom: 12px; }
    .slide-body li { margin-bottom: 5px; }
    .slide-body strong { font-weight: 700; color: var(--text); }
    .slide-body [class*="bg-slate"] {
      background: var(--surface2) !important;
      border: 1px solid var(--border) !important;
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 14px;
    }
    .slide-body [class*="bg-blue"],
    .slide-body [class*="bg-sky"] {
      background: rgba(88,166,255,0.08) !important;
      border: 1px solid rgba(88,166,255,0.2) !important;
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 14px;
    }
    .slide-body [class*="text-slate-700"],
    .slide-body [class*="text-slate-800"],
    .slide-body [class*="text-slate-900"] { color: #c9d1d9 !important; }
    .slide-body [class*="text-blue"],
    .slide-body [class*="text-sky"] { color: var(--accent) !important; }
    .slide-body [class*="whitespace-pre-wrap"] { white-space: pre-wrap; }
    .slide-body [class*="leading-relaxed"] { line-height: 1.85; }
    .slide-body [class*="space-y-6"] > * + * { margin-top: 18px; }
    .slide-body [class*="space-y-4"] > * + * { margin-top: 12px; }
    .slide-body [class*="font-semibold"] { font-weight: 600; }
    .slide-body [class*="font-bold"] { font-weight: 700; }
    .slide-body [class*="text-3xl"] { font-size: 24px; }
    .slide-body [class*="text-2xl"] { font-size: 20px; }
    .slide-body [class*="text-xl"] { font-size: 18px; }

    /* ── QUESTIONS ── */
    .questions-section {
      margin-top: 8px;
    }

    .questions-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 18px;
    }

    .q-icon {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: rgba(240,136,62,0.15);
      border: 1px solid rgba(240,136,62,0.35);
      color: var(--accent2);
      font-size: 14px;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .questions-header h3 {
      font-size: 16px;
      font-weight: 800;
      color: var(--text);
    }

    .question-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 22px 24px;
      margin-bottom: 14px;
      transition: border-color 0.25s, background 0.25s;
    }

    .question-card.correct { border-color: rgba(63,185,80,0.5); background: rgba(63,185,80,0.05); }
    .question-card.incorrect { border-color: rgba(248,81,73,0.5); background: rgba(248,81,73,0.05); }

    .question-num {
      font-size: 11px;
      font-weight: 700;
      color: var(--accent2);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }

    .question-prompt {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 18px;
      line-height: 1.55;
    }

    .options-list { display: flex; flex-direction: column; gap: 8px; }

    .option-btn {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border: 1px solid var(--border);
      background: var(--surface2);
      border-radius: 9px;
      cursor: pointer;
      font-size: 14px;
      font-family: inherit;
      text-align: right;
      width: 100%;
      line-height: 1.4;
      transition: all 0.15s;
      color: var(--text2);
    }

    .option-btn:hover:not(.disabled) {
      background: var(--border);
      border-color: #484f58;
      color: var(--text);
    }

    .option-btn.selected { background: rgba(88,166,255,0.1); border-color: rgba(88,166,255,0.4); }
    .option-btn.correct-answer { background: rgba(63,185,80,0.12); border-color: rgba(63,185,80,0.5); color: #7ee787; }
    .option-btn.wrong-answer { background: rgba(248,81,73,0.1); border-color: rgba(248,81,73,0.4); color: #ff7b72; }
    .option-btn.disabled { cursor: default; pointer-events: none; }

    .option-letter {
      min-width: 28px;
      height: 28px;
      border-radius: 7px;
      background: var(--surface);
      border: 1px solid var(--border);
      font-weight: 700;
      font-size: 12px;
      color: var(--text3);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.15s;
    }

    .option-btn:hover:not(.disabled) .option-letter { border-color: #484f58; color: var(--text); }
    .option-btn.correct-answer .option-letter { background: rgba(63,185,80,0.2); border-color: rgba(63,185,80,0.5); color: #7ee787; }
    .option-btn.wrong-answer .option-letter { background: rgba(248,81,73,0.15); border-color: rgba(248,81,73,0.4); color: #ff7b72; }
    .option-text { flex: 1; }

    .feedback {
      margin-top: 12px;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      display: none;
    }

    .feedback.show { display: flex; align-items: center; gap: 8px; }
    .feedback.correct { background: rgba(63,185,80,0.1); color: #7ee787; border: 1px solid rgba(63,185,80,0.3); }
    .feedback.incorrect { background: rgba(248,81,73,0.08); color: #ff7b72; border: 1px solid rgba(248,81,73,0.3); }

    /* ── SCORE BAR ── */
    .score-bar {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px 20px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .score-bar-label { font-size: 12px; font-weight: 600; color: var(--text2); white-space: nowrap; }
    .score-bar-track { flex: 1; height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden; }
    .score-bar-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent3)); transition: width 0.5s ease; border-radius: 2px; }
    .score-bar-value { font-size: 12px; color: var(--text3); white-space: nowrap; font-weight: 500; }

    /* ── COMPLETION ── */
    .completion-banner {
      background: linear-gradient(135deg, rgba(63,185,80,0.12), rgba(63,185,80,0.05));
      border: 1px solid rgba(63,185,80,0.3);
      border-radius: 14px;
      padding: 48px 32px;
      text-align: center;
      margin-top: 28px;
    }

    .completion-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: rgba(63,185,80,0.15);
      border: 2px solid rgba(63,185,80,0.4);
      color: #7ee787;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-size: 30px;
    }

    .completion-banner h3 { font-size: 24px; font-weight: 900; color: var(--text); margin-bottom: 8px; }
    .completion-banner p { font-size: 17px; color: var(--text2); }

    /* ── RESPONSIVE ── */
    @media (max-width: 900px) {
      .toc { display: none; }
      .slide { padding: 24px 20px 48px; }
      .slide-title { font-size: 24px; }
      .slide-body { padding: 22px 20px; }
      .topbar { padding: 0 16px; }
      .kbd-hint { display: none; }
    }

    @media print {
      .toc, .topbar, .nav-btn, .kbd-hint { display: none !important; }
      .slide { display: block !important; page-break-after: always; }
      .main { height: auto; overflow: visible; }
      .slides-viewport { overflow: visible; height: auto; }
    }
  </style>
</head>
<body>
  <nav class="toc">
    <div class="toc-header">
      <div class="toc-course-icon">${escapeHtml(course.title.charAt(0))}</div>
      <div class="toc-course-title">${escapeHtml(course.title)}</div>
      <div class="toc-meta">
        <span class="toc-meta-pill">${pages.length} עמודים</span>
        ${questions.length > 0 ? `<span class="toc-meta-pill">${questions.length} שאלות</span>` : ""}
      </div>
    </div>
    ${questions.length > 0 ? `
    <div class="toc-progress">
      <div class="toc-prog-track"><div class="toc-prog-fill" id="tocProg" style="width:0%"></div></div>
      <div class="toc-prog-text">
        <span id="tocProgLabel">0 / ${questions.length} שאלות</span>
        <span id="tocScoreLabel">0%</span>
      </div>
    </div>` : ""}
    <div class="toc-list" id="tocList">
      ${sidebarHtml}
    </div>
  </nav>

  <div class="main">
    <header class="topbar">
      <div class="topbar-left">
        <button class="nav-btn" id="prevBtn" onclick="prevSlide()" disabled>&rarr; הקודם</button>
        <button class="nav-btn primary" id="nextBtn" onclick="nextSlide()">הבא &larr;</button>
      </div>
      <div class="topbar-center">
        <div class="page-dots" id="pageDots"></div>
      </div>
      <div class="topbar-right">
        <div class="page-counter-display">
          <strong id="curPage">1</strong><span> / ${pages.length}</span>
        </div>
        <div class="kbd-hint">
          <kbd class="kbd">&larr;</kbd>
          <kbd class="kbd">&rarr;</kbd>
        </div>
      </div>
    </header>

    <div class="slides-viewport" id="viewport">
      ${questions.length > 0 ? `
      <div style="padding: 24px 48px 0; max-width: 908px; margin: 0 auto;">
        <div class="score-bar">
          <span class="score-bar-label">התקדמות שאלות</span>
          <div class="score-bar-track"><div class="score-bar-fill" id="progressFill" style="width:0%"></div></div>
          <span class="score-bar-value" id="scoreText">0 / ${questions.length}</span>
        </div>
      </div>` : ""}

      ${pagesHtml}

      <div id="completionBanner" class="completion-banner" style="display:none; margin: 0 48px 48px; max-width: 860px; margin-left: auto; margin-right: auto;">
        <div class="completion-icon">&#10003;</div>
        <h3>כל הכבוד! סיימת את הקורס</h3>
        <p id="finalScore"></p>
      </div>
    </div>
  </div>

  <script>
    var cur = 0;
    var total = ${pages.length};
    var totalQ = ${questions.length};
    var answered = 0;
    var correct = 0;
    var visited = new Set([0]);
    var sidebarData = ${sidebarDataJson};

    function buildDots() {
      var container = document.getElementById('pageDots');
      if (!container) return;
      var max = Math.min(total, 20);
      for (var i = 0; i < max; i++) {
        var btn = document.createElement('button');
        btn.className = 'page-dot' + (i === 0 ? ' active' : '');
        btn.setAttribute('data-idx', String(i));
        btn.onclick = (function(idx) { return function() { goToSlide(idx); }; })(i);
        btn.title = 'עמוד ' + (i + 1);
        container.appendChild(btn);
      }
    }

    function updateDots() {
      var dots = document.querySelectorAll('.page-dot');
      dots.forEach(function(dot) {
        var idx = parseInt(dot.getAttribute('data-idx'));
        dot.className = 'page-dot' + (idx === cur ? ' active' : (visited.has(idx) ? ' visited' : ''));
      });
    }

    function goToSlide(idx) {
      if (idx < 0 || idx >= total) return;
      var old = document.getElementById('slide-' + cur);
      if (old) old.style.display = 'none';

      cur = idx;
      visited.add(idx);

      var newEl = document.getElementById('slide-' + cur);
      if (newEl) {
        newEl.style.display = 'flex';
        newEl.style.animation = 'none';
        void newEl.offsetWidth;
        newEl.style.animation = '';
      }

      document.querySelectorAll('.toc-item').forEach(function(el, i) {
        el.classList.toggle('active', i === idx);
        if (visited.has(i) && i !== idx) el.classList.add('visited');
      });

      var activeItem = document.getElementById('toc-' + idx);
      if (activeItem) activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

      document.getElementById('curPage').textContent = String(cur + 1);

      var prevBtn = document.getElementById('prevBtn');
      var nextBtn = document.getElementById('nextBtn');
      if (prevBtn) prevBtn.disabled = cur === 0;
      if (nextBtn) nextBtn.disabled = cur === total - 1;

      updateDots();

      var viewport = document.getElementById('viewport');
      if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });

      var tocProg = document.getElementById('tocProg');
      if (tocProg) {
        var pct = Math.round((visited.size / total) * 100);
        tocProg.style.width = pct + '%';
      }
    }

    function nextSlide() { goToSlide(cur + 1); }
    function prevSlide() { goToSlide(cur - 1); }

    function selectAnswer(qId, selIdx, corrIdx) {
      var card = document.getElementById(qId);
      if (!card || card.classList.contains('answered')) return;
      card.classList.add('answered');

      card.querySelectorAll('.option-btn').forEach(function(btn, i) {
        btn.classList.add('disabled');
        if (i === corrIdx) btn.classList.add('correct-answer');
        if (i === selIdx && selIdx !== corrIdx) btn.classList.add('wrong-answer');
        if (i === selIdx) btn.classList.add('selected');
      });

      var isOk = selIdx === corrIdx;
      var fb = document.getElementById('feedback-' + qId);
      if (fb) {
        fb.classList.add('show', isOk ? 'correct' : 'incorrect');
        fb.innerHTML = isOk
          ? '<span>&#10003;</span> תשובה נכונה!'
          : '<span>&#10007;</span> תשובה שגויה. התשובה הנכונה מסומנת.';
      }

      if (isOk) { card.classList.add('correct'); correct++; }
      else { card.classList.add('incorrect'); }

      answered++;
      updateScore();
    }

    function updateScore() {
      var pct = totalQ > 0 ? Math.round((correct / totalQ) * 100) : 0;
      var aPct = totalQ > 0 ? Math.round((answered / totalQ) * 100) : 0;

      var st = document.getElementById('scoreText');
      var pf = document.getElementById('progressFill');
      var tp = document.getElementById('tocProg');
      var tpl = document.getElementById('tocProgLabel');
      var tsl = document.getElementById('tocScoreLabel');

      if (st) st.textContent = answered + ' / ' + totalQ + ' (' + pct + '%)';
      if (pf) pf.style.width = aPct + '%';
      if (tpl) tpl.textContent = answered + ' / ' + totalQ + ' שאלות';
      if (tsl) tsl.textContent = pct + '%';

      if (answered === totalQ && totalQ > 0) {
        var banner = document.getElementById('completionBanner');
        if (banner) {
          banner.style.display = 'block';
          document.getElementById('finalScore').textContent =
            'ציון: ' + correct + ' מתוך ' + totalQ + ' (' + pct + '%)';
          banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }

    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { nextSlide(); e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { prevSlide(); e.preventDefault(); }
    });

    buildDots();
    goToSlide(0);
  </script>
</body>
</html>`;

    return new Response(JSON.stringify({ html, filename: `${course.title}.html` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Export error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
