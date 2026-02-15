'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { QuestionEditor } from '@/components/course/QuestionEditor';
import { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Course = Database['public']['Tables']['courses']['Row'];
type Question = Database['public']['Tables']['questions']['Row'];

export default function QuestionsPage() {
  const params = useParams();
  const router = useRouter();
  const { profile } = useAuth();
  const courseId = params.id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (courseId) {
      loadCourse();
      loadQuestions();
    }
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

  const loadQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuestions(data || []);
    } catch (error: any) {
      toast.error('שגיאה בטעינת שאלות');
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    try {
      const { error } = await supabase.from('questions').delete().eq('id', questionId);

      if (error) throw error;

      toast.success('השאלה נמחקה בהצלחה');
      setQuestions(questions.filter((q) => q.id !== questionId));
    } catch (error: any) {
      toast.error('שגיאה במחיקת השאלה: ' + error.message);
    }
  };

  const reviewedQuestions = questions.filter((q) => q.reviewed_by_teacher);
  const pendingQuestions = questions.filter((q) => !q.reviewed_by_teacher);

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
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/course/${courseId}/builder`}>
                <ArrowLeft className="h-4 w-4 ml-2" />
                חזרה
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">עריכת שאלות</h1>
              <p className="text-slate-600 mt-1">{course.title}</p>
            </div>
          </div>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            השאלות זוהו אוטומטית באמצעות AI. בדוק כל שאלה ואשר שהתשובות נכונות לפני פרסום הקורס.
            שאלות שלא אושרו לא יופיעו לתלמידים.
          </AlertDescription>
        </Alert>

        {questions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-slate-600">לא נמצאו שאלות בקורס זה.</p>
              <p className="text-sm text-slate-500 mt-2">
                השאלות יזוהו אוטומטית לאחר עיבוד הקבצים.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="pending" className="w-full">
            <TabsList>
              <TabsTrigger value="pending">
                ממתין לאישור ({pendingQuestions.length})
              </TabsTrigger>
              <TabsTrigger value="approved">
                מאושר ({reviewedQuestions.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="space-y-4 mt-6">
              {pendingQuestions.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-slate-600">
                    אין שאלות הממתינות לאישור
                  </CardContent>
                </Card>
              ) : (
                pendingQuestions.map((question) => (
                  <QuestionEditor
                    key={question.id}
                    question={question}
                    onUpdate={loadQuestions}
                    onDelete={handleDeleteQuestion}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="approved" className="space-y-4 mt-6">
              {reviewedQuestions.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-slate-600">
                    אין שאלות מאושרות
                  </CardContent>
                </Card>
              ) : (
                reviewedQuestions.map((question) => (
                  <QuestionEditor
                    key={question.id}
                    question={question}
                    onUpdate={loadQuestions}
                    onDelete={handleDeleteQuestion}
                  />
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
