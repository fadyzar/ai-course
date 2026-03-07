'use client';

import { Database } from '@/types/database.types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoveVertical as MoreVertical, CreditCard as Edit, Share2, Trash2, Eye, CirclePlay as PlayCircle, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type Course = Database['public']['Tables']['courses']['Row'];

interface CourseCardProps {
  course: Course;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
}

const STATUS_CONFIG = {
  draft: { label: 'טיוטה', dot: 'bg-slate-400' },
  processing: { label: 'בעיבוד...', dot: 'bg-blue-500 animate-pulse' },
  ready: { label: 'מוכן', dot: 'bg-green-500' },
  failed: { label: 'נכשל', dot: 'bg-red-500' },
};

export function CourseCard({ course, onDelete, onShare }: CourseCardProps) {
  const timeAgo = formatDistanceToNow(new Date(course.created_at), {
    addSuffix: true,
    locale: he,
  });

  const status = STATUS_CONFIG[course.status] ?? STATUS_CONFIG.draft;
  const isReady = course.status === 'ready';

  return (
    <div className="group bg-white rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col">
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn('w-2 h-2 rounded-full shrink-0', status.dot)} />
            <span className="text-xs font-medium text-slate-500">{status.label}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/course/${course.id}/builder`} className="flex items-center gap-2">
                  <Edit className="h-4 w-4" />
                  ערוך
                </Link>
              </DropdownMenuItem>
              {isReady && (
                <DropdownMenuItem asChild>
                  <Link href={`/course/${course.id}/view`} className="flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    צפה בקורס
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onShare(course.id)} className="flex items-center gap-2">
                <Share2 className="h-4 w-4" />
                שתף עם תלמידים
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(course.id)}
                className="flex items-center gap-2 text-red-600 focus:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
                מחק
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm leading-tight line-clamp-2">{course.title}</h3>
        </div>
      </div>

      <div className="px-5 pb-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-xs text-slate-400">{timeAgo}</span>
        <Button
          asChild
          size="sm"
          variant={isReady ? 'default' : 'outline'}
          className={cn('h-8 text-xs gap-1.5', isReady && 'bg-blue-600 hover:bg-blue-700 text-white')}
        >
          <Link href={isReady ? `/course/${course.id}/view` : `/course/${course.id}/builder`}>
            {isReady ? (
              <>
                <PlayCircle className="h-3.5 w-3.5" />
                הפעל קורס
              </>
            ) : (
              <>
                <Edit className="h-3.5 w-3.5" />
                המר לקורס
              </>
            )}
          </Link>
        </Button>
      </div>
    </div>
  );
}
