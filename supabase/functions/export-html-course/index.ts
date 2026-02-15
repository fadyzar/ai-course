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

function escapeJsString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing env vars");
    }

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

      return `
        <div class="page-slide" id="page-${index}" style="display: ${index === 0 ? "block" : "none"}">
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
      `<button class="sidebar-item${item.index === 0 ? " active" : ""}" onclick="goToPage(${item.index})" id="sidebar-${item.index}" title="${escapeHtml(item.title)}">
        <span class="sidebar-num">${item.index + 1}</span>
        <span class="sidebar-title">${escapeHtml(item.title)}</span>
      </button>`
    ).join("\n");

    const sidebarDataJson = JSON.stringify(sidebarItemsData.map((item) => ({
      title: item.title,
      index: item.index,
    })));

    const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(course.title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap');

    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    :root {
      --sidebar-width: 300px;
      --header-height: 64px;
      --primary: #0369a1;
      --primary-light: #e0f2fe;
      --primary-dark: #075985;
      --bg: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --border-light: #f1f5f9;
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #94a3b8;
      --success: #059669;
      --success-bg: #ecfdf5;
      --success-border: #a7f3d0;
      --error: #dc2626;
      --error-bg: #fef2f2;
      --error-border: #fecaca;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
      --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05);
      --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04);
      --radius: 12px;
      --radius-sm: 8px;
    }

    body {
      font-family: 'Heebo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text-primary);
      direction: rtl;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    .app { display: flex; min-height: 100vh; }

    /* Sidebar */
    .sidebar {
      width: var(--sidebar-width);
      background: var(--surface);
      border-left: 1px solid var(--border);
      position: fixed;
      top: 0; right: 0; bottom: 0;
      z-index: 30;
      display: flex;
      flex-direction: column;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .sidebar-header {
      padding: 20px 20px 16px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
    }

    .sidebar-logo {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--primary), var(--primary-dark));
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 800;
      font-size: 16px;
      flex-shrink: 0;
    }

    .sidebar-course-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .sidebar-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 14px;
    }

    .sidebar-meta-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .sidebar-search-wrap {
      position: relative;
    }

    .sidebar-search {
      width: 100%;
      padding: 8px 12px 8px 32px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: 13px;
      font-family: inherit;
      background: var(--bg);
      color: var(--text-primary);
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .sidebar-search:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(3,105,161,0.1);
    }

    .sidebar-search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      font-size: 14px;
      pointer-events: none;
    }

    .sidebar-progress {
      margin-top: 12px;
    }

    .sidebar-progress-bar {
      height: 4px;
      background: var(--border-light);
      border-radius: 2px;
      overflow: hidden;
    }

    .sidebar-progress-fill {
      height: 100%;
      background: var(--primary);
      border-radius: 2px;
      transition: width 0.4s ease;
    }

    .sidebar-progress-text {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Sidebar Items */
    .sidebar-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 12px 20px;
      scrollbar-width: thin;
      scrollbar-color: var(--border) transparent;
    }

    .sidebar-list::-webkit-scrollbar { width: 4px; }
    .sidebar-list::-webkit-scrollbar-track { background: transparent; }
    .sidebar-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

    .sidebar-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      text-align: right;
      padding: 9px 12px;
      border: 1px solid transparent;
      background: none;
      border-radius: var(--radius-sm);
      font-size: 13px;
      font-family: inherit;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s ease;
      margin-bottom: 2px;
      line-height: 1.4;
    }

    .sidebar-item:hover {
      background: var(--border-light);
      color: var(--text-primary);
    }

    .sidebar-item.active {
      background: var(--primary-light);
      color: var(--primary-dark);
      border-color: rgba(3,105,161,0.15);
      font-weight: 600;
    }

    .sidebar-item.visited {
      color: var(--text-primary);
    }

    .sidebar-item.visited::after {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--success);
      flex-shrink: 0;
      margin-right: auto;
    }

    .sidebar-item.hidden { display: none; }

    .sidebar-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      height: 24px;
      border-radius: 6px;
      background: var(--border-light);
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      flex-shrink: 0;
    }

    .sidebar-item.active .sidebar-num {
      background: var(--primary);
      color: white;
    }

    .sidebar-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .no-results {
      text-align: center;
      padding: 32px 16px;
      color: var(--text-muted);
      font-size: 13px;
    }

    /* Main Area */
    .main {
      flex: 1;
      margin-right: var(--sidebar-width);
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    /* Header */
    .header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0 32px;
      height: var(--header-height);
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: var(--shadow-sm);
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .mobile-menu-btn {
      display: none;
      padding: 8px;
      border: none;
      background: none;
      cursor: pointer;
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      font-size: 20px;
    }

    .mobile-menu-btn:hover { background: var(--border-light); }

    .page-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .page-indicator-current {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .page-indicator-total {
      font-size: 14px;
      color: var(--text-muted);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .nav-btn {
      padding: 8px 20px;
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: var(--radius-sm);
      font-size: 14px;
      font-family: inherit;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .nav-btn:hover:not(:disabled) {
      background: var(--border-light);
      border-color: #cbd5e1;
      color: var(--text-primary);
    }

    .nav-btn:disabled { opacity: 0.35; cursor: default; }

    .nav-btn.primary {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }

    .nav-btn.primary:hover:not(:disabled) {
      background: var(--primary-dark);
      border-color: var(--primary-dark);
    }

    .kbd-hint {
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 4px;
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
      background: var(--border-light);
      font-size: 11px;
      font-family: monospace;
      color: var(--text-muted);
    }

    /* Content */
    .content {
      max-width: 860px;
      margin: 0 auto;
      padding: 28px 32px 60px;
      width: 100%;
    }

    .score-section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px 24px;
      margin-bottom: 24px;
      box-shadow: var(--shadow-sm);
    }

    .score-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .score-label { font-size: 14px; font-weight: 600; color: var(--text-secondary); }
    .score-value { font-size: 14px; color: var(--text-muted); }

    .progress-bar {
      height: 6px;
      background: var(--border-light);
      border-radius: 3px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--primary);
      transition: width 0.5s ease;
      border-radius: 3px;
    }

    .page-content {
      background: var(--surface);
      border-radius: var(--radius);
      border: 1px solid var(--border);
      padding: 36px 40px;
      margin-bottom: 24px;
      box-shadow: var(--shadow-sm);
      line-height: 1.75;
      font-size: 16px;
    }

    .page-content h2 { font-size: 26px; font-weight: 700; margin-bottom: 16px; line-height: 1.3; }
    .page-content h3 { font-size: 20px; font-weight: 600; margin-bottom: 12px; line-height: 1.3; }
    .page-content p { margin-bottom: 14px; }
    .page-content ul, .page-content ol { margin-bottom: 14px; padding-right: 24px; }
    .page-content li { margin-bottom: 6px; }

    .page-content .bg-slate-50, .page-content [class*="bg-slate"] { background: #f8fafc; padding: 20px; border-radius: var(--radius); border: 1px solid var(--border); margin-bottom: 16px; }
    .page-content .bg-sky-50, .page-content [class*="bg-sky"] { background: var(--primary-light); padding: 20px; border-radius: var(--radius); border: 1px solid #bae6fd; border-right: 4px solid var(--primary); margin-bottom: 16px; }
    .page-content .bg-teal-50, .page-content [class*="bg-teal"] { background: #f0fdfa; padding: 20px; border-radius: var(--radius); border: 1px solid #99f6e4; border-right: 4px solid #0d9488; margin-bottom: 16px; }
    .page-content [class*="font-semibold"] { font-weight: 600; }
    .page-content [class*="font-bold"] { font-weight: 700; }
    .page-content [class*="text-3xl"] { font-size: 26px; }
    .page-content [class*="text-2xl"] { font-size: 22px; }
    .page-content [class*="text-xl"] { font-size: 18px; }
    .page-content [class*="text-lg"] { font-size: 17px; }
    .page-content [class*="text-base"] { font-size: 16px; }
    .page-content [class*="text-sm"] { font-size: 14px; }
    .page-content [class*="text-slate-700"] { color: #334155; }
    .page-content [class*="text-slate-800"] { color: #1e293b; }
    .page-content [class*="text-slate-900"] { color: #0f172a; }
    .page-content [class*="text-teal-900"] { color: #134e4a; }
    .page-content [class*="text-sky-800"] { color: #075985; }
    .page-content [class*="space-y-8"] > * + * { margin-top: 24px; }
    .page-content [class*="space-y-6"] > * + * { margin-top: 16px; }
    .page-content [class*="space-y-4"] > * + * { margin-top: 12px; }
    .page-content [class*="mb-3"] { margin-bottom: 12px; }
    .page-content [class*="mb-4"] { margin-bottom: 16px; }
    .page-content [class*="gap-2"] { display: flex; gap: 8px; align-items: center; }
    .page-content [class*="rounded-full"] { border-radius: 999px; }
    .page-content [class*="rounded-xl"] { border-radius: 12px; }
    .page-content [class*="w-2"][class*="h-2"] { width: 8px; height: 8px; display: inline-block; }
    .page-content [class*="bg-slate-400"] { background: #94a3b8; }
    .page-content [class*="bg-sky-500"] { background: #0ea5e9; }
    .page-content [class*="whitespace-pre-wrap"] { white-space: pre-wrap; }
    .page-content [class*="leading-relaxed"] { line-height: 1.75; }
    .page-content [class*="border-b"] { border-bottom: 1px solid var(--border); }
    .page-content [class*="border-teal-200"] { border-color: #99f6e4; }
    .page-content details { border-radius: var(--radius); overflow: hidden; }
    .page-content summary { cursor: pointer; user-select: none; }

    /* Questions */
    .questions-section { margin-top: 28px; }

    .questions-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }

    .questions-accent {
      width: 4px;
      height: 28px;
      background: var(--primary);
      border-radius: 4px;
      flex-shrink: 0;
    }

    .questions-header h3 {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .question-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 16px;
      transition: border-color 0.3s, background 0.3s;
      box-shadow: var(--shadow-sm);
    }

    .question-card.correct { border-color: var(--success-border); background: var(--success-bg); }
    .question-card.incorrect { border-color: var(--error-border); background: var(--error-bg); }

    .question-prompt {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 18px;
      line-height: 1.6;
      color: var(--text-primary);
    }

    .options-list { display: flex; flex-direction: column; gap: 8px; }

    .option-btn {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 18px;
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 15px;
      font-family: inherit;
      text-align: right;
      width: 100%;
      line-height: 1.5;
    }

    .option-btn:hover:not(.selected):not(.disabled) {
      background: var(--border-light);
      border-color: #cbd5e1;
      transform: translateX(-2px);
    }

    .option-btn.selected { background: #dbeafe; border-color: #3b82f6; }
    .option-btn.correct-answer { background: #dcfce7; border-color: #22c55e; }
    .option-btn.wrong-answer { background: #fee2e2; border-color: #ef4444; }
    .option-btn.disabled { cursor: default; pointer-events: none; }

    .option-letter {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: var(--border-light);
      font-weight: 700;
      font-size: 14px;
      color: var(--text-muted);
      flex-shrink: 0;
      transition: all 0.2s;
    }

    .option-btn:hover:not(.selected):not(.disabled) .option-letter {
      background: var(--primary-light);
      color: var(--primary);
    }

    .option-btn.correct-answer .option-letter { background: #bbf7d0; color: #166534; }
    .option-btn.wrong-answer .option-letter { background: #fecaca; color: #991b1b; }

    .option-text { flex: 1; }

    .feedback {
      margin-top: 14px;
      padding: 14px 18px;
      border-radius: var(--radius-sm);
      font-size: 14px;
      font-weight: 600;
      display: none;
      line-height: 1.5;
    }

    .feedback.show { display: block; }
    .feedback.correct { background: #dcfce7; color: #166534; border: 1px solid var(--success-border); }
    .feedback.incorrect { background: #fee2e2; color: #991b1b; border: 1px solid var(--error-border); }

    /* Bottom Nav */
    .bottom-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }

    /* Completion */
    .completion-banner {
      background: var(--success-bg);
      border: 2px solid var(--success-border);
      border-radius: var(--radius);
      padding: 48px 32px;
      text-align: center;
      margin-top: 32px;
      box-shadow: var(--shadow-md);
    }

    .completion-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: var(--success);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-size: 32px;
    }

    .completion-banner h3 { font-size: 24px; font-weight: 800; color: #065f46; margin-bottom: 8px; }
    .completion-banner p { font-size: 18px; color: #047857; font-weight: 500; }

    /* Mobile overlay */
    .sidebar-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 25;
      backdrop-filter: blur(2px);
    }

    .sidebar-overlay.show { display: block; }

    /* Responsive */
    @media (max-width: 768px) {
      .sidebar {
        transform: translateX(100%);
      }

      .sidebar.open { transform: translateX(0); }

      .main { margin-right: 0; }

      .mobile-menu-btn { display: flex; }

      .content { padding: 20px 16px 40px; }

      .page-content { padding: 24px 20px; }

      .header { padding: 0 16px; }

      .kbd-hint { display: none; }
    }

    @media print {
      .sidebar, .header, .nav-btn, .mobile-menu-btn, .sidebar-overlay, .kbd-hint { display: none !important; }
      .main { margin-right: 0 !important; }
      .page-slide { display: block !important; page-break-after: always; }
      .content { max-width: 100%; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar()"></div>

    <nav class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-brand">
          <div class="sidebar-logo">${escapeHtml(course.title.charAt(0))}</div>
          <div class="sidebar-course-title">${escapeHtml(course.title)}</div>
        </div>
        <div class="sidebar-meta">
          <span class="sidebar-meta-item">${pages.length} עמודים</span>
          ${questions.length > 0 ? `<span class="sidebar-meta-item">${questions.length} שאלות</span>` : ""}
        </div>
        <div class="sidebar-search-wrap">
          <input type="text" class="sidebar-search" id="sidebarSearch" placeholder="חיפוש עמוד..." oninput="filterSidebar(this.value)" />
          <span class="sidebar-search-icon">&#128269;</span>
        </div>
        ${questions.length > 0 ? `
        <div class="sidebar-progress">
          <div class="sidebar-progress-bar"><div class="sidebar-progress-fill" id="sidebarProgress" style="width:0%"></div></div>
          <div class="sidebar-progress-text">
            <span id="sidebarProgressText">0/${questions.length} שאלות</span>
            <span id="sidebarScoreText">0% נכון</span>
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
          <button class="mobile-menu-btn" onclick="toggleSidebar()" aria-label="תפריט">&#9776;</button>
          <div class="page-indicator">
            <span class="page-indicator-current" id="pageNum">1</span>
            <span class="page-indicator-total">/ ${pages.length}</span>
          </div>
        </div>
        <div class="header-left">
          <span class="kbd-hint"><kbd class="kbd">&larr;</kbd> <kbd class="kbd">&rarr;</kbd> ניווט</span>
          <button class="nav-btn" id="prevBtn" onclick="prevPage()" disabled>&rarr; הקודם</button>
          <button class="nav-btn primary" id="nextBtn" onclick="nextPage()">הבא &larr;</button>
        </div>
      </header>

      <div class="content">
        ${questions.length > 0 ? `
        <div class="score-section" id="scoreSection">
          <div class="score-row">
            <span class="score-label">התקדמות בשאלות</span>
            <span class="score-value" id="scoreText">0 / ${questions.length}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width:0%"></div></div>
        </div>` : ""}

        ${pagesHtml}

        <div class="bottom-nav">
          <button class="nav-btn" onclick="prevPage()" id="prevBtn2">&rarr; העמוד הקודם</button>
          <button class="nav-btn primary" onclick="nextPage()" id="nextBtn2">העמוד הבא &larr;</button>
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
    var currentPage = 0;
    var totalPages = ${pages.length};
    var totalQuestions = ${questions.length};
    var answered = 0;
    var correctCount = 0;
    var visitedPages = new Set([0]);
    var sidebarData = ${sidebarDataJson};

    function goToPage(idx) {
      if (idx < 0 || idx >= totalPages) return;
      var oldPage = document.getElementById('page-' + currentPage);
      if (oldPage) oldPage.style.display = 'none';

      currentPage = idx;
      visitedPages.add(idx);

      var newPage = document.getElementById('page-' + currentPage);
      if (newPage) newPage.style.display = 'block';

      var items = document.querySelectorAll('.sidebar-item');
      items.forEach(function(el, i) {
        el.classList.toggle('active', i === idx);
        if (visitedPages.has(i) && i !== idx) {
          el.classList.add('visited');
        }
      });

      var activeItem = document.getElementById('sidebar-' + idx);
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }

      document.getElementById('pageNum').textContent = (currentPage + 1);

      var prevBtn = document.getElementById('prevBtn');
      var nextBtn = document.getElementById('nextBtn');
      var prevBtn2 = document.getElementById('prevBtn2');
      var nextBtn2 = document.getElementById('nextBtn2');

      if (prevBtn) prevBtn.disabled = currentPage === 0;
      if (nextBtn) nextBtn.disabled = currentPage === totalPages - 1;
      if (prevBtn2) prevBtn2.disabled = currentPage === 0;
      if (nextBtn2) nextBtn2.disabled = currentPage === totalPages - 1;

      window.scrollTo({ top: 0, behavior: 'smooth' });

      if (window.innerWidth <= 768) {
        closeSidebar();
      }
    }

    function nextPage() { goToPage(currentPage + 1); }
    function prevPage() { goToPage(currentPage - 1); }

    function toggleSidebar() {
      var sidebar = document.getElementById('sidebar');
      var overlay = document.getElementById('sidebarOverlay');
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    }

    function closeSidebar() {
      var sidebar = document.getElementById('sidebar');
      var overlay = document.getElementById('sidebarOverlay');
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    }

    function filterSidebar(query) {
      var items = document.querySelectorAll('.sidebar-item');
      var noResults = document.getElementById('noResults');
      var found = 0;
      var q = query.trim().toLowerCase();

      items.forEach(function(el, i) {
        var title = sidebarData[i] ? sidebarData[i].title.toLowerCase() : '';
        var pageNumStr = String(i + 1);
        if (!q || title.indexOf(q) !== -1 || pageNumStr.indexOf(q) !== -1) {
          el.classList.remove('hidden');
          found++;
        } else {
          el.classList.add('hidden');
        }
      });

      noResults.style.display = found === 0 ? 'block' : 'none';
    }

    function selectAnswer(qId, selectedIdx, correctIdx) {
      var card = document.getElementById(qId);
      if (!card || card.classList.contains('answered')) return;
      card.classList.add('answered');

      var buttons = card.querySelectorAll('.option-btn');
      buttons.forEach(function(btn, i) {
        btn.classList.add('disabled');
        if (i === correctIdx) btn.classList.add('correct-answer');
        if (i === selectedIdx && selectedIdx !== correctIdx) btn.classList.add('wrong-answer');
        if (i === selectedIdx) btn.classList.add('selected');
      });

      var isCorrect = selectedIdx === correctIdx;
      var feedback = document.getElementById('feedback-' + qId);
      if (feedback) {
        feedback.classList.add('show', isCorrect ? 'correct' : 'incorrect');
        feedback.textContent = isCorrect ? 'תשובה נכונה!' : 'תשובה שגויה. התשובה הנכונה מסומנת בירוק.';
      }

      if (isCorrect) {
        card.classList.add('correct');
        correctCount++;
      } else {
        card.classList.add('incorrect');
      }

      answered++;
      updateScore();
    }

    function updateScore() {
      var pct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
      var answeredPct = totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0;

      var scoreText = document.getElementById('scoreText');
      var progressFill = document.getElementById('progressFill');
      var sidebarProgress = document.getElementById('sidebarProgress');
      var sidebarProgressText = document.getElementById('sidebarProgressText');
      var sidebarScoreText = document.getElementById('sidebarScoreText');

      if (scoreText) scoreText.textContent = answered + ' / ' + totalQuestions + ' (' + pct + '% נכונות)';
      if (progressFill) progressFill.style.width = answeredPct + '%';
      if (sidebarProgress) sidebarProgress.style.width = answeredPct + '%';
      if (sidebarProgressText) sidebarProgressText.textContent = answered + '/' + totalQuestions + ' שאלות';
      if (sidebarScoreText) sidebarScoreText.textContent = pct + '% נכון';

      if (answered === totalQuestions) {
        var banner = document.getElementById('completionBanner');
        if (banner) {
          banner.style.display = 'block';
          document.getElementById('finalScore').textContent = 'ציון: ' + correctCount + ' מתוך ' + totalQuestions + ' (' + pct + '%)';
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
