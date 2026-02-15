'use client';

import { Database } from '@/types/database.types';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileText, MoreVertical, Edit, Share2, Trash2, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';
import Link from 'next/link';

type Course = Database['public']['Tables']['courses']['Row'];

interface CourseCardProps {
  course: Course;
  onDelete: (id: string) => void;
  onShare: (id: string) => void;
}

const statusText = {
  draft: 'טיוטה',
  processing: 'בעיבוד',
  ready: 'מוכן',
  failed: 'נכשל',
};

const statusColor = {
  draft: 'bg-slate-100 text-slate-700',
  processing: 'bg-blue-100 text-blue-700',
  ready: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export function CourseCard({ course, onDelete, onShare }: CourseCardProps) {
  const timeAgo = formatDistanceToNow(new Date(course.created_at), {
    addSuffix: true,
    locale: he,
  });

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-xl">{course.title}</CardTitle>
            <CardDescription className="line-clamp-2">
              {course.description || 'אין תיאור'}
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/course/${course.id}/builder`}>
                  <Edit className="ml-2 h-4 w-4" />
                  ערוך
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/course/${course.id}/preview`}>
                  <Eye className="ml-2 h-4 w-4" />
                  תצוגת קבצים והמרה
                </Link>
              </DropdownMenuItem>
              {course.status === 'ready' && (
                <DropdownMenuItem asChild>
                  <Link href={`/course/${course.id}/view`}>
                    <Eye className="ml-2 h-4 w-4" />
                    צפה בקורס
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onShare(course.id)}>
                <Share2 className="ml-2 h-4 w-4" />
                שתף
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(course.id)} className="text-red-600">
                <Trash2 className="ml-2 h-4 w-4" />
                מחק
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-2 space-x-reverse text-sm text-slate-500">
          <FileText className="h-4 w-4" />
          <span>{timeAgo}</span>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between items-center">
        <Badge className={statusColor[course.status]}>{statusText[course.status]}</Badge>
        <Button asChild variant="outline" size="sm">
          <Link href={course.status === 'ready' ? `/course/${course.id}/view` : `/course/${course.id}/preview`}>
            {course.status === 'ready' ? 'צפה בקורס' : 'המר לקורס'}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
