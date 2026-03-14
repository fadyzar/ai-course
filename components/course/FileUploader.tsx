'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileText, Loader as Loader2, CircleAlert as AlertCircle, Presentation } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface FileUploaderProps {
  courseId: string;
  onUploadComplete: () => void;
  onStartProcessing?: () => void;
  hasAssets: boolean;
}

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'image/svg+xml': ['.svg'],
  'image/bmp': ['.bmp'],
  'video/mp4': ['.mp4'],
  'video/mpeg': ['.mpeg', '.mpg'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/webm': ['.webm'],
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/ogg': ['.ogg'],
  'audio/mp4': ['.m4a'],
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
  'application/x-rar-compressed': ['.rar'],
  'application/x-7z-compressed': ['.7z'],
};

const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB

async function uploadFileResumable(
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

export function FileUploader({ courseId, onUploadComplete, onStartProcessing, hasAssets }: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ [key: string]: number }>({});

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setUploading(true);

      try {
        for (const file of acceptedFiles) {
          const fileExt = file.name.split('.').pop();
          const sanitizedName = file.name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s.-]/g, '')
            .replace(/\s+/g, '_');
          const fileName = `${courseId}/${Date.now()}-${sanitizedName}`;

          setProgress((prev) => ({ ...prev, [file.name]: 0 }));

          // העלאה עם TUS (תומך בקבצים גדולים)
          await uploadFileResumable(
            'course-assets',
            fileName,
            file,
            (pct) => setProgress((prev) => ({ ...prev, [file.name]: Math.round(pct * 0.9) }))
          );

          setProgress((prev) => ({ ...prev, [file.name]: 95 }));

          const { error: dbError } = await (supabase.from('course_assets') as any).insert({
            course_id: courseId,
            file_type: fileExt || 'unknown',
            storage_path: fileName,
            original_name: file.name,
            size_bytes: file.size,
            status: 'uploaded',
          });

          if (dbError) throw dbError;

          setProgress((prev) => ({ ...prev, [file.name]: 100 }));
        }

        toast.success('הקבצים הועלו בהצלחה!');
        onUploadComplete();
      } catch (error: any) {
        toast.error('שגיאה בהעלאת קבצים: ' + error.message);
      } finally {
        setUploading(false);
        setProgress({});
      }
    },
    [courseId, onUploadComplete]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    disabled: uploading,
    maxSize: 500 * 1024 * 1024,
    onDropRejected: (rejections) => {
      rejections.forEach((rejection) => {
        const { file, errors } = rejection;
        errors.forEach((error) => {
          if (error.code === 'file-too-large') {
            toast.error(`${file.name}: הקובץ גדול מדי (מקסימום 500MB)`);
          } else if (error.code === 'file-invalid-type') {
            toast.error(`${file.name}: סוג קובץ לא נתמך`);
          } else {
            toast.error(`${file.name}: ${error.message}`);
          }
        });
      });
    },
  });

  return (
    <div className="space-y-4">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>טיפ לשקופיות צהובות:</strong> כדי ליצור פרק חדש בקורס, צבע את רקע השקופית בצהוב.
          כל השקופיות עד השער הצהוב הבא יאוגדו כעמוד אחד תחת אותו פרק.
        </AlertDescription>
      </Alert>

      <Card
        {...getRootProps()}
        className={`border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center space-y-4">
          {uploading ? (
            <>
              <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
              <p className="text-lg font-medium">מעלה קבצים...</p>
              {Object.entries(progress).map(([name, pct]) => (
                <div key={name} className="w-full max-w-xs">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span className="truncate">{name}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <Upload className="h-12 w-12 text-slate-400" />
              <div>
                <p className="text-lg font-medium text-slate-900">
                  {isDragActive ? 'שחרר את הקבצים כאן...' : 'גרור קבצים לכאן או לחץ לבחירה'}
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  תמיכה ב: PPT/PPTX, PDF, DOC/DOCX, תמונות (PNG, JPG, GIF, SVG), וידאו (MP4, MOV, AVI), אודיו (MP3, WAV), ארכיבים (ZIP, RAR, 7Z)
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  מקסימום 500MB לקובץ
                </p>
              </div>
            </>
          )}
        </div>
      </Card>

      {hasAssets && onStartProcessing && (
        <Card className="bg-gradient-to-r from-blue-50 to-sky-50 border-blue-200 border-2">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex-1 text-center md:text-right">
                <h3 className="text-lg font-bold text-slate-900 mb-1">הקבצים שלך מוכנים!</h3>
                <p className="text-sm text-slate-600">
                  לחץ על הכפתור כדי להמיר את הקובץ למצגת HTML להורדה
                </p>
              </div>
              <Button
                onClick={onStartProcessing}
                size="lg"
                className="bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white shadow-lg hover:shadow-xl transition-all w-full md:w-auto"
              >
                <Presentation className="h-5 w-5 ml-2" />
                המר למצגת
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Alert>
        <AlertDescription className="text-sm">
          <strong>מגבלות מוצר:</strong> המרת PPTX לא תהיה pixel-perfect. אנחנו ממירים לתוכן קריא ואחיד,
          אך לא כל אפקט או אנימציה יתומכו.
        </AlertDescription>
      </Alert>
    </div>
  );
}
