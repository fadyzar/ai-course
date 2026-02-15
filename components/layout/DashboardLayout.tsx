'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { LogOut, BookOpen } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (user && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-lg text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">שגיאה בטעינת פרופיל</h2>
          <p className="text-slate-600 mb-6">
            לא נמצא פרופיל עבור המשתמש שלך. אנא התנתק והתחבר מחדש.
          </p>
          <Button onClick={signOut} className="w-full">
            <LogOut className="h-4 w-4 ml-2" />
            התנתק
          </Button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const initials = profile.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3 space-x-reverse">
              <BookOpen className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Slide2Course</h1>
              </div>
            </div>

            <div className="flex items-center space-x-4 space-x-reverse">
              <div className="text-right">
                <p className="text-sm font-medium text-slate-900">{profile.full_name}</p>
                <p className="text-xs text-slate-500">{profile.role === 'teacher' ? 'מורה' : 'תלמיד'}</p>
              </div>
              <Avatar>
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4 ml-2" />
                התנתק
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
