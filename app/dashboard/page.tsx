'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CreateCourseDialog } from '@/components/dashboard/CreateCourseDialog';
import { CourseCard } from '@/components/dashboard/CourseCard';
import { Database } from '@/types/database.types';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  ResponsiveAlertDialog,
  ResponsiveAlertDialogAction,
  ResponsiveAlertDialogCancel,
  ResponsiveAlertDialogContent,
  ResponsiveAlertDialogDescription,
  ResponsiveAlertDialogFooter,
  ResponsiveAlertDialogHeader,
  ResponsiveAlertDialogTitle,
} from '@/components/ui/responsive-alert-dialog';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';

type Course = Database['public']['Tables']['courses']['Row'];

export default function DashboardPage() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (profile) {
      loadCourses();
    }
  }, [profile]);

  const loadCourses = async () => {
    if (!profile?.id) {
      console.log('[Dashboard] No profile ID, skipping load');
      return;
    }

    console.log('[Dashboard] Loading courses for user:', profile.id);

    try {
      const { data, error } = await (supabase
        .from('courses') as any)
        .select('*')
        .eq('owner_id', profile.id)
        .order('created_at', { ascending: false });

      console.log('[Dashboard] Query result:', { data, error });

      if (error) {
        console.error('[Dashboard] Error loading courses:', error);
        throw error;
      }

      console.log('[Dashboard] Successfully loaded courses:', data?.length || 0);
      setCourses(data || []);
    } catch (error: any) {
      console.error('[Dashboard] Exception:', error);
      toast.error('שגיאה בטעינת הקורסים: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCourse) return;

    try {
      const { error } = await supabase.from('courses').delete().eq('id', selectedCourse);

      if (error) throw error;

      toast.success('הקורס נמחק בהצלחה');
      setCourses(courses.filter((c) => c.id !== selectedCourse));
      setDeleteDialogOpen(false);
    } catch (error: any) {
      toast.error('שגיאה במחיקת הקורס: ' + error.message);
    }
  };

  const handleShare = async (courseId: string) => {
    try {
      const { data: existingShare } = await (supabase
        .from('shares') as any)
        .select('share_token')
        .eq('course_id', courseId)
        .maybeSingle();

      let token = existingShare?.share_token;

      if (!token) {
        const { data: newShare, error } = await (supabase
          .from('shares') as any)
          .insert({ course_id: courseId })
          .select('share_token')
          .single();

        if (error) throw error;
        token = newShare.share_token;
      }

      const url = `${window.location.origin}/course/${courseId}/learn?token=${token}`;
      setShareUrl(url);
      setShareDialogOpen(true);
    } catch (error: any) {
      toast.error('שגיאה ביצירת קישור שיתוף: ' + error.message);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('הקישור הועתק ללוח');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">הקורסים שלי</h1>
            <p className="text-slate-600 mt-1">נהל את כל הקורסים שלך במקום אחד</p>
          </div>
          <CreateCourseDialog />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-slate-300">
            <p className="text-slate-600 text-lg mb-4">עדיין אין לך קורסים</p>
            <p className="text-slate-500 mb-6">התחל ליצור קורס ראשון והמר מצגות לחוויית למידה אינטראקטיבית</p>
            <CreateCourseDialog />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                onDelete={(id) => {
                  setSelectedCourse(id);
                  setDeleteDialogOpen(true);
                }}
                onShare={handleShare}
              />
            ))}
          </div>
        )}
      </div>

      <ResponsiveAlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <ResponsiveAlertDialogContent>
          <ResponsiveAlertDialogHeader>
            <ResponsiveAlertDialogTitle>האם אתה בטוח?</ResponsiveAlertDialogTitle>
            <ResponsiveAlertDialogDescription>
              פעולה זו תמחק את הקורס לצמיתות. לא ניתן לשחזר את הקורס לאחר מחיקה.
            </ResponsiveAlertDialogDescription>
          </ResponsiveAlertDialogHeader>
          <ResponsiveAlertDialogFooter>
            <ResponsiveAlertDialogCancel>ביטול</ResponsiveAlertDialogCancel>
            <ResponsiveAlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              מחק
            </ResponsiveAlertDialogAction>
          </ResponsiveAlertDialogFooter>
        </ResponsiveAlertDialogContent>
      </ResponsiveAlertDialog>

      <ResponsiveDialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>שתף קורס</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>שלח קישור זה לתלמידים כדי שיוכלו לגשת לקורס</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="space-y-4 px-4 pb-4">
            <div className="space-y-2">
              <Label>קישור שיתוף</Label>
              <div className="flex space-x-2 space-x-reverse">
                <Input value={shareUrl} readOnly className="flex-1" />
                <Button onClick={copyToClipboard} size="icon" variant="outline">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </DashboardLayout>
  );
}
