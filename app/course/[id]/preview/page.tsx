'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Sparkles, Loader as Loader2, FileText, Server, Zap } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const LARGE_FILE_THRESHOLD_BYTES = 20 * 1024 * 1024;

function hasPptxAsset(assets: CourseAsset[]): boolean {
  return assets.some((a) => {
    const ext = (a.file_type || '').toLowerCase();
    return ext === 'pptx' || ext === 'ppt';
  });
}

function getTotalSize(assets: CourseAsset[]): number {
  return assets.reduce((sum, a) => sum + (a.size_bytes || 0), 0);
}

function shouldUseProcessingServer(assets: CourseAsset[]): boolean {
  const processingServerUrl = process.env.NEXT_PUBLIC_PROCESSING_SERVER_URL;
  if (!processingServerUrl) return false;
  return hasPptxAsset(assets) || getTotalSize(assets) > LARGE_FILE_THRESHOLD_BYTES;
}

type Course = Database['public']['Tables']['courses']['Row'];
type CourseAsset = Database['public']['Tables']['course_assets']['Row'];

export default function CoursePreviewPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const courseId = params.id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [assets, setAssets] = useState<CourseAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingMode, setProcessingMode] = useState<'server' | 'edge' | null>(null);

  useEffect(() => {
    if (courseId) {
      loadCourse();
      loadAssets();
    }
  }, [courseId]);

  const loadCourse = async () => {
    try {
      const { data, error } = await (supabase
        .from('courses') as any)
        .select('*')
        .eq('id', courseId)
        .single();

      if (error) throw error;

      if (data.owner_id !== profile?.id) {
        toast.error('אין לך הרשאה לצפות בקורס זה');
        router.push('/dashboard');
        return;
      }

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
      const { data, error } = await (supabase
        .from('course_assets') as any)
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setAssets(data || []);
    } catch (error: any) {
      console.error('Error loading assets:', error);
    }
  };

  useEffect(() => {
    if (!courseId) return;

    const subscription = supabase
      .channel(`course-preview:${courseId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'courses',
          filter: `id=eq.${courseId}`,
        },
        (payload) => {
          const updated = payload.new as Course;
          setCourse(updated);
          if (updated.status === 'ready') {
            setConverting(false);
            setProcessingMode(null);
            toast.success('הקורס מוכן! מעביר לצפייה...');
            router.push(`/course/${courseId}/view`);
          } else if (updated.status === 'failed') {
            setConverting(false);
            setProcessingMode(null);
            toast.error('עיבוד הקורס נכשל');
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [courseId]);

  const handleConvertWithAI = async () => {
    if (!assets.length) {
      toast.error('לא נמצאו קבצים להמרה');
      return;
    }

    setConverting(true);
    setProgress(10);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('אנא התחבר מחדש');
        router.push('/auth/login');
        return;
      }

      const { data: jobData, error: jobError } = await (supabase.from('jobs') as any).insert({
        course_id: courseId,
        type: 'rebuild_course',
        status: 'queued',
      }).select().maybeSingle();

      if (jobError) throw jobError;

      const { error: updateError } = await (supabase.from('courses') as any)
        .update({ status: 'processing' })
        .eq('id', courseId);

      if (updateError) throw updateError;

      setProgress(20);

      const processingServerUrl = process.env.NEXT_PUBLIC_PROCESSING_SERVER_URL;
      const useServer = shouldUseProcessingServer(assets) && !!processingServerUrl;

      if (useServer && processingServerUrl && jobData?.id) {
        setProcessingMode('server');

        try {
          const resp = await fetch(`${processingServerUrl}/process-job`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: jobData.id }),
          });

          if (!resp.ok) {
            throw new Error(`Processing server returned ${resp.status}`);
          }

          setProgress(40);
          toast.success('עיבוד הקורס החל בשרת הייעודי. תועבר אוטומטית כשיסיים.');
          return;
        } catch (serverErr: any) {
          console.warn('[Preview] Processing server failed, falling back:', serverErr.message);
          toast.warning('שרת העיבוד לא זמין, עובר לעיבוד רגיל...');
          setProcessingMode('edge');
        }
      } else {
        setProcessingMode('edge');
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        setProgress(30);

        const response = await fetch(`${supabaseUrl}/functions/v1/worker-process-jobs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': supabaseKey,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errBody = await response.text();
          console.error('[Preview] Worker error:', errBody);
          throw new Error('שגיאה בעיבוד הקורס');
        }

        const result = await response.json();
        console.log('[Preview] Worker result:', result);

        if (result.jobs?.some((j: any) => j.success)) {
          toast.success('הקורס מוכן!');
          router.push(`/course/${courseId}/view`);
        } else if (result.jobs?.some((j: any) => j.error)) {
          throw new Error(result.jobs.find((j: any) => j.error)?.error || 'שגיאה');
        }
      }
    } catch (error: any) {
      console.error('[Preview] Error:', error);
      toast.error(error.message || 'שגיאה בהמרת הקורס');
      setConverting(false);
      setProgress(0);
      setProcessingMode(null);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4 ml-2" />
                חזרה
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{course.title}</h1>
              <p className="text-slate-600 mt-1">תצוגה מקדימה של הקבצים</p>
            </div>
          </div>
        </div>

        {assets.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              לא נמצאו קבצים
            </h3>
            <p className="text-slate-600 mb-6">
              אנא העלה קבצים כדי להמשיך
            </p>
            <Button asChild>
              <Link href={`/course/${courseId}/builder`}>
                העלה קבצים
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="p-6 bg-gradient-to-r from-blue-50 to-sky-50 border-blue-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-semibold text-slate-900">
                      המר לקורס חכם עם בינה מלאכותית
                    </h3>
                    {shouldUseProcessingServer(assets) && !!process.env.NEXT_PUBLIC_PROCESSING_SERVER_URL && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                        <Server className="h-3 w-3" />
                        שרת ייעודי
                      </span>
                    )}
                  </div>
                  <p className="text-slate-700 mb-2">
                    הבינה המלאכותית תנתח את הקבצים שלך, תיצור סיכום מקצועי לכל דף ותוסיף שאלות אמריקאיות מותאמות אישית.
                  </p>
                  {shouldUseProcessingServer(assets) && !!process.env.NEXT_PUBLIC_PROCESSING_SERVER_URL && (
                    <p className="text-sm text-blue-700 mb-3">
                      קבצי PPTX יעובדו בשרת עיבוד ייעודי עם זיכרון מלא ללא מגבלות זמן ריצה.
                    </p>
                  )}
                  {converting && (
                    <div className="space-y-2">
                      <Progress value={progress} className="h-2" />
                      <p className="text-sm text-slate-600 flex items-center gap-1.5">
                        {processingMode === 'server' && <Server className="h-3.5 w-3.5" />}
                        {processingMode === 'edge' && <Zap className="h-3.5 w-3.5" />}
                        מעבד את הקורס... אנא המתן
                      </p>
                    </div>
                  )}
                </div>
                <Button
                  size="lg"
                  onClick={handleConvertWithAI}
                  disabled={converting}
                  className="mr-4 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700"
                >
                  {converting ? (
                    <>
                      <Loader2 className="h-5 w-5 ml-2 animate-spin" />
                      מעבד...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 ml-2" />
                      המר לקורס עם AI
                    </>
                  )}
                </Button>
              </div>
            </Card>

            <div>
              <h2 className="text-xl font-semibold text-slate-900 mb-4">
                הקבצים שהועלו ({assets.length})
              </h2>
              <div className="grid gap-4">
                {assets.map((asset) => (
                  <Card key={asset.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4 space-x-reverse">
                        <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                          <FileText className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">
                            {asset.original_name}
                          </p>
                          <div className="flex items-center space-x-2 space-x-reverse text-sm text-slate-600">
                            <span className="uppercase">{asset.file_type}</span>
                            <span>•</span>
                            <span>
                              {asset.size_bytes >= 1024 * 1024
                                ? `${(asset.size_bytes / 1024 / 1024).toFixed(1)} MB`
                                : `${(asset.size_bytes / 1024).toFixed(0)} KB`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                        {asset.status === 'uploaded' && 'הועלה'}
                        {asset.status === 'processing' && 'מעבד...'}
                        {asset.status === 'processed' && 'מעובד'}
                        {asset.status === 'failed' && 'נכשל'}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
