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
              <div class="questions-accent"></div>
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
                  <p class="question-prompt">${escapeHtml(q.prompt)}</p>
                  <div class="options-list">
                    ${opts.map((opt: any, oi: number) => `
                      <button class="option-btn" onclick="selectAnswer('q-${index}-${qi}', ${oi}, ${safeCorrectIdx})">
                        <span class="option-letter">${String.fromCharCode(1488 + oi)}</span>
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
        <div class="page-slide" id="page-${index}" style="display: ${index === 0 ? "block" : "none"}">
          <div class="page-hero">
            <div class="page-hero-badge">${index + 1} / ${pages.length}</div>
            <h1 class="page-hero-title">${escapeHtml(sectionTitle)}</h1>
          </div>
          <div class="page-content">${page.html_content}</div>
          ${questionsHtml}
        </div>
      `;
    }).join("\n");

    const sidebarItemsData = pages.map((page: any, index: number) => {
      const section = sections.find((s: any) => s.id === page.section_id);
      return { title: section?.title || `עמוד ${index + 1}`, index };
    });

    const sidebarHtml = sidebarItemsData.map((item) =>
      `<button class="sidebar-item${item.index === 0 ? " active" : ""}" onclick="goToPage(${item.index})" id="sidebar-${item.index}">
        <span class="sidebar-num">${item.index + 1}</span>
        <span class="sidebar-title">${escapeHtml(item.title)}</span>
        <span class="sidebar-check" id="check-${item.index}">&#10003;</span>
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
      --sidebar-w: 280px;
      --header-h: 60px;
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --primary-light: #eff6ff;
      --primary-mid: #dbeafe;
      --accent: #f59e0b;
      --accent-dark: #d97706;
      --bg: #f1f5f9;
      --surface: #ffffff;
      --surface2: #f8fafc;
      --border: #e2e8f0;
      --border-light: #f1f5f9;
      --text: #0f172a;
      --text2: #334155;
      --text3: #64748b;
      --text4: #94a3b8;
      --success: #16a34a;
      --success-bg: #f0fdf4;
      --success-border: #bbf7d0;
      --error: #dc2626;
      --error-bg: #fef2f2;
      --error-border: #fecaca;
      --shadow: 0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.05);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
      --r: 10px;
      --r-sm: 6px;
    }

    body {
      font-family: 'Heebo', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      direction: rtl;
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }

    .layout { display: flex; min-height: 100vh; }

    /* ── SIDEBAR ── */
    .sidebar {
      width: var(--sidebar-w);
      background: #1e293b;
      position: fixed;
      top: 0; right: 0; bottom: 0;
      z-index: 40;
      display: flex;
      flex-direction: column;
      transition: transform 0.3s ease;
      overflow: hidden;
    }

    .sidebar-top {
      background: #0f172a;
      padding: 20px 18px 16px;
      flex-shrink: 0;
    }

    .course-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .course-icon {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      background: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 900;
      font-size: 17px;
      flex-shrink: 0;
      letter-spacing: -1px;
    }

    .course-name {
      font-size: 14px;
      font-weight: 700;
      color: #f1f5f9;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .course-stats {
      display: flex;
      gap: 14px;
      font-size: 12px;
      color: #64748b;
      margin-bottom: 14px;
    }

    .sidebar-search-wrap { position: relative; }

    .sidebar-search {
      width: 100%;
      padding: 8px 32px 8px 10px;
      background: #334155;
      border: 1px solid #475569;
      border-radius: var(--r-sm);
      color: #e2e8f0;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
    }

    .sidebar-search::placeholder { color: #64748b; }
    .sidebar-search:focus { border-color: var(--primary); }

    .search-icon {
      position: absolute;
      right: 9px;
      top: 50%;
      transform: translateY(-50%);
      color: #64748b;
      font-size: 14px;
      pointer-events: none;
    }

    .sidebar-prog-wrap {
      margin-top: 12px;
    }

    .sidebar-prog-bar {
      height: 3px;
      background: #334155;
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 5px;
    }

    .sidebar-prog-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 2px;
      transition: width 0.5s ease;
    }

    .sidebar-prog-labels {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #64748b;
    }

    .sidebar-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0 20px;
      scrollbar-width: thin;
      scrollbar-color: #334155 transparent;
    }

    .sidebar-list::-webkit-scrollbar { width: 3px; }
    .sidebar-list::-webkit-scrollbar-thumb { background: #334155; }

    .sidebar-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 18px;
      background: none;
      border: none;
      border-right: 3px solid transparent;
      color: #94a3b8;
      font-family: inherit;
      font-size: 13px;
      cursor: pointer;
      text-align: right;
      transition: all 0.15s;
      line-height: 1.35;
    }

    .sidebar-item:hover { background: #334155; color: #e2e8f0; }

    .sidebar-item.active {
      background: rgba(37,99,235,0.15);
      border-right-color: var(--primary);
      color: #93c5fd;
      font-weight: 600;
    }

    .sidebar-item.visited { color: #cbd5e1; }

    .sidebar-num {
      min-width: 22px;
      height: 22px;
      border-radius: 5px;
      background: #334155;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      flex-shrink: 0;
    }

    .sidebar-item.active .sidebar-num {
      background: var(--primary);
      color: white;
    }

    .sidebar-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .sidebar-check {
      font-size: 12px;
      color: var(--accent);
      opacity: 0;
      transition: opacity 0.2s;
      flex-shrink: 0;
    }

    .sidebar-item.visited .sidebar-check { opacity: 1; }
    .sidebar-item.hidden { display: none; }

    .no-results {
      padding: 24px;
      text-align: center;
      font-size: 13px;
      color: #475569;
    }

    /* ── MAIN ── */
    .main {
      flex: 1;
      margin-right: var(--sidebar-w);
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    /* ── HEADER ── */
    .header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      height: var(--header-h);
      position: sticky;
      top: 0;
      z-index: 30;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 28px;
      box-shadow: var(--shadow);
    }

    .header-right { display: flex; align-items: center; gap: 14px; }

    .mobile-menu-btn {
      display: none;
      padding: 6px 8px;
      border: none;
      background: none;
      cursor: pointer;
      color: var(--text3);
      font-size: 20px;
      border-radius: var(--r-sm);
    }

    .mobile-menu-btn:hover { background: var(--bg); }

    .page-counter {
      display: flex;
      align-items: baseline;
      gap: 4px;
    }

    .page-counter-cur {
      font-size: 22px;
      font-weight: 800;
      color: var(--text);
    }

    .page-counter-sep { font-size: 16px; color: var(--text4); font-weight: 300; }

    .page-counter-total { font-size: 15px; color: var(--text4); }

    .header-left { display: flex; align-items: center; gap: 8px; }

    .kbd-hint {
      font-size: 11px;
      color: var(--text4);
      display: flex;
      align-items: center;
      gap: 3px;
      margin-left: 6px;
    }

    .kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 18px;
      padding: 0 4px;
      border: 1px solid var(--border);
      border-radius: 3px;
      background: var(--bg);
      font-size: 10px;
      font-family: monospace;
      color: var(--text4);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 18px;
      border-radius: var(--r-sm);
      font-size: 13px;
      font-family: inherit;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text2);
    }

    .btn:hover:not(:disabled) { background: var(--bg); }
    .btn:disabled { opacity: 0.4; cursor: default; }

    .btn-primary {
      background: var(--primary);
      border-color: var(--primary);
      color: white;
    }

    .btn-primary:hover:not(:disabled) { background: var(--primary-dark); border-color: var(--primary-dark); }

    /* ── CONTENT ── */
    .content {
      max-width: 840px;
      margin: 0 auto;
      padding: 32px 28px 80px;
      width: 100%;
    }

    /* ── PAGE HERO ── */
    .page-hero {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border-radius: var(--r);
      padding: 36px 40px;
      margin-bottom: 24px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }

    .page-hero::before {
      content: '';
      position: absolute;
      top: -40px; left: -40px;
      width: 180px; height: 180px;
      border-radius: 50%;
      background: rgba(37,99,235,0.12);
    }

    .page-hero::after {
      content: '';
      position: absolute;
      bottom: -30px; right: -30px;
      width: 130px; height: 130px;
      border-radius: 50%;
      background: rgba(245,158,11,0.08);
    }

    .page-hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(37,99,235,0.25);
      color: #93c5fd;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 14px;
      border-radius: 20px;
      margin-bottom: 14px;
      border: 1px solid rgba(37,99,235,0.3);
      position: relative;
      z-index: 1;
    }

    .page-hero-title {
      font-size: 28px;
      font-weight: 900;
      color: #f1f5f9;
      line-height: 1.25;
      position: relative;
      z-index: 1;
      letter-spacing: -0.5px;
    }

    /* ── SCORE BAR ── */
    .score-bar {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r);
      padding: 14px 20px;
      margin-bottom: 20px;
      box-shadow: var(--shadow);
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .score-bar-label { font-size: 13px; font-weight: 600; color: var(--text2); white-space: nowrap; }
    .score-bar-track { flex: 1; height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden; }
    .score-bar-fill { height: 100%; background: var(--primary); transition: width 0.5s ease; border-radius: 3px; }
    .score-bar-value { font-size: 13px; color: var(--text3); white-space: nowrap; font-weight: 500; }

    /* ── PAGE CONTENT ── */
    .page-content {
      background: var(--surface);
      border-radius: var(--r);
      border: 1px solid var(--border);
      padding: 32px 36px;
      margin-bottom: 20px;
      box-shadow: var(--shadow);
      font-size: 16px;
      line-height: 1.8;
      color: var(--text2);
    }

    .page-content h2 { font-size: 22px; font-weight: 800; color: var(--text); margin-bottom: 14px; line-height: 1.3; }
    .page-content h3 { font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 10px; }
    .page-content p { margin-bottom: 12px; }
    .page-content ul, .page-content ol { margin-bottom: 12px; padding-right: 22px; }
    .page-content li { margin-bottom: 5px; }
    .page-content strong { font-weight: 700; color: var(--text); }

    .page-content .bg-slate-50,
    .page-content [class*="bg-slate"] { background: var(--surface2); padding: 18px; border-radius: var(--r); border: 1px solid var(--border); margin-bottom: 14px; }

    .page-content .bg-sky-50,
    .page-content [class*="bg-sky"] { background: var(--primary-light); padding: 18px; border-radius: var(--r); border: 1px solid #bfdbfe; border-right: 4px solid var(--primary); margin-bottom: 14px; }

    .page-content .bg-teal-50,
    .page-content [class*="bg-teal"] { background: #f0fdfa; padding: 18px; border-radius: var(--r); border: 1px solid #99f6e4; border-right: 4px solid #0d9488; margin-bottom: 14px; }

    .page-content [class*="font-semibold"] { font-weight: 600; }
    .page-content [class*="font-bold"] { font-weight: 700; }
    .page-content [class*="text-3xl"] { font-size: 24px; }
    .page-content [class*="text-2xl"] { font-size: 20px; }
    .page-content [class*="text-xl"] { font-size: 18px; }
    .page-content [class*="text-lg"] { font-size: 17px; }
    .page-content [class*="text-slate-700"] { color: var(--text2); }
    .page-content [class*="text-slate-800"] { color: #1e293b; }
    .page-content [class*="text-slate-900"] { color: var(--text); }
    .page-content [class*="text-teal-900"] { color: #134e4a; }
    .page-content [class*="text-sky-800"] { color: #075985; }
    .page-content [class*="space-y-8"] > * + * { margin-top: 22px; }
    .page-content [class*="space-y-6"] > * + * { margin-top: 16px; }
    .page-content [class*="space-y-4"] > * + * { margin-top: 12px; }
    .page-content [class*="gap-2"] { display: flex; gap: 8px; align-items: center; }
    .page-content [class*="rounded-full"] { border-radius: 999px; }
    .page-content [class*="rounded-xl"] { border-radius: 12px; }
    .page-content [class*="w-2"][class*="h-2"] { width: 8px; height: 8px; display: inline-block; }
    .page-content [class*="bg-slate-400"] { background: #94a3b8; }
    .page-content [class*="bg-sky-500"] { background: #0ea5e9; }
    .page-content [class*="whitespace-pre-wrap"] { white-space: pre-wrap; }
    .page-content [class*="leading-relaxed"] { line-height: 1.8; }
    .page-content [class*="border-b"] { border-bottom: 1px solid var(--border); }
    .page-content details { border-radius: var(--r); overflow: hidden; }
    .page-content summary { cursor: pointer; user-select: none; }

    /* ── QUESTIONS ── */
    .questions-section { margin-top: 24px; }

    .questions-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
    }

    .questions-accent {
      width: 4px;
      height: 26px;
      background: var(--accent);
      border-radius: 4px;
      flex-shrink: 0;
    }

    .questions-header h3 { font-size: 17px; font-weight: 800; color: var(--text); }

    .question-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r);
      padding: 22px;
      margin-bottom: 14px;
      box-shadow: var(--shadow);
      transition: border-color 0.3s, background 0.3s;
    }

    .question-card.correct { border-color: var(--success-border); background: var(--success-bg); }
    .question-card.incorrect { border-color: var(--error-border); background: var(--error-bg); }

    .question-prompt {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 16px;
      line-height: 1.55;
      color: var(--text);
    }

    .options-list { display: flex; flex-direction: column; gap: 7px; }

    .option-btn {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border: 1.5px solid var(--border);
      background: var(--surface);
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-family: inherit;
      text-align: right;
      width: 100%;
      line-height: 1.4;
      transition: all 0.15s;
      color: var(--text2);
    }

    .option-btn:hover:not(.selected):not(.disabled) {
      background: var(--primary-light);
      border-color: #93c5fd;
      color: var(--text);
    }

    .option-btn.selected { background: var(--primary-mid); border-color: var(--primary); }
    .option-btn.correct-answer { background: #dcfce7; border-color: #86efac; }
    .option-btn.wrong-answer { background: #fee2e2; border-color: #fca5a5; }
    .option-btn.disabled { cursor: default; pointer-events: none; }

    .option-letter {
      min-width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--bg);
      font-weight: 700;
      font-size: 13px;
      color: var(--text3);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.15s;
    }

    .option-btn:hover:not(.selected):not(.disabled) .option-letter {
      background: #bfdbfe;
      color: var(--primary-dark);
    }

    .option-btn.correct-answer .option-letter { background: #bbf7d0; color: #166534; }
    .option-btn.wrong-answer .option-letter { background: #fecaca; color: #991b1b; }
    .option-text { flex: 1; }

    .feedback {
      margin-top: 12px;
      padding: 12px 16px;
      border-radius: var(--r-sm);
      font-size: 14px;
      font-weight: 600;
      display: none;
    }

    .feedback.show { display: block; }
    .feedback.correct { background: #dcfce7; color: #166534; border: 1px solid var(--success-border); }
    .feedback.incorrect { background: #fee2e2; color: #991b1b; border: 1px solid var(--error-border); }

    /* ── BOTTOM NAV ── */
    .bottom-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 28px;
      padding-top: 22px;
      border-top: 1px solid var(--border);
    }

    /* ── COMPLETION ── */
    .completion-banner {
      background: linear-gradient(135deg, #064e3b 0%, #065f46 100%);
      border-radius: var(--r);
      padding: 48px 32px;
      text-align: center;
      margin-top: 32px;
      box-shadow: var(--shadow-md);
    }

    .completion-icon {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      background: rgba(255,255,255,0.15);
      color: #4ade80;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 18px;
      font-size: 34px;
      border: 2px solid rgba(74,222,128,0.4);
    }

    .completion-banner h3 { font-size: 26px; font-weight: 900; color: #f0fdf4; margin-bottom: 8px; }
    .completion-banner p { font-size: 18px; color: #bbf7d0; font-weight: 500; }

    /* ── OVERLAY ── */
    .sidebar-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 35;
      backdrop-filter: blur(2px);
    }

    .sidebar-overlay.show { display: block; }

    /* ── RESPONSIVE ── */
    @media (max-width: 768px) {
      .sidebar { transform: translateX(100%); }
      .sidebar.open { transform: translateX(0); }
      .main { margin-right: 0; }
      .mobile-menu-btn { display: flex; }
      .content { padding: 20px 16px 60px; }
      .page-content { padding: 22px 18px; }
      .page-hero { padding: 28px 22px; }
      .page-hero-title { font-size: 22px; }
      .header { padding: 0 14px; }
      .kbd-hint { display: none; }
    }

    @media print {
      .sidebar, .header, .btn, .mobile-menu-btn, .sidebar-overlay, .kbd-hint { display: none !important; }
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
          <div class="course-icon">${escapeHtml(course.title.charAt(0))}</div>
          <div class="course-name">${escapeHtml(course.title)}</div>
        </div>
        <div class="course-stats">
          <span>${pages.length} עמודים</span>
          ${questions.length > 0 ? `<span>${questions.length} שאלות</span>` : ""}
        </div>
        <div class="sidebar-search-wrap">
          <span class="search-icon">&#128269;</span>
          <input type="text" class="sidebar-search" placeholder="חיפוש..." oninput="filterSidebar(this.value)" />
        </div>
        ${questions.length > 0 ? `
        <div class="sidebar-prog-wrap">
          <div class="sidebar-prog-bar"><div class="sidebar-prog-fill" id="sidebarProg" style="width:0%"></div></div>
          <div class="sidebar-prog-labels">
            <span id="progLabel">0/${questions.length} שאלות</span>
            <span id="scoreLabel">0%</span>
          </div>
        </div>` : ""}
      </div>
      <div class="sidebar-list" id="sidebarList">
        ${sidebarHtml}
        <div class="no-results" id="noResults" style="display:none">לא נמצאו תוצאות</div>
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
          <span class="kbd-hint"><kbd class="kbd">&larr;</kbd><kbd class="kbd">&rarr;</kbd></span>
          <button class="btn" id="prevBtn" onclick="prevPage()" disabled>&rarr; הקודם</button>
          <button class="btn btn-primary" id="nextBtn" onclick="nextPage()">הבא &larr;</button>
        </div>
      </header>

      <div class="content">
        ${questions.length > 0 ? `
        <div class="score-bar" id="scoreSection">
          <span class="score-bar-label">התקדמות</span>
          <div class="score-bar-track"><div class="score-bar-fill" id="progressFill" style="width:0%"></div></div>
          <span class="score-bar-value" id="scoreText">0 / ${questions.length}</span>
        </div>` : ""}

        ${pagesHtml}

        <div class="bottom-nav">
          <button class="btn" onclick="prevPage()" id="prevBtn2" disabled>&rarr; העמוד הקודם</button>
          <button class="btn btn-primary" onclick="nextPage()" id="nextBtn2">העמוד הבא &larr;</button>
        </div>

        <div id="completionBanner" class="completion-banner" style="display:none">
          <div class="completion-icon">&#10003;</div>
          <h3>כל הכבוד, סיימת את הקורס!</h3>
          <p id="finalScore"></p>
        </div>
      </div>
    </main>
  </div>

  <script>
    var cur = 0;
    var total = ${pages.length};
    var totalQ = ${questions.length};
    var answered = 0;
    var correct = 0;
    var visited = new Set([0]);
    var sidebarData = ${sidebarDataJson};

    function goToPage(idx) {
      if (idx < 0 || idx >= total) return;
      var old = document.getElementById('page-' + cur);
      if (old) old.style.display = 'none';

      cur = idx;
      visited.add(idx);

      var newEl = document.getElementById('page-' + cur);
      if (newEl) newEl.style.display = 'block';

      document.querySelectorAll('.sidebar-item').forEach(function(el, i) {
        el.classList.toggle('active', i === idx);
        if (visited.has(i) && i !== idx) el.classList.add('visited');
      });

      var active = document.getElementById('sidebar-' + idx);
      if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

      document.getElementById('pageNum').textContent = cur + 1;

      ['prevBtn','prevBtn2'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.disabled = cur === 0;
      });
      ['nextBtn','nextBtn2'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.disabled = cur === total - 1;
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

    function filterSidebar(q) {
      var items = document.querySelectorAll('.sidebar-item');
      var noRes = document.getElementById('noResults');
      var found = 0;
      q = q.trim().toLowerCase();
      items.forEach(function(el, i) {
        var t = sidebarData[i] ? sidebarData[i].title.toLowerCase() : '';
        var match = !q || t.indexOf(q) !== -1 || String(i+1).indexOf(q) !== -1;
        el.classList.toggle('hidden', !match);
        if (match) found++;
      });
      noRes.style.display = found === 0 ? 'block' : 'none';
    }

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
        fb.textContent = isOk ? '&#10003; תשובה נכונה!' : '&#10007; תשובה שגויה. התשובה הנכונה מסומנת בירוק.';
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
      var sp = document.getElementById('sidebarProg');
      var pl = document.getElementById('progLabel');
      var sl = document.getElementById('scoreLabel');

      if (st) st.textContent = answered + ' / ' + totalQ + ' (' + pct + '% נכונות)';
      if (pf) pf.style.width = aPct + '%';
      if (sp) sp.style.width = aPct + '%';
      if (pl) pl.textContent = answered + '/' + totalQ + ' שאלות';
      if (sl) sl.textContent = pct + '%';

      if (answered === totalQ && totalQ > 0) {
        var banner = document.getElementById('completionBanner');
        if (banner) {
          banner.style.display = 'block';
          document.getElementById('finalScore').textContent = 'ציון: ' + correct + ' מתוך ' + totalQ + ' (' + pct + '%)';
          banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }

    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { nextPage(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { prevPage(); e.preventDefault(); }
    });
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
