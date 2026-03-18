'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CourseViewer } from '@/components/course/CourseViewer';
import { Database } from '@/types/database.types';
import { toast } from 'sonner';

type Course = Database['public']['Tables']['courses']['Row'];

export default function CourseViewPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const courseId = params.id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
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
      {/* Negative margins escape DashboardLayout's py-8 px-4 max-w-7xl */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-8">
        <CourseViewer courseId={courseId} />
      </div>
    </DashboardLayout>
  );
}
