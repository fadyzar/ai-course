'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QuestionBlock } from './QuestionBlock';
import { VideoLesson } from './VideoLesson';
import { PdfPageViewer } from './PdfPageViewer';
import { Progress } from '@/components/ui/progress';
import { CircleCheck as CheckCircle, ChevronRight, ChevronLeft, BookOpen, List, Video, FileText, Presentation, ClipboardList } from 'lucide-react';

type Section = Database['public']['Tables']['course_sections']['Row'];
type Page = Database['public']['Tables']['course_pages']['Row'];
type Question = Database['public']['Tables']['questions']['Row'];

interface CourseViewerProps {
  courseId: string;
  attemptId?: string;
  isPreview?: boolean;
}

function PageTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'video':
      return <Video className="h-3.5 w-3.5 text-sky-500 flex-shrink-0" />;
    case 'pdf':
      return <FileText className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />;
    case 'pptx_slide':
      return <Presentation className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />;
    case 'quiz':
      return <ClipboardList className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />;
    default:
      return <BookOpen className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />;
  }
}

function PageContent({ page }: { page: Page }) {
  if (page.page_type === 'video') {
    // Embedded video file in Supabase Storage
    if (page.video_storage_path) {
      return (
        <div className="p-6">
          <VideoLesson storagePath={page.video_storage_path} title={page.title} />
          {page.html_content && page.html_content.trim().length > 0 && (
            <div
              dangerouslySetInnerHTML={{ __html: page.html_content }}
              className="mt-6 prose prose-slate max-w-none"
            />
          )}
        </div>
      );
    }
    // YouTube / Vimeo embed — stored as html_content with iframe
    if (page.html_content && page.html_content.trim().length > 0) {
      return (
        <div
          dangerouslySetInnerHTML={{ __html: page.html_content }}
          className="p-4"
        />
      );
    }
    return (
      <div className="p-8 text-center text-slate-500">
        <Video className="h-10 w-10 mx-auto mb-3 text-slate-300" />
        <p>נתיב הסרטון אינו זמין</p>
      </div>
    );
  }

  if (page.page_type === 'pdf') {
    if (!page.asset_id && !page.video_storage_path) {
      return (
        <div
          dangerouslySetInnerHTML={{ __html: page.html_content }}
          className="p-6 sm:p-8 prose prose-slate max-w-none"
        />
      );
    }
    const storagePath = (page as any).pdf_storage_path || page.video_storage_path;
    if (!storagePath) {
      return (
        <div
          dangerouslySetInnerHTML={{ __html: page.html_content }}
          className="p-6 sm:p-8 prose prose-slate max-w-none"
        />
      );
    }
    return (
      <div className="p-6">
        <PdfPageViewer
          storagePath={storagePath}
          pageNum={page.pdf_page_num}
          title={page.title}
        />
      </div>
    );
  }

  return (
    <div
      dangerouslySetInnerHTML={{ __html: page.html_content }}
      className="p-6 sm:p-8 prose prose-slate max-w-none"
    />
  );
}

export function CourseViewer({ courseId, attemptId, isPreview = false }: CourseViewerProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, { options: any[]; correct: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    loadCourseContent();
  }, [courseId]);

  const loadCourseContent = async () => {
    try {
      const [sectionsResult, pagesResult, questionsResult] = await Promise.all([
        supabase
          .from('course_sections')
          .select('*')
          .eq('course_id', courseId)
          .order('order_index'),
        supabase
          .from('course_pages')
          .select('*')
          .eq('course_id', courseId)
          .order('order_index'),
        supabase
          .from('questions')
          .select('*')
          .eq('course_id', courseId),
      ]);

      // Deduplicate by id to prevent React key errors on double-processing
      const uniqueSections = Array.from(
        new Map((sectionsResult.data || []).map((s) => [s.id, s])).values()
      );
      const uniquePages = Array.from(
        new Map((pagesResult.data || []).map((p) => [p.id, p])).values()
      );
      const uniqueQuestions = Array.from(
        new Map((questionsResult.data || []).map((q) => [q.id, q])).values()
      );
      setSections(uniqueSections);
      setPages(uniquePages);
      setQuestions(uniqueQuestions);
    } catch (error) {
      console.error('Error loading course content:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = async (questionId: string, selectedOptions: any[], isCorrect: boolean) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { options: selectedOptions, correct: isCorrect },
    }));

    if (attemptId && !isPreview) {
      try {
        await (supabase.from('answers') as any).insert({
          attempt_id: attemptId,
          question_id: questionId,
          selected_options: selectedOptions,
          is_correct: isCorrect,
        });
      } catch (error) {
        console.error('Error saving answer:', error);
      }
    }
  };

  const totalQuestions = questions.length;
  const answeredQuestions = Object.keys(answers).length;
  const correctAnswers = Object.values(answers).filter((a) => a.correct).length;
  const scorePercent = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

  const currentPage = pages[currentPageIndex];
  const currentSection = sections.find((s) => s.id === currentPage?.section_id);
  const pageQuestions = questions.filter((q) => q.page_id === currentPage?.id);

  const goToPage = (index: number) => {
    if (index >= 0 && index < pages.length) {
      setCurrentPageIndex(index);
      setShowSidebar(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BookOpen className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 text-lg">הקורס עדיין לא מוכן.</p>
          <p className="text-slate-500 text-sm mt-2">נא להעלות קבצים ולעבד אותם.</p>
        </CardContent>
      </Card>
    );
  }

  // Group pages by section for sidebar display
  const sectionGroups = sections.map((section) => ({
    section,
    pages: pages
      .map((p, i) => ({ page: p, index: i }))
      .filter(({ page }) => page.section_id === section.id),
  })).filter((g) => g.pages.length > 0);

  return (
    <div className="flex gap-0 h-[calc(100vh-10rem)] -mx-4 sm:-mx-6 lg:-mx-8 overflow-hidden rounded-xl border border-slate-200 shadow-sm" dir="rtl">

      {/* Mobile overlay */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed inset-y-0 right-0 z-40 w-72 bg-white border-l border-slate-200 flex flex-col transition-transform duration-300
        lg:static lg:z-auto lg:w-64 lg:flex-shrink-0 lg:translate-x-0
        ${showSidebar ? 'translate-x-0' : 'translate-x-full'}
      `}>
        {/* Sidebar header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <span className="text-sm font-bold text-slate-800">תוכן הקורס</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{pages.length} עמודים</span>
            <Button variant="ghost" size="sm" className="lg:hidden h-7 w-7 p-0" onClick={() => setShowSidebar(false)}>
              ✕
            </Button>
          </div>
        </div>

        {/* Progress */}
        {totalQuestions > 0 && (
          <div className="px-4 py-2.5 border-b border-slate-100 flex-shrink-0">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>שאלות</span>
              <span>{answeredQuestions}/{totalQuestions} ({scorePercent}%)</span>
            </div>
            <Progress value={(answeredQuestions / totalQuestions) * 100} className="h-1.5" />
          </div>
        )}

        {/* Page list grouped by section */}
        <nav className="flex-1 overflow-y-auto py-2">
          {sectionGroups.map(({ section, pages: sectionPages }) => (
            <div key={section.id} className="mb-1">
              <div className="px-4 pt-3 pb-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                  {section.title}
                </p>
              </div>
              {sectionPages.map(({ page, index }) => {
                const isActive = index === currentPageIndex;
                const pageQs = questions.filter((q) => q.page_id === page.id);
                const answeredAll = pageQs.length > 0 && pageQs.every((q) => answers[q.id]);
                return (
                  <button
                    key={page.id}
                    onClick={() => goToPage(index)}
                    className={`w-full text-right px-4 py-2 text-sm transition-all flex items-center gap-2 ${
                      isActive
                        ? 'bg-sky-50 text-sky-700 border-r-2 border-sky-500 font-medium'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-r-2 border-transparent'
                    }`}
                  >
                    <PageTypeIcon type={page.page_type || 'text'} />
                    <span className="flex-1 truncate text-right leading-tight">
                      {page.title || `עמוד ${index + 1}`}
                    </span>
                    {answeredAll && <CheckCircle className="h-3 w-3 text-emerald-500 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 flex flex-col bg-slate-50 overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="lg:hidden h-8 w-8 p-0" onClick={() => setShowSidebar(true)}>
              <List className="h-4 w-4" />
            </Button>
            {currentSection && (
              <div className="hidden sm:block">
                <p className="text-xs text-slate-500 leading-none">{currentSection.title}</p>
                <p className="text-sm font-semibold text-slate-900 leading-snug mt-0.5 max-w-xs truncate">
                  {currentPage?.title}
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{currentPageIndex + 1} / {pages.length}</span>
            <Button variant="outline" size="sm" onClick={() => goToPage(currentPageIndex - 1)} disabled={currentPageIndex <= 0}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              onClick={() => goToPage(currentPageIndex + 1)}
              disabled={currentPageIndex >= pages.length - 1}
              className="bg-sky-600 hover:bg-sky-700 text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {currentPage && (
            <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <PageContent page={currentPage} />
              </div>

              {pageQuestions.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span className="inline-block w-1 h-5 bg-sky-500 rounded-full"></span>
                    שאלות לבדיקת הבנה
                  </h3>
                  {pageQuestions.map((question) => (
                    <QuestionBlock
                      key={question.id}
                      question={question}
                      onAnswer={handleAnswer}
                      disabled={isPreview}
                    />
                  ))}
                </div>
              )}

              {/* Bottom nav */}
              <div className="flex items-center justify-between py-2">
                <Button variant="outline" onClick={() => goToPage(currentPageIndex - 1)} disabled={currentPageIndex <= 0}>
                  <ChevronRight className="h-4 w-4 ml-2" />
                  הקודם
                </Button>
                {currentPageIndex < pages.length - 1 ? (
                  <Button onClick={() => goToPage(currentPageIndex + 1)} className="bg-sky-600 hover:bg-sky-700 text-white">
                    הבא
                    <ChevronLeft className="h-4 w-4 mr-2" />
                  </Button>
                ) : (
                  <div className="text-sm font-medium text-slate-500">
                    {answeredQuestions === totalQuestions && totalQuestions > 0
                      ? `סיימת! ${correctAnswers}/${totalQuestions} נכונות (${scorePercent}%)`
                      : 'סוף הקורס'}
                  </div>
                )}
              </div>

              {answeredQuestions === totalQuestions && totalQuestions > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl py-8 text-center">
                  <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto mb-3" />
                  <h3 className="text-xl font-bold text-emerald-900 mb-1">כל הכבוד, סיימת את הקורס!</h3>
                  <p className="text-emerald-800">{correctAnswers} מתוך {totalQuestions} ({scorePercent}%)</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
