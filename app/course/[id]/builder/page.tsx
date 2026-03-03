'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { ArrowLeft, Settings, Info, Eye, Download, Loader as Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

type Course = Database['public']['Tables']['courses']['Row'];
type Asset = Database['public']['Tables']['course_assets']['Row'];

export default function CourseBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const courseId = params.id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

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
            toast.success('הקורס מוכן! אפשר לצפות בו עכשיו.');
          } else if (updatedCourse.status === 'processing') {
            toast.info('מעבד את הקורס... זה יכול לקחת כמה רגעים');
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
    } catch (error: any) {
      toast.error('שגיאה בעיבוד: ' + error.message);
      await (supabase.from('courses') as any)
        .update({ status: 'draft' })
        .eq('id', courseId);
      setIsProcessing(false);
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
          <div className="flex flex-wrap gap-2">
            {course.status === 'ready' && (
              <>
                <Button asChild variant="default" size="lg" className="flex-1 md:flex-none">
                  <Link href={`/course/${courseId}/view`}>
                    <Eye className="h-4 w-4 ml-2" />
                    צפה בקורס
                  </Link>
                </Button>
                <Button
                  onClick={handleExportHtml}
                  variant="outline"
                  className="flex-1 md:flex-none"
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 ml-2" />
                  )}
                  ייצא כ-HTML
                </Button>
              </>
            )}
            <Button onClick={handleStartProcessing} variant="outline" disabled={isProcessing} className="flex-1 md:flex-none">
              {isProcessing ? (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              ) : (
                <Settings className="h-4 w-4 ml-2" />
              )}
              {isProcessing ? 'מעבד...' : 'עבד מחדש'}
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
                    toast.success('הקובץ הועלה בהצלחה! כעת תוכל לעבד את הקורס.');
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
    </DashboardLayout>
  );
}
