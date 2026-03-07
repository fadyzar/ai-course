'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CreateCourseDialog } from '@/components/dashboard/CreateCourseDialog';
import { CourseCard } from '@/components/dashboard/CourseCard';
import { Database } from '@/types/database.types';
import { toast } from 'sonner';
import { Loader as Loader2, BookOpen } from 'lucide-react';
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
    if (profile) loadCourses();
  }, [profile]);

  const loadCourses = async () => {
    if (!profile?.id) return;
    try {
      const { data, error } = await (supabase.from('courses') as any)
        .select('*')
        .eq('owner_id', profile.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCourses(data || []);
    } catch (error: any) {
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
      setCourses(courses.filter(c => c.id !== selectedCourse));
      setDeleteDialogOpen(false);
    } catch (error: any) {
      toast.error('שגיאה במחיקת הקורס: ' + error.message);
    }
  };

  const handleShare = async (courseId: string) => {
    try {
      const { data: existing } = await (supabase.from('shares') as any)
        .select('share_token')
        .eq('course_id', courseId)
        .maybeSingle();

      let token = existing?.share_token;
      if (!token) {
        const { data: newShare, error } = await (supabase.from('shares') as any)
          .insert({ course_id: courseId })
          .select('share_token')
          .single();
        if (error) throw error;
        token = newShare.share_token;
      }

      setShareUrl(`${window.location.origin}/course/${courseId}/learn?token=${token}`);
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
      <div className="min-h-full flex flex-col" dir="rtl">
        <div className="flex-1 flex flex-col items-center justify-center py-20 px-4">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-5 shadow-lg">
              <BookOpen className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">Slide2Course</h1>
            <p className="text-slate-500 text-lg max-w-md mx-auto">
              העלה מצגת, הגדר הגדרות – וקבל קורס אינטראקטיבי מוכן לשיתוף
            </p>
          </div>
          <CreateCourseDialog />
        </div>

        <div className="border-t border-slate-200 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">הקורסים שלי</h2>
              {!loading && (
                <p className="text-sm text-slate-500 mt-0.5">{courses.length} קורסים</p>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
              </div>
            ) : courses.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border-2 border-dashed border-slate-200 bg-white">
                <p className="text-slate-500 font-medium">עדיין לא יצרת קורסים</p>
                <p className="text-slate-400 text-sm mt-1">לחץ על "צור קורס חדש" כדי להתחיל</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {courses.map(course => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    onDelete={id => { setSelectedCourse(id); setDeleteDialogOpen(true); }}
                    onShare={handleShare}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ResponsiveAlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <ResponsiveAlertDialogContent>
          <ResponsiveAlertDialogHeader>
            <ResponsiveAlertDialogTitle>מחיקת קורס</ResponsiveAlertDialogTitle>
            <ResponsiveAlertDialogDescription>
              פעולה זו תמחק את הקורס לצמיתות. לא ניתן לשחזר.
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
            <ResponsiveDialogTitle>שתף קורס עם תלמידים</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>העתק קישור זה ושלח לתלמידים</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="space-y-3 px-4 pb-4">
            <Label>קישור שיתוף</Label>
            <div className="flex gap-2">
              <Input value={shareUrl} readOnly className="flex-1 text-sm font-mono" dir="ltr" />
              <Button onClick={copyToClipboard} size="icon" variant="outline">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </DashboardLayout>
  );
}
