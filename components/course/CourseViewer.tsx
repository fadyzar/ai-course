'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';
import { QuestionBlock } from './QuestionBlock';
import { VideoLesson } from './VideoLesson';
import { PdfPageViewer } from './PdfPageViewer';
import {
  CheckCircle2, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  BookOpen, Menu, Video, FileText, Presentation, ClipboardList,
  X, Play, Lock, Trophy,
} from 'lucide-react';

type Section = Database['public']['Tables']['course_sections']['Row'];
type Page = Database['public']['Tables']['course_pages']['Row'];
type Question = Database['public']['Tables']['questions']['Row'];

interface CourseViewerProps {
  courseId: string;
  attemptId?: string;
  isPreview?: boolean;
}

function LessonIcon({ type, size = 14 }: { type: string; size?: number }) {
  const s = `flex-shrink-0`;
  const st = { width: size, height: size };
  switch (type) {
    case 'video': return <Video className={s} style={{ ...st, color: '#60a5fa' }} />;
    case 'pdf':   return <FileText className={s} style={{ ...st, color: '#fb923c' }} />;
    case 'pptx_slide': return <Presentation className={s} style={{ ...st, color: '#34d399' }} />;
    case 'quiz':  return <ClipboardList className={s} style={{ ...st, color: '#a78bfa' }} />;
    default:      return <BookOpen className={s} style={{ ...st, color: '#94a3b8' }} />;
  }
}

/* ─── Page content renderer ─────────────────────────────────────── */
function PageContent({ page }: { page: Page }) {
  if (page.page_type === 'video') {
    if (page.video_storage_path) {
      return (
        <div>
          <div className="bg-black">
            <VideoLesson storagePath={page.video_storage_path} title={page.title} />
          </div>
          {page.html_content?.trim() && (
            <div
              className="p-6 sm:p-8 prose prose-slate max-w-none"
              dangerouslySetInnerHTML={{ __html: page.html_content }}
            />
          )}
        </div>
      );
    }
    if (page.html_content?.trim()) {
      return (
        <div dangerouslySetInnerHTML={{ __html: page.html_content }} />
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Video className="mb-3" style={{ width: 40, height: 40, color: '#cbd5e1' }} />
        <p>נתיב הסרטון אינו זמין</p>
      </div>
    );
  }

  if (page.page_type === 'pdf') {
    const storagePath = (page as any).pdf_storage_path || page.video_storage_path;
    if (storagePath) {
      return (
        <div className="p-4 sm:p-6">
          <PdfPageViewer storagePath={storagePath} pageNum={page.pdf_page_num} title={page.title} />
        </div>
      );
    }
    return (
      <div
        className="p-6 sm:p-8 prose prose-slate max-w-none"
        dangerouslySetInnerHTML={{ __html: page.html_content }}
      />
    );
  }

  return (
    <div
      className="p-6 sm:p-8 prose prose-slate max-w-none"
      dangerouslySetInnerHTML={{ __html: page.html_content }}
    />
  );
}

/* ─── Main component ────────────────────────────────────────────── */
export function CourseViewer({ courseId, attemptId, isPreview = false }: CourseViewerProps) {
  const [sections, setSections]               = useState<Section[]>([]);
  const [pages, setPages]                     = useState<Page[]>([]);
  const [questions, setQuestions]             = useState<Question[]>([]);
  const [answers, setAnswers]                 = useState<Record<string, { options: any[]; correct: boolean }>>({});
  const [loading, setLoading]                 = useState(true);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen]         = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => { loadCourseContent(); }, [courseId]);

  /* keyboard navigation */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft')  goToPage(currentPageIndex + 1);
      if (e.key === 'ArrowRight') goToPage(currentPageIndex - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentPageIndex, pages.length]);

  const loadCourseContent = async () => {
    try {
      const [sr, pr, qr] = await Promise.all([
        supabase.from('course_sections').select('*').eq('course_id', courseId).order('order_index'),
        supabase.from('course_pages').select('*').eq('course_id', courseId).order('order_index'),
        supabase.from('questions').select('*').eq('course_id', courseId),
      ]);
      setSections(Array.from(new Map(((sr.data || []) as Section[]).map(s => [s.id, s])).values()));
      setPages(Array.from(new Map(((pr.data || []) as Page[]).map(p => [p.id, p])).values()));
      setQuestions(Array.from(new Map(((qr.data || []) as Question[]).map(q => [q.id, q])).values()));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleAnswer = async (questionId: string, selectedOptions: any[], isCorrect: boolean) => {
    setAnswers(prev => ({ ...prev, [questionId]: { options: selectedOptions, correct: isCorrect } }));
    if (attemptId && !isPreview) {
      try {
        await (supabase.from('answers') as any).insert({
          attempt_id: attemptId, question_id: questionId,
          selected_options: selectedOptions, is_correct: isCorrect,
        });
      } catch (e) { console.error(e); }
    }
  };

  const goToPage = useCallback((index: number) => {
    if (index >= 0 && index < pages.length) {
      setCurrentPageIndex(index);
      setSidebarOpen(false);
    }
  }, [pages.length]);

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalQ      = questions.length;
  const answeredQ   = Object.keys(answers).length;
  const correctQ    = Object.values(answers).filter(a => a.correct).length;
  const scoreP      = totalQ > 0 ? Math.round((correctQ / totalQ) * 100) : 0;
  const progressP   = pages.length > 0 ? Math.round(((currentPageIndex + 1) / pages.length) * 100) : 0;

  const currentPage    = pages[currentPageIndex];
  const currentSection = sections.find(s => s.id === currentPage?.section_id);
  const pageQuestions  = questions.filter(q => q.page_id === currentPage?.id);

  /* group pages by section */
  const sectionGroups = sections.map(section => ({
    section,
    items: pages.map((p, i) => ({ page: p, index: i })).filter(({ page }) => page.section_id === section.id),
  })).filter(g => g.items.length > 0);

  /* ── Loading ── */
  if (loading) return (
    <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 64px)', background: '#0d1117' }}>
      <div style={{ width: 48, height: 48, border: '3px solid #1f6feb', borderTopColor: '#58a6ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (sections.length === 0) return (
    <div className="flex flex-col items-center justify-center" style={{ height: 'calc(100vh - 64px)', background: '#0d1117', color: '#8b949e' }}>
      <BookOpen style={{ width: 56, height: 56, marginBottom: 16, color: '#30363d' }} />
      <p style={{ fontSize: 18, fontWeight: 600, color: '#e6edf3' }}>הקורס עדיין לא מוכן</p>
      <p style={{ fontSize: 14, marginTop: 8 }}>נא להעלות קבצים ולעבד אותם</p>
    </div>
  );

  const isVideo = currentPage?.page_type === 'video';

  return (
    <div dir="rtl" style={{ display: 'flex', height: 'calc(100vh - 64px)', background: '#0d1117', fontFamily: "'Heebo', sans-serif", overflow: 'hidden', position: 'relative' }}>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 40 }}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════
          SIDEBAR
      ══════════════════════════════════════════════════════════════ */}
      <aside style={{
        width: 300, flexShrink: 0, background: '#161b22', borderLeft: '1px solid #21262d',
        display: 'flex', flexDirection: 'column', overflowY: 'hidden',
        position: 'static', zIndex: 41,
        // mobile: slide in from right
        ...(typeof window !== 'undefined' && window.innerWidth < 1024 ? {
          position: 'fixed' as any, top: 64, right: sidebarOpen ? 0 : -300, bottom: 0,
          transition: 'right 0.3s',
        } : {}),
      }}>
        {/* Sidebar top */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #21262d', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#e6edf3' }}>תוכן הקורס</span>
            <span style={{ fontSize: 11, color: '#8b949e', background: '#21262d', borderRadius: 20, padding: '2px 10px', border: '1px solid #30363d' }}>
              {pages.length} שיעורים
            </span>
          </div>

          {/* Overall progress bar */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#8b949e' }}>התקדמות</span>
              <span style={{ fontSize: 11, color: '#58a6ff', fontWeight: 600 }}>{progressP}%</span>
            </div>
            <div style={{ height: 3, background: '#21262d', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressP}%`, background: 'linear-gradient(90deg, #1f6feb, #58a6ff)', transition: 'width 0.5s ease', borderRadius: 2 }} />
            </div>
          </div>

          {totalQ > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#8b949e' }}>שאלות</span>
                <span style={{ fontSize: 11, color: '#3fb950', fontWeight: 600 }}>{answeredQ}/{totalQ} ({scoreP}%)</span>
              </div>
              <div style={{ height: 3, background: '#21262d', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalQ > 0 ? (answeredQ / totalQ) * 100 : 0}%`, background: 'linear-gradient(90deg, #238636, #3fb950)', transition: 'width 0.5s', borderRadius: 2 }} />
              </div>
            </div>
          )}
        </div>

        {/* Section + lesson list */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {sectionGroups.map(({ section, items }, gi) => {
            const isCollapsed = collapsedSections.has(section.id);
            const doneCount   = items.filter(({ page }) => questions.filter(q => q.page_id === page.id).every(q => answers[q.id]) && questions.some(q => q.page_id === page.id)).length;
            const hasActiveItem = items.some(({ index }) => index === currentPageIndex);

            return (
              <div key={section.id}>
                {/* Section header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', background: hasActiveItem ? 'rgba(88,166,255,0.06)' : 'none',
                    border: 'none', cursor: 'pointer', textAlign: 'right',
                    borderBottom: '1px solid #21262d',
                  }}
                >
                  <div style={{ flex: 1, textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#58a6ff', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        פרק {gi + 1}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: hasActiveItem ? '#79c0ff' : '#c9d1d9', margin: 0, lineHeight: 1.4 }}>
                      {section.title}
                    </p>
                    <p style={{ fontSize: 11, color: '#6e7681', marginTop: 3, margin: 0 }}>
                      {items.length} שיעורים
                    </p>
                  </div>
                  {isCollapsed
                    ? <ChevronDown style={{ width: 14, height: 14, color: '#6e7681', flexShrink: 0 }} />
                    : <ChevronUp style={{ width: 14, height: 14, color: '#6e7681', flexShrink: 0 }} />
                  }
                </button>

                {/* Lesson items */}
                {!isCollapsed && items.map(({ page, index }) => {
                  const isActive  = index === currentPageIndex;
                  const pageQs    = questions.filter(q => q.page_id === page.id);
                  const isDone    = pageQs.length > 0 && pageQs.every(q => answers[q.id]);
                  const isViewed  = index < currentPageIndex;

                  return (
                    <button
                      key={page.id}
                      onClick={() => goToPage(index)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '9px 16px 9px 12px',
                        background: isActive ? 'rgba(88,166,255,0.1)' : 'none',
                        borderRight: isActive ? '3px solid #58a6ff' : '3px solid transparent',
                        border: 'none', cursor: 'pointer', textAlign: 'right',
                        transition: 'background 0.15s',
                      }}
                    >
                      {/* Status indicator */}
                      <div style={{ flexShrink: 0, marginTop: 2 }}>
                        {isDone ? (
                          <CheckCircle2 style={{ width: 16, height: 16, color: '#3fb950' }} />
                        ) : isActive ? (
                          <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#58a6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Play style={{ width: 8, height: 8, color: '#0d1117', fill: '#0d1117' }} />
                          </div>
                        ) : (
                          <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #30363d', background: isViewed ? 'rgba(88,166,255,0.15)' : 'none' }} />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: 13, lineHeight: 1.45, margin: 0,
                          color: isActive ? '#79c0ff' : '#c9d1d9',
                          fontWeight: isActive ? 600 : 400,
                          overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                        }}>
                          {page.title || `שיעור ${index + 1}`}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                          <LessonIcon type={page.page_type || 'text'} size={11} />
                          <span style={{ fontSize: 11, color: '#6e7681' }}>
                            {page.page_type === 'video' ? 'סרטון'
                              : page.page_type === 'pdf' ? 'PDF'
                              : page.page_type === 'pptx_slide' ? 'שקופית'
                              : 'תוכן'}
                          </span>
                          {pageQs.length > 0 && (
                            <span style={{ fontSize: 10, color: '#8b949e', background: '#21262d', borderRadius: 10, padding: '1px 6px', border: '1px solid #30363d' }}>
                              {pageQs.length} שאלות
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ══════════════════════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════════════════ */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: isVideo ? '#000' : '#0d1117', overflow: 'hidden' }}>

        {/* ── Top bar ── */}
        <div style={{
          height: 52, flexShrink: 0, background: '#161b22', borderBottom: '1px solid #21262d',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', gap: 12,
        }}>
          {/* Left: breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <button
              onClick={() => setSidebarOpen(true)}
              style={{ display: 'none', padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', borderRadius: 6 }}
              className="lg-hidden-mobile-menu"
            >
              <Menu style={{ width: 18, height: 18 }} />
            </button>
            {currentSection && (
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#58a6ff', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {currentSection.title}
                  </span>
                  <ChevronLeft style={{ width: 12, height: 12, color: '#6e7681', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#e6edf3', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentPage?.title || `שיעור ${currentPageIndex + 1}`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Right: counter + nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 13, color: '#6e7681', fontWeight: 500, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#e6edf3' }}>{currentPageIndex + 1}</span>
              <span style={{ margin: '0 4px' }}>/</span>
              {pages.length}
            </span>
            <button
              onClick={() => goToPage(currentPageIndex - 1)}
              disabled={currentPageIndex <= 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                background: currentPageIndex <= 0 ? '#21262d' : '#21262d',
                border: '1px solid #30363d', borderRadius: 8, cursor: currentPageIndex <= 0 ? 'default' : 'pointer',
                color: currentPageIndex <= 0 ? '#484f58' : '#c9d1d9', fontSize: 13, fontWeight: 600,
                opacity: currentPageIndex <= 0 ? 0.4 : 1, transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
            >
              <ChevronRight style={{ width: 15, height: 15 }} />
              הקודם
            </button>
            <button
              onClick={() => goToPage(currentPageIndex + 1)}
              disabled={currentPageIndex >= pages.length - 1}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                background: currentPageIndex >= pages.length - 1 ? '#21262d' : '#1f6feb',
                border: '1px solid', borderColor: currentPageIndex >= pages.length - 1 ? '#30363d' : '#1f6feb',
                borderRadius: 8, cursor: currentPageIndex >= pages.length - 1 ? 'default' : 'pointer',
                color: currentPageIndex >= pages.length - 1 ? '#484f58' : 'white',
                fontSize: 13, fontWeight: 600,
                opacity: currentPageIndex >= pages.length - 1 ? 0.4 : 1, transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
            >
              הבא
              <ChevronLeft style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#30363d transparent' }}>
          {currentPage && (
            <>
              {/* Content card */}
              <div style={{ background: isVideo ? '#000' : '#13171f' }}>
                <PageContent page={currentPage} />
              </div>

              {/* Below-content section: questions + nav */}
              <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 48px' }}>

                {/* Questions */}
                {pageQuestions.length > 0 && (
                  <div style={{ marginBottom: 32 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(240,136,62,0.15)', border: '1px solid rgba(240,136,62,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14, fontWeight: 900, color: '#f0883e' }}>?</div>
                      <h3 style={{ fontSize: 16, fontWeight: 800, color: '#e6edf3', margin: 0 }}>שאלות לבדיקת הבנה</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {pageQuestions.map(q => (
                        <QuestionBlock key={q.id} question={q} onAnswer={handleAnswer} disabled={isPreview} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Bottom navigation */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #21262d', paddingTop: 20 }}>
                  <button
                    onClick={() => goToPage(currentPageIndex - 1)}
                    disabled={currentPageIndex <= 0}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
                      background: 'none', border: '1px solid #30363d', borderRadius: 8,
                      cursor: currentPageIndex <= 0 ? 'default' : 'pointer',
                      color: currentPageIndex <= 0 ? '#484f58' : '#c9d1d9',
                      fontSize: 14, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s',
                    }}
                  >
                    <ChevronRight style={{ width: 16, height: 16 }} />
                    השיעור הקודם
                  </button>

                  {currentPageIndex < pages.length - 1 ? (
                    <button
                      onClick={() => goToPage(currentPageIndex + 1)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px',
                        background: '#1f6feb', border: '1px solid #1f6feb', borderRadius: 8,
                        cursor: 'pointer', color: 'white', fontSize: 14, fontWeight: 600,
                        fontFamily: 'inherit', transition: 'all 0.15s',
                      }}
                    >
                      השיעור הבא
                      <ChevronLeft style={{ width: 16, height: 16 }} />
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', borderRadius: 8 }}>
                      <Trophy style={{ width: 18, height: 18, color: '#3fb950' }} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#3fb950' }}>סיום הקורס</span>
                    </div>
                  )}
                </div>

                {/* Completion banner */}
                {answeredQ === totalQ && totalQ > 0 && (
                  <div style={{ marginTop: 24, background: 'linear-gradient(135deg, rgba(63,185,80,0.12), rgba(63,185,80,0.05))', border: '1px solid rgba(63,185,80,0.3)', borderRadius: 14, padding: '40px 32px', textAlign: 'center' }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(63,185,80,0.15)', border: '2px solid rgba(63,185,80,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 30 }}>🏆</div>
                    <h3 style={{ fontSize: 24, fontWeight: 900, color: '#e6edf3', marginBottom: 8 }}>כל הכבוד! סיימת את הקורס</h3>
                    <p style={{ fontSize: 17, color: '#8b949e' }}>ציון: {correctQ} מתוך {totalQ} ({scoreP}%)</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap');
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
        @media (max-width: 1023px) {
          .lg-hidden-mobile-menu { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
