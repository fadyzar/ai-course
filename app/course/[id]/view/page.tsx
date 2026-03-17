'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CourseViewer } from '@/components/course/CourseViewer';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Edit, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

type Course = Database['public']['Tables']['courses']['Row'];

export default function CourseViewPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const courseId = params.id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (courseId) {
      loadCourse();
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
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4 ml-1" />
                חזרה
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">{course.title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleExportHtml}
              variant="outline"
              size="sm"
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 ml-2" />
              )}
              ייצא HTML
            </Button>
            <Button size="sm" asChild>
              <Link href={`/course/${courseId}/builder`}>
                <Edit className="h-4 w-4 ml-2" />
                ערוך
              </Link>
            </Button>
          </div>
        </div>

        <CourseViewer courseId={courseId} />
      </div>
    </DashboardLayout>
  );
}
