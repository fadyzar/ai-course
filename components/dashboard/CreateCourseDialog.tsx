'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Loader as Loader2, Upload, Link2, Cloud, X, FileText, CircleAlert as AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { cn } from '@/lib/utils';

const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB

async function uploadLargeFile(
  bucket: string,
  path: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || supabaseKey;

  // שלב 1: יצירת upload session
  const createRes = await fetch(`${supabaseUrl}/storage/v1/upload/resumable`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': supabaseKey,
      'x-upsert': 'true',
      'Upload-Length': String(file.size),
      'Upload-Metadata': [
        `bucketName ${btoa(bucket)}`,
        `objectName ${btoa(path)}`,
        `contentType ${btoa(file.type || 'application/octet-stream')}`,
        `cacheControl ${btoa('3600')}`,
      ].join(','),
      'Tus-Resumable': '1.0.0',
      'Content-Length': '0',
    },
  });

  if (!createRes.ok && createRes.status !== 201) {
    const text = await createRes.text();
    throw new Error(`שגיאה ביצירת upload: ${text}`);
  }

  const location = createRes.headers.get('Location');
  if (!location) throw new Error('לא התקבל Location מהשרת');

  const tusUrl = location.startsWith('http')
    ? location
    : `${supabaseUrl}${location}`;

  // שלב 2: העלאה בחלקים
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, end);

    const patchRes = await fetch(tusUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': String(offset),
        'Tus-Resumable': '1.0.0',
        'Content-Length': String(chunk.size),
      },
      body: chunk,
    });

    if (!patchRes.ok) {
      const text = await patchRes.text();
      throw new Error(`שגיאה בהעלאה: ${text}`);
    }

    offset = end;
    onProgress(Math.round((offset / file.size) * 100));
  }
}

type SourceType = 'upload' | 'google_drive' | 'canva';
type FeedbackMode = 'immediate' | 'end' | 'none';

interface CourseSettings {
  ai_auto_score: boolean;
  show_score_at_end: boolean;
  feedback_mode: FeedbackMode;
  ai_grade_open_questions: boolean;
  free_navigation: boolean;
  show_question_score: boolean;
}

const DEFAULT_SETTINGS: CourseSettings = {
  ai_auto_score: true,
  show_score_at_end: true,
  feedback_mode: 'immediate',
  ai_grade_open_questions: false,
  free_navigation: true,
  show_question_score: true,
};

const ACCEPTED_TYPES: Record<string, string[]> = {
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

export function CreateCourseDialog() {
  const router = useRouter();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('upload');
  const [sourceUrl, setSourceUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [settings, setSettings] = useState<CourseSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) {
      const f = accepted[0];
      setFile(f);
      if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ''));
    }
  }, [title]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    multiple: false,
  });

  const canProceedStep1 = () => {
    if (!title.trim()) return false;
    if (sourceType === 'upload') return !!file;
    return sourceUrl.trim().length > 0;
  };

  const handleClose = () => {
    setOpen(false);
    setStep(1);
    setTitle('');
    setSourceType('upload');
    setSourceUrl('');
    setFile(null);
    setSettings(DEFAULT_SETTINGS);
    setUploadProgress(0);
  };

  const triggerConvert = async (courseId: string, session: any) => {
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
      const err = await response.json().catch(() => ({ error: 'שגיאה לא ידועה' }));
      toast.error('שגיאה בהמרה: ' + (err.error || 'שגיאה לא ידועה'));
    } else {
      toast.success('הקורס נוצר והומר בהצלחה!');
    }
  };

  const handleCreate = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const courseData: any = {
        title: title.trim(),
        owner_id: profile.id,
        status: 'draft',
        source_type: sourceType,
        source_url: sourceType !== 'upload' ? sourceUrl.trim() : null,
        course_settings: settings,
      };
      if (profile.school_id) courseData.school_id = profile.school_id;

      const { data: course, error: courseError } = await (supabase.from('courses') as any)
        .insert(courseData)
        .select()
        .single();
      if (courseError) throw courseError;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('לא מחובר');

      if (sourceType === 'upload' && file) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const storagePath = `${course.id}/${Date.now()}_${sanitizedName}`;

        setUploadProgress(0);
        await uploadLargeFile('course-assets', storagePath, file, setUploadProgress);

        const { error: assetError } = await (supabase.from('course_assets') as any).insert({
          course_id: course.id,
          file_type: ext,
          storage_path: storagePath,
          original_name: file.name,
          size_bytes: file.size,
          status: 'uploaded',
        });
        if (assetError) throw assetError;

        handleClose();
        router.push(`/course/${course.id}/builder`);
        triggerConvert(course.id, session);

      } else if ((sourceType === 'google_drive' || sourceType === 'canva') && sourceUrl.trim()) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        toast.info('מוריד קובץ מהקישור...');

        const fetchResp = await fetch(`${supabaseUrl}/functions/v1/fetch-external-file`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': supabaseKey || '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ courseId: course.id, url: sourceUrl.trim() }),
        });

        if (!fetchResp.ok) {
          const err = await fetchResp.json().catch(() => ({ error: 'שגיאה בהורדת הקובץ' }));
          throw new Error(err.error || 'שגיאה בהורדת הקובץ');
        }

        handleClose();
        router.push(`/course/${course.id}/builder`);
        triggerConvert(course.id, session);

      } else {
        handleClose();
        router.push(`/course/${course.id}/builder`);
      }
    } catch (error: any) {
      toast.error('שגיאה: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const setSetting = <K extends keyof CourseSettings>(key: K, val: CourseSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  return (
    <>
      <Button
        size="lg"
        onClick={() => setOpen(true)}
        className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
      >
        <Plus className="h-5 w-5" />
        צור קורס חדש
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-white" dir="rtl">
          <div className="flex flex-col" style={{ maxHeight: '90vh' }}>
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-xl font-bold text-slate-900">
                  {step === 1 ? 'צור קורס חדש' : 'הגדרות תצוגת הקורס'}
                </DialogTitle>
                <div className="flex items-center gap-2">
                  <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors', step === 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500')}>1</span>
                  <div className="w-6 h-px bg-slate-200" />
                  <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors', step === 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500')}>2</span>
                </div>
              </div>
            </DialogHeader>

            <div className="overflow-y-auto flex-1">
              {step === 1 ? (
                <div className="p-6 space-y-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">שם הקורס</Label>
                    <Input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="לדוגמה: מבוא לאלגברה – יחידה 3"
                      className="h-11 text-base"
                      dir="rtl"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-semibold text-slate-700">מקור המצגת</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { key: 'upload' as const, label: 'העלאת קובץ', icon: Upload },
                        { key: 'google_drive' as const, label: 'Google Drive', icon: Cloud },
                        { key: 'canva' as const, label: 'Canva', icon: Link2 },
                      ]).map(({ key, label, icon: Icon }) => (
                        <button
                          key={key}
                          onClick={() => setSourceType(key)}
                          className={cn(
                            'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-sm font-medium',
                            sourceType === key
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {sourceType === 'upload' ? (
                    <div className="space-y-3">
                      {file ? (
                        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                          <FileText className="h-8 w-8 text-blue-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{file.name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                          </div>
                          <button onClick={() => setFile(null)} className="text-slate-400 hover:text-slate-600 p-1">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div
                          {...getRootProps()}
                          className={cn(
                            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
                          )}
                        >
                          <input {...getInputProps()} />
                          <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                          <p className="font-semibold text-slate-700 mb-1">גרור קובץ לכאן או לחץ להעלאה</p>
                          <p className="text-sm text-slate-500">PDF, PPTX, PPT, DOCX – עד 500MB</p>
                        </div>
                      )}
                      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                        <p className="text-xs text-amber-700">
                          שקופית השער (כותרת היחידה) צריכה להיות <strong>בצבע צהוב</strong> או בתבנית שנבחרה – היא תומר ללשונית ניווט בסרגל.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Label className="text-sm font-semibold text-slate-700">
                        {sourceType === 'google_drive' ? 'קישור Google Drive' : 'קישור Canva'}
                      </Label>
                      <Input
                        value={sourceUrl}
                        onChange={e => setSourceUrl(e.target.value)}
                        placeholder={sourceType === 'google_drive' ? 'https://drive.google.com/file/d/...' : 'https://www.canva.com/...'}
                        dir="ltr"
                        className="h-11 text-sm font-mono"
                      />
                      {sourceType === 'google_drive' && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1.5">
                          <p className="text-xs font-semibold text-blue-800">כיצד לשתף קובץ מ-Google Drive:</p>
                          <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                            <li>לחץ על הקובץ ב-Google Drive &lt; שתף</li>
                            <li>שנה ל: <strong>כל מי שיש לו קישור יכול להציג</strong></li>
                            <li>העתק את הקישור והדבק כאן</li>
                          </ol>
                          <p className="text-xs text-blue-600 mt-1">תומך ב: PPTX, PDF, DOCX</p>
                        </div>
                      )}
                      {sourceType === 'canva' && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1.5">
                          <p className="text-xs font-semibold text-blue-800">כיצד לייצא מ-Canva:</p>
                          <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                            <li>ב-Canva לחץ על שתף &lt; הורד</li>
                            <li>בחר פורמט PDF או PPTX</li>
                            <li>לחלופין: שתף &lt; אפשר צפייה &lt; העתק קישור</li>
                          </ol>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6">
                  <p className="text-sm text-slate-500 mb-5">הגדר כיצד יתנהג הקורס עבור התלמידים</p>
                  <div className="divide-y divide-slate-100">
                    {([
                      { key: 'ai_auto_score' as const, label: 'חישוב ניקוד אוטומטי ע"י AI', desc: 'ה-AI יחשב ניקוד לפי אחוזים לכל שאלה' },
                      { key: 'show_score_at_end' as const, label: 'הצג ציון בסוף הקורס', desc: 'התלמיד יראה את הציון הסופי (מצב מבחן)' },
                      { key: 'ai_grade_open_questions' as const, label: 'AI יבדוק שאלות פתוחות', desc: 'חיווי מילולי וניקוד על שאלות פתוחות' },
                      { key: 'free_navigation' as const, label: 'ניווט חופשי', desc: 'כבוי = חייב לענות נכון לפני מעבר לעמוד הבא' },
                      { key: 'show_question_score' as const, label: 'הצג ניקוד לכל שאלה', desc: 'התלמיד יראה כמה נקודות כל שאלה שווה' },
                    ]).map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center justify-between py-4">
                        <div className="flex-1 ml-4">
                          <p className="text-sm font-semibold text-slate-800">{label}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                        </div>
                        <Switch checked={settings[key]} onCheckedChange={val => setSetting(key, val)} />
                      </div>
                    ))}
                  </div>
                  <div className="pt-5 mt-2 border-t border-slate-100">
                    <Label className="text-sm font-semibold text-slate-800 mb-3 block">מתי לתת חיווי לתלמיד</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { val: 'immediate' as const, label: 'מיד אחרי תשובה' },
                        { val: 'end' as const, label: 'בסוף הקורס' },
                        { val: 'none' as const, label: 'ללא חיווי' },
                      ]).map(({ val, label }) => (
                        <button
                          key={val}
                          onClick={() => setSetting('feedback_mode', val)}
                          className={cn(
                            'p-3 rounded-xl border-2 text-xs font-semibold transition-all',
                            settings.feedback_mode === val
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-between gap-3 shrink-0 bg-white">
              {step === 1 ? (
                <>
                  <Button variant="outline" onClick={handleClose} className="flex-1">ביטול</Button>
                  <Button
                    onClick={() => setStep(2)}
                    disabled={!canProceedStep1()}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-2"
                  >
                    הגדרות קורס
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                    <ChevronRight className="h-4 w-4" />
                    חזור
                  </Button>
                  <div className="flex-1 flex flex-col gap-2">
                    {loading && sourceType === 'upload' && uploadProgress > 0 && uploadProgress < 100 && (
                      <div className="space-y-1">
                        <Progress value={uploadProgress} className="h-2" />
                        <p className="text-xs text-slate-500 text-center">מעלה קובץ... {uploadProgress}%</p>
                      </div>
                    )}
                    <Button
                      onClick={handleCreate}
                      disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {loading ? (uploadProgress > 0 && uploadProgress < 100 ? 'מעלה קובץ...' : 'יוצר קורס...') : 'צור קורס'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
