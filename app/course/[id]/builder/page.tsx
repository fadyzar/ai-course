'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { FileUploader } from '@/components/course/FileUploader';
import { AssetList } from '@/components/course/AssetList';
import { ProcessingStatus } from '@/components/course/ProcessingStatus';
import { CourseBuilderWizard } from '@/components/course/CourseBuilderWizard';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Info, Download, Loader as Loader2, CirclePlus as PlusCircle } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { ManualQuestionDialog } from '@/components/course/ManualQuestionDialog';

type Course = Database['public']['Tables']['courses']['Row'];
type Asset = Database['public']['Tables']['course_assets']['Row'];

export default function CourseBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const courseId = params.id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [autoConvertTriggered, setAutoConvertTriggered] = useState(false);
  const [manualQuestionOpen, setManualQuestionOpen] = useState(false);

  useEffect(() => {
    if (courseId) {
      loadCourse();
      loadAssets();
    }
  }, [courseId]);

  useEffect(() => {
    if (course) {
      setIsProcessing(course.status === 'processing');
    }
  }, [course]);

  useEffect(() => {
    const shouldAutoConvert = searchParams.get('autoConvert') === '1';
    if (shouldAutoConvert && !autoConvertTriggered && assets.length > 0 && !loading) {
      setAutoConvertTriggered(true);
      router.replace(`/course/${courseId}/builder`);
      handleDownloadOriginal();
    }
  }, [searchParams, assets, loading, autoConvertTriggered]);

  useEffect(() => {
    if (!courseId) return;

    const subscription = supabase
      .channel(`course:${courseId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'courses',
          filter: `id=eq.${courseId}`,
        },
        (payload) => {
          const updatedCourse = payload.new as Course;
          setCourse(updatedCourse);

          if (updatedCourse.status === 'ready') {
            toast.success('הקורס מוכן! עובר לצפייה...');
            setTimeout(() => {
              router.push(`/course/${courseId}/view`);
            }, 1500);
          } else if (updatedCourse.status === 'processing') {
            toast.info('מעבד את הקורס...');
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [courseId]);

  const loadCourse = async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single();

      if (error) throw error;
      setCourse(data);
    } catch (error: any) {
      toast.error('שגיאה בטעינת הקורס');
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const loadAssets = async () => {
    try {
      const { data, error } = await supabase
        .from('course_assets')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAssets(data || []);
    } catch (error: any) {
      toast.error('שגיאה בטעינת קבצים');
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    try {
      const asset = assets.find((a) => a.id === assetId);
      if (!asset) return;

      const { error: storageError } = await supabase.storage
        .from('course-assets')
        .remove([asset.storage_path]);

      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('course_assets')
        .delete()
        .eq('id', assetId);

      if (dbError) throw dbError;

      toast.success('הקובץ נמחק בהצלחה');
      setAssets(assets.filter((a) => a.id !== assetId));
    } catch (error: any) {
      toast.error('שגיאה במחיקת הקובץ: ' + error.message);
    }
  };

  const handleStartProcessing = async () => {
    try {
      const currentAssets = assets.length > 0 ? assets : (await supabase
        .from('course_assets')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false })).data || [];

      if (currentAssets.length === 0) {
        toast.error('אין קבצים להמיר. אנא העלה קובץ תחילה.');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('נא להתחבר מחדש');
        return;
      }

      setIsProcessing(true);

      const processingServerUrl = process.env.NEXT_PUBLIC_PROCESSING_SERVER_URL;

      if (processingServerUrl) {
        // ── Primary: Processing Server ────────────────────────────────────────
        toast.info('מתחיל עיבוד הקורס...');

        await (supabase.from('courses') as any)
          .update({ status: 'processing' })
          .eq('id', courseId);

        // Create one job for all assets
        const { data: job, error: jobError } = await (supabase.from('jobs') as any)
          .insert({
            course_id: courseId,
            asset_id: currentAssets.length === 1 ? currentAssets[0].id : null,
            type: 'process_course',
            status: 'queued',
            progress: 0,
            metadata: { assetCount: currentAssets.length },
          })
          .select()
          .single();

        if (jobError) throw new Error(`שגיאה ביצירת משימה: ${jobError.message}`);

        const apiKey = process.env.NEXT_PUBLIC_PROCESSING_SERVER_API_KEY || '';
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiKey) headers['X-Api-Key'] = apiKey;

        const response = await fetch(`${processingServerUrl}/process-job`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ jobId: job.id }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Processing server error: ${err}`);
        }

        toast.success('העיבוד התחיל! תוכל לעקוב אחרי ההתקדמות למטה');
        await loadCourse();
      } else {
        // ── Fallback: Edge Function ───────────────────────────────────────────
        toast.info('מתחיל עיבוד הקורס עם AI...');

        await (supabase.from('courses') as any)
          .update({ status: 'processing' })
          .eq('id', courseId);

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error('חסרות הגדרות מערכת');
        }

        for (const asset of currentAssets) {
          toast.info(`מעבד קובץ: ${asset.original_name}`);

          const response = await fetch(`${supabaseUrl}/functions/v1/convert-with-ai`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ courseId, assetId: asset.id }),
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'שגיאה לא ידועה' }));
            throw new Error(err.error || `שגיאה בעיבוד ${asset.original_name}`);
          }

          const result = await response.json();
          toast.success(`הקובץ ${asset.original_name} עובד - ${result.sections} פרקים, ${result.questions} שאלות`);
        }

        await loadCourse();
      }
    } catch (error: any) {
      toast.error('שגיאה בעיבוד: ' + error.message);
      await (supabase.from('courses') as any)
        .update({ status: 'draft' })
        .eq('id', courseId);
      setIsProcessing(false);
    }
  };

  const handleDownloadOriginal = async () => {
    try {
      setIsDownloading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('נא להתחבר מחדש');
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/convert-direct`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseKey || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ courseId }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Export failed');
      }

      const { html, filename } = await response.json();
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'course.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await (supabase.from('courses') as any)
        .update({ status: 'ready' })
        .eq('id', courseId);

      await loadCourse();
      toast.success('הקובץ הומר בהצלחה!');
    } catch (error: any) {
      toast.error('שגיאה בייצוא: ' + error.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleExportHtml = async () => {
    try {
      setIsExporting(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('נא להתחבר מחדש');
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/export-html-course`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseKey || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ courseId }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Export failed');
      }

      const { html, filename } = await response.json();
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'course.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('הקורס יוצא כקובץ HTML בהצלחה!');
    } catch (error: any) {
      toast.error('שגיאה בייצוא: ' + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!course) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-col gap-3">
            <Button variant="ghost" size="sm" asChild className="self-start">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4 ml-2" />
                חזרה לדשבורד
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{course.title}</h1>
              <p className="text-slate-600 mt-1 text-sm md:text-base">{course.description || 'בונה קורס אינטראקטיבי'}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {assets.length > 0 && (
              <Button
                onClick={handleStartProcessing}
                disabled={isProcessing}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 ml-2" />
                )}
                {isProcessing ? 'מעבד...' : 'התחל עיבוד'}
              </Button>
            )}
            <Button
              onClick={() => setManualQuestionOpen(true)}
              variant="outline"
              className="border-green-300 text-green-700 hover:bg-green-50 hover:border-green-400"
            >
              <PlusCircle className="h-4 w-4 ml-2" />
              הוסף שאלה ידנית
            </Button>
          </div>
        </div>

        {assets.length === 0 && course.status !== 'ready' && (
          <Alert className="bg-blue-50 border-blue-200 border-2">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong className="block mb-2">ברוך הבא לבונה הקורסים!</strong>
              <p className="text-sm">
                העלה קובץ (PPTX, PDF, מסמך) והמערכת תבנה קורס דיגיטלי אינטראקטיבי עם שאלות אוטומטיות.
              </p>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 order-2 lg:order-1">
            <CourseBuilderWizard
              currentStep={course.status === 'ready' ? 'ready' : assets.length > 0 ? 'processing' : 'upload'}
              hasAssets={assets.length > 0}
              isProcessing={isProcessing}
            />
          </div>

          <div className="lg:col-span-3 space-y-6 order-1 lg:order-2">
            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">
                  העלאת קבצים {assets.length > 0 && `(${assets.length})`}
                </TabsTrigger>
                <TabsTrigger value="files">
                  ניהול קבצים
                </TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="space-y-4">
                <FileUploader
                  courseId={courseId}
                  hasAssets={assets.length > 0}
                  onUploadComplete={() => {
                    loadAssets();
                    toast.success('הקובץ הועלה בהצלחה!');
                  }}
                  onStartProcessing={handleStartProcessing}
                />
              </TabsContent>
              <TabsContent value="files">
                {assets.length > 0 ? (
                  <AssetList assets={assets} onDelete={(id) => {
                    handleDeleteAsset(id);
                    toast.success('הקובץ נמחק בהצלחה');
                  }} />
                ) : (
                  <Card className="p-12 text-center">
                    <p className="text-slate-500 text-lg">אין קבצים עדיין</p>
                    <p className="text-slate-400 text-sm mt-2">העלה קבצים בלשונית "העלאת קבצים"</p>
                  </Card>
                )}
              </TabsContent>
            </Tabs>

            <ProcessingStatus courseId={courseId} />

            {course.status === 'ready' && (
              <Alert className="bg-green-50 border-green-200 border-2">
                <Info className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  <strong className="block mb-2">הקורס מוכן!</strong>
                  <p className="text-sm">
                    עכשיו אפשר לצפות בקורס, להתחיל ללמוד, או להוסיף עוד קבצים ולעבד מחדש.
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </div>
      <ManualQuestionDialog
        courseId={courseId}
        open={manualQuestionOpen}
        onOpenChange={setManualQuestionOpen}
        onQuestionAdded={() => {
          toast.success('השאלה נוספה לקורס!');
        }}
      />
    </DashboardLayout>
  );
}
