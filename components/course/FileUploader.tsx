'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileText, Loader2, AlertCircle, Presentation } from 'lucide-react';
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

          const { error: uploadError } = await supabase.storage
            .from('course-assets')
            .upload(fileName, file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) throw uploadError;

          setProgress((prev) => ({ ...prev, [file.name]: 50 }));

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
    maxSize: 100 * 1024 * 1024,
    onDropRejected: (rejections) => {
      rejections.forEach((rejection) => {
        const { file, errors } = rejection;
        errors.forEach((error) => {
          if (error.code === 'file-too-large') {
            toast.error(`${file.name}: הקובץ גדול מדי (מקסימום 100MB)`);
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
                  מקסימום 100MB לקובץ
                </p>
              </div>
            </>
          )}
        </div>
      </Card>

      {Object.keys(progress).length > 0 && (
        <div className="space-y-2">
          {Object.entries(progress).map(([fileName, prog]) => (
            <div key={fileName} className="flex items-center space-x-3 space-x-reverse">
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="text-sm flex-1">{fileName}</span>
              <span className="text-sm text-slate-500">{prog}%</span>
            </div>
          ))}
        </div>
      )}

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
