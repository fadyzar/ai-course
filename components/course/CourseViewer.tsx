'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';
import { QuestionBlock } from './QuestionBlock';
import { VideoLesson } from './VideoLesson';
import { PdfPageViewer } from './PdfPageViewer';
import { ManualQuestionDialog } from './ManualQuestionDialog';
import { useAuth } from '@/contexts/AuthContext';
import {
  CheckCircle2, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  BookOpen, Video, FileText, Presentation, ClipboardList,
  Play, Trophy, Sun, Moon, PanelLeftOpen, PanelLeftClose, Plus,
  ArrowRight,
} from 'lucide-react';

type Section  = Database['public']['Tables']['course_sections']['Row'];
type Page     = Database['public']['Tables']['course_pages']['Row'];
type Question = Database['public']['Tables']['questions']['Row'];

interface CourseViewerProps {
  courseId: string;
  attemptId?: string;
  isPreview?: boolean;
}

/* ─── Lesson type icon ───────────────────────────────────────────── */
function LessonIcon({ type, size = 14, dark }: { type: string; size?: number; dark: boolean }) {
  const s   = 'flex-shrink-0';
  const st  = { width: size, height: size };
  switch (type) {
    case 'video':      return <Video      className={s} style={{ ...st, color: dark ? '#60a5fa' : '#3b82f6' }} />;
    case 'pdf':        return <FileText   className={s} style={{ ...st, color: dark ? '#fb923c' : '#f97316' }} />;
    case 'pptx_slide': return <Presentation className={s} style={{ ...st, color: dark ? '#34d399' : '#10b981' }} />;
    case 'quiz':       return <ClipboardList className={s} style={{ ...st, color: dark ? '#a78bfa' : '#8b5cf6' }} />;
    default:           return <BookOpen   className={s} style={{ ...st, color: dark ? '#94a3b8' : '#64748b' }} />;
  }
}

/* ─── Page content renderer ──────────────────────────────────────── */
function PageContent({ page, dark }: { page: Page; dark: boolean }) {
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
              style={{ color: dark ? '#e2e8f0' : '#0f172a' }}
              dangerouslySetInnerHTML={{ __html: page.html_content }}
            />
          )}
        </div>
      );
    }
    if (page.html_content?.trim()) {
      return <div dangerouslySetInnerHTML={{ __html: page.html_content }} />;
    }
    return (
      <div
        className="flex flex-col items-center justify-center py-20"
        style={{ color: dark ? '#64748b' : '#94a3b8' }}
      >
        <Video style={{ width: 40, height: 40, marginBottom: 12, color: dark ? '#334155' : '#cbd5e1' }} />
        <p>נתיב הסרטון אינו זמין</p>
      </div>
    );
  }

  if (page.page_type === 'pdf') {
    const storagePath = (page as any).pdf_storage_path || page.video_storage_path;
    if (storagePath) {
      return (
        <div className="p-4 sm:p-6 max-w-4xl mx-auto">
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

  /* pptx_slide or default */
  return (
    <div
      className="p-6 sm:p-8 [&_img]:rounded-xl [&_img]:shadow-sm"
      dangerouslySetInnerHTML={{ __html: page.html_content }}
    />
  );
}

/* ─── Main component ─────────────────────────────────────────────── */
export function CourseViewer({ courseId, attemptId, isPreview = false }: CourseViewerProps) {
  const { profile } = useAuth();
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin';
  const [sections, setSections]                       = useState<Section[]>([]);
  const [pages, setPages]                             = useState<Page[]>([]);
  const [questions, setQuestions]                     = useState<Question[]>([]);
  const [answers, setAnswers]                         = useState<Record<string, { options: any[]; correct: boolean }>>({});
  const [loading, setLoading]                         = useState(true);
  const [currentPageIndex, setCurrentPageIndex]       = useState(0);
  const [sidebarOpen, setSidebarOpen]                 = useState(true);
  const [collapsedSections, setCollapsedSections]     = useState<Set<string>>(new Set());
  const [dark, setDark]                               = useState(false);
  const [showAddQuestion, setShowAddQuestion]         = useState(false);

  useEffect(() => { loadCourseContent(); }, [courseId]);

  /* Close sidebar on small screens by default */
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);

  /* Keyboard navigation */
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
      /* Close sidebar on mobile after navigation */
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [pages.length]);

  const toggleSection = (id: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalQ    = questions.length;
  const answeredQ = Object.keys(answers).length;
  const correctQ  = Object.values(answers).filter(a => a.correct).length;
  const scoreP    = totalQ > 0 ? Math.round((correctQ / totalQ) * 100) : 0;
  const progressP = pages.length > 0 ? Math.round(((currentPageIndex + 1) / pages.length) * 100) : 0;

  const currentPage    = pages[currentPageIndex];
  const currentSection = sections.find(s => s.id === currentPage?.section_id);
  const pageQuestions  = questions.filter(q => q.page_id === currentPage?.id);

  /* Group pages by section */
  const sectionGroups = sections.map(section => ({
    section,
    items: pages.map((p, i) => ({ page: p, index: i })).filter(({ page }) => page.section_id === section.id),
  })).filter(g => g.items.length > 0);

  /* ── Theme tokens ── */
  const T = {
    outerBg:       dark ? '#0f172a' : '#f8fafc',
    topbarBg:      dark ? '#0f172a' : '#ffffff',
    topbarBorder:  dark ? '#1e293b' : '#e2e8f0',
    sidebarBg:     dark ? '#0f172a' : '#ffffff',
    sidebarBorder: dark ? '#1e293b' : '#e2e8f0',
    text:          dark ? '#f1f5f9' : '#0f172a',
    textMuted:     dark ? '#94a3b8' : '#64748b',
    textFaint:     dark ? '#475569' : '#94a3b8',
    accent:        dark ? '#60a5fa' : '#2563eb',
    accentBg:      dark ? 'rgba(96,165,250,0.08)' : '#eff6ff',
    activeBorder:  dark ? '#60a5fa' : '#2563eb',
    sectionHover:  dark ? 'rgba(255,255,255,0.04)' : '#f1f5f9',
    sectionActive: dark ? 'rgba(96,165,250,0.06)' : '#f0f9ff',
    btnBorder:     dark ? '#334155' : '#e2e8f0',
    btnBg:         dark ? '#1e293b' : '#f8fafc',
    contentBg:     dark ? '#0f172a' : '#f8fafc',
    cardBg:        dark ? '#0f172a' : '#ffffff',
    divider:       dark ? '#1e293b' : '#e2e8f0',
    progressTrack: dark ? '#1e293b' : '#e2e8f0',
    badgeBg:       dark ? '#1e293b' : '#f1f5f9',
    badgeBorder:   dark ? '#334155' : '#e2e8f0',
    badgeText:     dark ? '#94a3b8' : '#64748b',
    successColor:  dark ? '#4ade80' : '#16a34a',
    successBg:     dark ? 'rgba(74,222,128,0.08)' : '#f0fdf4',
    successBorder: dark ? 'rgba(74,222,128,0.25)' : '#bbf7d0',
  };

  /* ── Loading ── */
  if (loading) return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: 'calc(100vh - 64px)', background: T.outerBg }}
    >
      <div style={{
        width: 40, height: 40, border: `3px solid ${T.accent}`,
        borderTopColor: 'transparent', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (sections.length === 0) return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ minHeight: 'calc(100vh - 64px)', background: T.outerBg, color: T.textMuted }}
    >
      <BookOpen style={{ width: 52, height: 52, marginBottom: 16, color: T.textFaint }} />
      <p style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 6 }}>הקורס עדיין לא מוכן</p>
      <p style={{ fontSize: 14 }}>נא להעלות קבצים ולעבד אותם</p>
    </div>
  );

  const isVideoPage = currentPage?.page_type === 'video';

  return (
    <div
      dir="rtl"
      style={{ background: T.outerBg, fontFamily: "'Heebo', sans-serif", minHeight: 'calc(100vh - 64px)' }}
    >
      {/* ══════════════════════════════════════════
          STICKY TOPBAR
      ══════════════════════════════════════════ */}
      <div style={{
        position: 'sticky', top: 64, zIndex: 40, height: 52,
        background: T.topbarBg,
        borderBottom: `1px solid ${T.topbarBorder}`,
        boxShadow: dark
          ? '0 2px 8px rgba(0,0,0,0.5)'
          : '0 2px 8px rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', gap: 12,
      }}>
        {/* Left group: sidebar toggle + back + breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? 'סגור תפריט' : 'פתח תפריט'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.btnBorder}`,
              background: T.btnBg, cursor: 'pointer', color: T.textMuted, flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            {sidebarOpen
              ? <PanelLeftClose style={{ width: 16, height: 16 }} />
              : <PanelLeftOpen  style={{ width: 16, height: 16 }} />
            }
          </button>

          {/* Vertical separator */}
          <div style={{ width: 1, height: 20, background: T.btnBorder, flexShrink: 0 }} />

          {/* Back button */}
          <button
            onClick={() => window.history.back()}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer',
              color: T.textMuted, fontSize: 13, fontFamily: 'inherit', flexShrink: 0,
              padding: '4px 2px',
            }}
          >
            <ArrowRight style={{ width: 14, height: 14 }} />
            <span className="hidden sm:inline">חזרה</span>
          </button>

          {/* Breadcrumb — hidden on mobile */}
          {currentSection && (
            <div
              className="hidden md:flex"
              style={{ alignItems: 'center', gap: 5, minWidth: 0 }}
            >
              <div style={{ width: 1, height: 18, background: T.btnBorder, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: T.accent, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {currentSection.title}
              </span>
              <ChevronLeft style={{ width: 12, height: 12, color: T.textFaint, flexShrink: 0 }} />
              <span style={{
                fontSize: 13, color: T.text, fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {currentPage?.title || `שיעור ${currentPageIndex + 1}`}
              </span>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right group: counter + prev/next + add question + dark toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Page counter */}
          <span style={{ fontSize: 13, color: T.textMuted, whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: T.text }}>{currentPageIndex + 1}</span>
            <span style={{ margin: '0 3px' }}>/</span>
            {pages.length}
          </span>

          {/* Prev button (ChevronRight = goes back in RTL) */}
          <button
            onClick={() => goToPage(currentPageIndex - 1)}
            disabled={currentPageIndex <= 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 12px', border: `1px solid ${T.btnBorder}`,
              borderRadius: 8, background: T.btnBg, cursor: currentPageIndex <= 0 ? 'default' : 'pointer',
              color: currentPageIndex <= 0 ? T.textFaint : T.text,
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              opacity: currentPageIndex <= 0 ? 0.45 : 1, transition: 'all 0.15s',
            }}
          >
            <ChevronRight style={{ width: 14, height: 14 }} />
            <span className="hidden sm:inline">הקודם</span>
          </button>

          {/* Next button */}
          <button
            onClick={() => goToPage(currentPageIndex + 1)}
            disabled={currentPageIndex >= pages.length - 1}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 12px',
              background: currentPageIndex >= pages.length - 1 ? T.btnBg : T.accent,
              border: `1px solid ${currentPageIndex >= pages.length - 1 ? T.btnBorder : T.accent}`,
              borderRadius: 8, cursor: currentPageIndex >= pages.length - 1 ? 'default' : 'pointer',
              color: currentPageIndex >= pages.length - 1 ? T.textFaint : '#ffffff',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              opacity: currentPageIndex >= pages.length - 1 ? 0.45 : 1, transition: 'all 0.15s',
            }}
          >
            <span className="hidden sm:inline">הבא</span>
            <ChevronLeft style={{ width: 14, height: 14 }} />
          </button>

          {/* Vertical separator */}
          <div style={{ width: 1, height: 20, background: T.btnBorder, flexShrink: 0 }} />

          {/* Add question button — teachers only */}
          {isTeacher && !isPreview && (
            <button
              onClick={() => setShowAddQuestion(true)}
              title="הוסף שאלה"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', border: `1px solid ${T.btnBorder}`,
                borderRadius: 8, background: T.btnBg, cursor: 'pointer',
                color: T.text, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              <Plus style={{ width: 14, height: 14, color: T.accent }} />
              <span className="hidden sm:inline">הוסף שאלה</span>
            </button>
          )}

          {/* Dark mode toggle */}
          <button
            onClick={() => setDark(d => !d)}
            title={dark ? 'מצב בהיר' : 'מצב כהה'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.btnBorder}`,
              background: T.btnBg, cursor: 'pointer', color: T.textMuted, flexShrink: 0,
              transition: 'all 0.15s',
            }}
          >
            {dark
              ? <Sun  style={{ width: 15, height: 15 }} />
              : <Moon style={{ width: 15, height: 15 }} />
            }
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          BODY ROW: sidebar + content
      ══════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>

        {/* ── SIDEBAR ── */}
        <aside style={{
          width: sidebarOpen ? 288 : 0,
          flexShrink: 0,
          overflow: 'hidden',
          transition: 'width 300ms ease',
          /* sticky positioning */
          position: 'sticky',
          top: 116,      /* 64px header + 52px topbar */
          alignSelf: 'flex-start',
          maxHeight: 'calc(100vh - 116px)',
          overflowY: 'auto',
          background: T.sidebarBg,
          borderLeft: `1px solid ${T.sidebarBorder}`,
          scrollbarWidth: 'thin',
          scrollbarColor: `${T.btnBorder} transparent`,
        }}>
          <div style={{ width: 288 }}>
            {/* Sidebar header */}
            <div style={{
              padding: '16px 16px 12px',
              borderBottom: `1px solid ${T.sidebarBorder}`,
              position: 'sticky', top: 0, background: T.sidebarBg, zIndex: 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>תוכן הקורס</span>
                <span style={{
                  fontSize: 11, color: T.badgeText, background: T.badgeBg,
                  borderRadius: 20, padding: '2px 10px', border: `1px solid ${T.badgeBorder}`,
                }}>
                  {pages.length} שיעורים
                </span>
              </div>

              {/* Progress bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: T.textMuted }}>התקדמות</span>
                  <span style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>{progressP}%</span>
                </div>
                <div style={{ height: 3, background: T.progressTrack, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${progressP}%`,
                    background: `linear-gradient(90deg, ${T.accent}, ${dark ? '#93c5fd' : '#60a5fa'})`,
                    transition: 'width 0.5s ease', borderRadius: 2,
                  }} />
                </div>
              </div>

              {totalQ > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: T.textMuted }}>שאלות</span>
                    <span style={{ fontSize: 11, color: T.successColor, fontWeight: 600 }}>{answeredQ}/{totalQ} ({scoreP}%)</span>
                  </div>
                  <div style={{ height: 3, background: T.progressTrack, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${totalQ > 0 ? (answeredQ / totalQ) * 100 : 0}%`,
                      background: `linear-gradient(90deg, ${T.successColor}, ${dark ? '#86efac' : '#4ade80'})`,
                      transition: 'width 0.5s', borderRadius: 2,
                    }} />
                  </div>
                </div>
              )}
            </div>

            {/* Section + lesson list */}
            <nav style={{ padding: '8px 0' }}>
              {sectionGroups.map(({ section, items }, gi) => {
                const isCollapsed  = collapsedSections.has(section.id);
                const hasActiveItem = items.some(({ index }) => index === currentPageIndex);

                return (
                  <div key={section.id}>
                    {/* Section header */}
                    <button
                      onClick={() => toggleSection(section.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 16px',
                        background: hasActiveItem ? T.sectionActive : 'transparent',
                        border: 'none', borderBottom: `1px solid ${T.sidebarBorder}`,
                        cursor: 'pointer', textAlign: 'right',
                      }}
                    >
                      <div style={{ flex: 1, textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: T.accent,
                            textTransform: 'uppercase', letterSpacing: '0.7px',
                          }}>
                            פרק {gi + 1}
                          </span>
                        </div>
                        <p style={{
                          fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.4,
                          color: hasActiveItem ? T.accent : T.text,
                        }}>
                          {section.title}
                        </p>
                        <p style={{ fontSize: 11, color: T.textMuted, marginTop: 2, marginBottom: 0 }}>
                          {items.length} שיעורים
                        </p>
                      </div>
                      {isCollapsed
                        ? <ChevronDown style={{ width: 14, height: 14, color: T.textFaint, flexShrink: 0 }} />
                        : <ChevronUp   style={{ width: 14, height: 14, color: T.textFaint, flexShrink: 0 }} />
                      }
                    </button>

                    {/* Lesson items */}
                    {!isCollapsed && items.map(({ page, index }) => {
                      const isActive = index === currentPageIndex;
                      const pageQs   = questions.filter(q => q.page_id === page.id);
                      const isDone   = pageQs.length > 0 && pageQs.every(q => answers[q.id]);
                      const isViewed = index < currentPageIndex;

                      return (
                        <button
                          key={page.id}
                          onClick={() => goToPage(index)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '9px 16px 9px 12px',
                            background: isActive ? T.accentBg : 'transparent',
                            borderRight: isActive ? `2px solid ${T.activeBorder}` : '2px solid transparent',
                            border: 'none', cursor: 'pointer', textAlign: 'right',
                            transition: 'background 0.15s',
                          }}
                        >
                          {/* Status circle */}
                          <div style={{ flexShrink: 0, marginTop: 2 }}>
                            {isDone ? (
                              <CheckCircle2 style={{ width: 16, height: 16, color: T.successColor }} />
                            ) : isActive ? (
                              <div style={{
                                width: 16, height: 16, borderRadius: '50%',
                                background: T.accent,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <Play style={{ width: 8, height: 8, color: '#fff', fill: '#fff' }} />
                              </div>
                            ) : (
                              <div style={{
                                width: 16, height: 16, borderRadius: '50%',
                                border: `2px solid ${isViewed ? T.accent : T.btnBorder}`,
                                background: isViewed ? T.accentBg : 'transparent',
                                opacity: isViewed ? 0.5 : 1,
                              }} />
                            )}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                              fontSize: 13, lineHeight: 1.45, margin: 0,
                              color: isActive ? T.accent : T.text,
                              fontWeight: isActive ? 600 : 400,
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                            }}>
                              {page.title || `שיעור ${index + 1}`}
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
                              <LessonIcon type={page.page_type || 'text'} size={11} dark={dark} />
                              <span style={{ fontSize: 11, color: T.textMuted }}>
                                {page.page_type === 'video' ? 'סרטון'
                                  : page.page_type === 'pdf' ? 'PDF'
                                  : page.page_type === 'pptx_slide' ? 'שקופית'
                                  : 'תוכן'}
                              </span>
                              {pageQs.length > 0 && (
                                <span style={{
                                  fontSize: 10, color: T.badgeText, background: T.badgeBg,
                                  borderRadius: 10, padding: '1px 6px', border: `1px solid ${T.badgeBorder}`,
                                }}>
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
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <main style={{ flex: 1, minWidth: 0, background: T.contentBg }}>
          {currentPage && (
            <>
              {/* Page content: video full-bleed, others centered */}
              <div style={{ background: isVideoPage ? '#000' : T.cardBg }}>
                <PageContent page={currentPage} dark={dark} />
              </div>

              {/* Below content: questions + nav + completion */}
              <div style={{ maxWidth: 768, margin: '0 auto', padding: '24px 20px 56px' }}>

                {/* Questions section */}
                {pageQuestions.length > 0 && (
                  <div style={{ marginBottom: 32 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: dark ? 'rgba(251,146,60,0.12)' : '#fff7ed',
                        border: `1px solid ${dark ? 'rgba(251,146,60,0.3)' : '#fed7aa'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, fontSize: 14, fontWeight: 900, color: dark ? '#fb923c' : '#ea580c',
                      }}>?</div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0 }}>
                        שאלות לבדיקת הבנה
                      </h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {pageQuestions.map(q => (
                        <QuestionBlock key={q.id} question={q} onAnswer={handleAnswer} disabled={isPreview} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Bottom nav */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderTop: `1px solid ${T.divider}`, paddingTop: 20,
                }}>
                  <button
                    onClick={() => goToPage(currentPageIndex - 1)}
                    disabled={currentPageIndex <= 0}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '9px 18px', background: 'transparent',
                      border: `1px solid ${T.btnBorder}`, borderRadius: 8,
                      cursor: currentPageIndex <= 0 ? 'default' : 'pointer',
                      color: currentPageIndex <= 0 ? T.textFaint : T.text,
                      fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                      opacity: currentPageIndex <= 0 ? 0.45 : 1, transition: 'all 0.15s',
                    }}
                  >
                    <ChevronRight style={{ width: 15, height: 15 }} />
                    השיעור הקודם
                  </button>

                  {currentPageIndex < pages.length - 1 ? (
                    <button
                      onClick={() => goToPage(currentPageIndex + 1)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '9px 18px', background: T.accent,
                        border: `1px solid ${T.accent}`, borderRadius: 8,
                        cursor: 'pointer', color: '#ffffff',
                        fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                        transition: 'all 0.15s',
                      }}
                    >
                      השיעור הבא
                      <ChevronLeft style={{ width: 15, height: 15 }} />
                    </button>
                  ) : (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '9px 18px',
                      background: T.successBg, border: `1px solid ${T.successBorder}`,
                      borderRadius: 8,
                    }}>
                      <Trophy style={{ width: 16, height: 16, color: T.successColor }} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: T.successColor }}>סיום הקורס</span>
                    </div>
                  )}
                </div>

                {/* Completion banner */}
                {answeredQ === totalQ && totalQ > 0 && (
                  <div style={{
                    marginTop: 24,
                    background: T.successBg,
                    border: `1px solid ${T.successBorder}`,
                    borderRadius: 14, padding: '36px 28px', textAlign: 'center',
                  }}>
                    <div style={{
                      width: 60, height: 60, borderRadius: '50%',
                      background: T.successBg, border: `2px solid ${T.successBorder}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 14px', fontSize: 28,
                    }}>🏆</div>
                    <h3 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 6 }}>
                      כל הכבוד! סיימת את הקורס
                    </h3>
                    <p style={{ fontSize: 16, color: T.textMuted }}>
                      ציון: {correctQ} מתוך {totalQ} ({scoreP}%)
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* ── Add Question Dialog ── */}
      {isTeacher && !isPreview && (
        <ManualQuestionDialog
          courseId={courseId}
          pageId={currentPage?.id}
          pageName={currentPage?.title ?? undefined}
          open={showAddQuestion}
          onOpenChange={setShowAddQuestion}
          onQuestionAdded={() => {
            setShowAddQuestion(false);
            loadCourseContent();
          }}
        />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap');
      `}</style>
    </div>
  );
}
