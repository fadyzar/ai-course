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

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSidebar(!showSidebar)}
            className="lg:hidden"
          >
            <List className="h-4 w-4" />
          </Button>
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">עמוד {currentPageIndex + 1}</span>
            <span className="mx-1">מתוך</span>
            <span>{pages.length}</span>
          </div>
          {currentPage && (
            <div className="hidden sm:flex items-center gap-1.5">
              <PageTypeIcon type={currentPage.page_type || 'text'} />
              <span className="text-xs text-slate-500">
                {currentPage.page_type === 'video' && 'סרטון'}
                {currentPage.page_type === 'pdf' && 'PDF'}
                {currentPage.page_type === 'pptx_slide' && 'שקופית'}
                {currentPage.page_type === 'quiz' && 'שאלון'}
                {(!currentPage.page_type || currentPage.page_type === 'text') && 'תוכן'}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(currentPageIndex + 1)}
            disabled={currentPageIndex >= pages.length - 1}
          >
            הבא
            <ChevronLeft className="h-4 w-4 mr-1" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(currentPageIndex - 1)}
            disabled={currentPageIndex <= 0}
          >
            <ChevronRight className="h-4 w-4 ml-1" />
            הקודם
          </Button>
        </div>
      </div>

      {totalQuestions > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">התקדמות בשאלות</span>
            <span className="text-sm text-slate-600">
              {answeredQuestions} / {totalQuestions} ({scorePercent}% נכונות)
            </span>
          </div>
          <Progress value={(answeredQuestions / totalQuestions) * 100} className="h-2" />
        </div>
      )}

      <div className="flex gap-6">
        <div className={`
          fixed inset-y-0 right-0 z-40 w-72 bg-white border-l border-slate-200 shadow-xl p-4 transition-transform duration-300
          lg:static lg:z-auto lg:shadow-none lg:border lg:rounded-xl lg:w-64 lg:flex-shrink-0
          ${showSidebar ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}>
          {showSidebar && (
            <div
              className="fixed inset-0 bg-black/30 z-[-1] lg:hidden"
              onClick={() => setShowSidebar(false)}
            />
          )}
          <h3 className="text-sm font-bold text-slate-900 mb-3 pb-2 border-b border-slate-200">
            תוכן הקורס
          </h3>
          <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-200px)]">
            {pages.map((page, index) => {
              const section = sections.find((s) => s.id === page.section_id);
              const isActive = index === currentPageIndex;
              const pageQs = questions.filter((q) => q.page_id === page.id);
              const answeredAll = pageQs.length > 0 && pageQs.every((q) => answers[q.id]);
              const label = page.title || section?.title || `עמוד ${index + 1}`;

              return (
                <button
                  key={page.id}
                  onClick={() => goToPage(index)}
                  className={`w-full text-right p-2.5 rounded-lg text-sm transition-all ${
                    isActive
                      ? 'bg-sky-50 text-sky-900 border border-sky-200 font-medium'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <PageTypeIcon type={page.page_type || 'text'} />
                    <span className="flex-1 truncate text-right">{label}</span>
                    {answeredAll && (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-6">
          {currentPage && (
            <>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {currentSection?.title && (
                  <div className="px-6 pt-5 pb-0">
                    <p className="text-xs font-semibold text-sky-600 uppercase tracking-wide">
                      {currentSection.title}
                    </p>
                  </div>
                )}
                <PageContent page={currentPage} />
              </div>

              {pageQuestions.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="inline-block w-1.5 h-6 bg-sky-500 rounded-full"></span>
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
            </>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <Button
              variant="outline"
              onClick={() => goToPage(currentPageIndex - 1)}
              disabled={currentPageIndex <= 0}
            >
              <ChevronRight className="h-4 w-4 ml-2" />
              העמוד הקודם
            </Button>

            {currentPageIndex < pages.length - 1 ? (
              <Button
                onClick={() => goToPage(currentPageIndex + 1)}
                className="bg-sky-600 hover:bg-sky-700 text-white"
              >
                העמוד הבא
                <ChevronLeft className="h-4 w-4 mr-2" />
              </Button>
            ) : (
              answeredQuestions === totalQuestions && totalQuestions > 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-emerald-800 font-semibold text-sm">
                  סיימת! {correctAnswers}/{totalQuestions} נכונות ({scorePercent}%)
                </div>
              ) : (
                <div className="text-sm text-slate-500">סוף הקורס</div>
              )
            )}
          </div>
        </div>
      </div>

      {answeredQuestions === totalQuestions && totalQuestions > 0 && (
        <Card className="border-emerald-300 bg-emerald-50">
          <CardContent className="py-8 text-center">
            <CheckCircle className="h-14 w-14 text-emerald-600 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-emerald-900 mb-2">כל הכבוד, סיימת את הקורס!</h3>
            <p className="text-lg text-emerald-800">
              הציון שלך: {correctAnswers} מתוך {totalQuestions} ({scorePercent}%)
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
