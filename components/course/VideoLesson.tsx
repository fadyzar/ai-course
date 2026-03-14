'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Play, CircleAlert as AlertCircle, Loader as Loader2 } from 'lucide-react';

interface VideoLessonProps {
  storagePath: string;
  title?: string | null;
}

export function VideoLesson({ storagePath, title }: VideoLessonProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let objectUrl: string | null = null;

    async function loadVideo() {
      setLoading(true);
      setError(null);
      setVideoUrl(null);

      try {
        const { data, error: signedError } = await supabase.storage
          .from('course-assets')
          .createSignedUrl(storagePath, 3600);

        if (signedError || !data?.signedUrl) {
          throw new Error(signedError?.message || 'לא ניתן לטעון את הסרטון');
        }

        setVideoUrl(data.signedUrl);
      } catch (err: any) {
        setError(err.message || 'שגיאה בטעינת הסרטון');
      } finally {
        setLoading(false);
      }
    }

    loadVideo();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [storagePath]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center bg-slate-900 rounded-xl aspect-video gap-3">
        <Loader2 className="h-10 w-10 text-white animate-spin" />
        <p className="text-slate-300 text-sm">טוען סרטון...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center bg-slate-100 rounded-xl aspect-video gap-3 border border-red-200">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-red-600 text-sm font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {title && (
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Play className="h-5 w-5 text-sky-500 fill-sky-500" />
          {title}
        </h2>
      )}
      <div className="relative bg-black rounded-xl overflow-hidden shadow-lg">
        <video
          ref={videoRef}
          src={videoUrl!}
          controls
          controlsList="nodownload"
          className="w-full max-h-[70vh] object-contain"
          preload="metadata"
          playsInline
        >
          הדפדפן שלך אינו תומך בתגית וידאו.
        </video>
      </div>
    </div>
  );
}
