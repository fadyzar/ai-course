'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from '@/components/ui/responsive-dialog';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function CreateCourseDialog() {
  const router = useRouter();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !profile?.id) {
      toast.error('נא למלא את כל השדות');
      return;
    }

    setLoading(true);
    try {
      const courseData: any = {
        title,
        description,
        owner_id: profile.id,
        status: 'draft',
      };

      if (profile.school_id) {
        courseData.school_id = profile.school_id;
      }

      const { data, error } = await (supabase
        .from('courses') as any)
        .insert(courseData)
        .select()
        .single();

      if (error) throw error;

      toast.success('הקורס נוצר בהצלחה!');
      setOpen(false);
      setTitle('');
      setDescription('');
      router.push(`/course/${data.id}/builder`);
    } catch (error: any) {
      toast.error('שגיאה ביצירת הקורס: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogTrigger asChild>
        <Button size="lg">
          <Plus className="ml-2 h-5 w-5" />
          צור קורס חדש
        </Button>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>צור קורס חדש</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>הזן את פרטי הקורס. תוכל להעלות קבצים בשלב הבא.</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="space-y-4 py-4 px-4">
          <div className="space-y-2">
            <Label htmlFor="title">שם הקורס</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="לדוגמה: מבוא למתמטיקה"
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">תיאור (אופציונלי)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="תאר בקצרה את תוכן הקורס..."
              rows={3}
              disabled={loading}
            />
          </div>
        </div>
        <ResponsiveDialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading} className="w-full sm:w-auto">
            ביטול
          </Button>
          <Button onClick={handleCreate} disabled={loading} className="w-full sm:w-auto">
            {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            צור קורס
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
