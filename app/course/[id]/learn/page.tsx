'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CourseViewer } from '@/components/course/CourseViewer';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen } from 'lucide-react';

type Course = Database['public']['Tables']['courses']['Row'];

export default function LearnCoursePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const courseId = params.id as string;
  const token = searchParams.get('token');

  const [course, setCourse] = useState<Course | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState('');
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (courseId && token) {
      verifyAccess();
    } else if (!token) {
      setError('חסר קישור שיתוף');
      setLoading(false);
    }
  }, [courseId, token]);

  const verifyAccess = async () => {
    if (!token) {
      setError('חסר קישור שיתוף');
      setLoading(false);
      return;
    }

    try {
      const { data: share, error: shareError } = await (supabase
        .from('shares') as any)
        .select('*')
        .eq('course_id', courseId)
        .eq('share_token', token)
        .maybeSingle();

      if (shareError || !share) {
        setError('הקישור אינו תקף או שפג תוקפו');
        setLoading(false);
        return;
      }

      if (share.expires_at && new Date(share.expires_at) < new Date()) {
        setError('הקישור פג תוקף');
        setLoading(false);
        return;
      }

      const { data: courseData, error: courseError } = await (supabase
        .from('courses') as any)
        .select('*')
        .eq('id', courseId)
        .single();

      if (courseError || !courseData) {
        setError('הקורס לא נמצא');
        setLoading(false);
        return;
      }

      setCourse(courseData);
    } catch (err: any) {
      setError('אירעה שגיאה בטעינת הקורס');
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (!studentName.trim()) return;

    try {
      const { data, error } = await (supabase
        .from('attempts') as any)
        .insert({
          course_id: courseId,
          student_identifier: studentName,
        })
        .select()
        .single();

      if (error) throw error;

      setAttemptId(data.id);
      setStarted(true);
    } catch (err: any) {
      console.error('Error creating attempt:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>שגיאה</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <BookOpen className="h-12 w-12 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">{course?.title}</CardTitle>
            <CardDescription>{course?.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">הזן את שמך להתחלה</Label>
              <Input
                id="name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="שם מלא"
                onKeyPress={(e) => e.key === 'Enter' && handleStart()}
              />
            </div>
            <Button onClick={handleStart} className="w-full" disabled={!studentName.trim()}>
              התחל קורס
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3 space-x-reverse">
              <BookOpen className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-bold text-slate-900">{course?.title}</h1>
            </div>
            <p className="text-sm text-slate-600">שלום, {studentName}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CourseViewer courseId={courseId} attemptId={attemptId || undefined} />
      </main>
    </div>
  );
}
