'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, UserCircle, BookOpen, Trophy, Bell, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { signUpUser } from '@/lib/auth-helpers';
import { toast } from 'sonner';

export default function StudentRegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    courseCode: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password.length < 6) {
      toast.error('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    if (!formData.fullName.trim()) {
      toast.error('נא להזין שם מלא');
      return;
    }

    setIsLoading(true);

    try {
      const result = await signUpUser({
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
        role: 'student',
        courseCode: formData.courseCode || undefined,
        phone: formData.phone || undefined,
      });

      if (result.success) {
        toast.success('הרישום הושלם בהצלחה!');
        router.push('/dashboard');
      } else {
        toast.error(result.error || 'שגיאה ברישום');
      }
    } catch (error: any) {
      toast.error('שגיאה בלתי צפויה');
      console.error('Registration error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-cyan-400 rounded flex items-center justify-center">
                <Download className="h-4 w-4 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900">SlidesUp Learning</span>
            </div>

            <nav className="hidden lg:flex items-center gap-6 text-sm">
              <Link href="/" className="text-slate-600 hover:text-slate-900">דף הבית</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">יצירת קורס</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">מדריך תבניות</Link>
              <Link href="/teacher-register" className="text-slate-600 hover:text-slate-900">רישום מורה</Link>
              <Link href="/student-register" className="text-slate-600 hover:text-slate-900">רישום תלמיד</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">כתיבת עיצונים</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">אודות תלמיד</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">צור קשר</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">EN / HE</Link>
              <Link href="/auth/login" className="text-slate-600 hover:text-slate-900">התחברות</Link>
            </nav>

            <Button asChild className="bg-cyan-400 hover:bg-cyan-500 text-white rounded-md px-6">
              <Link href="/student-register">
                הרשמה
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div className="bg-white rounded-lg border border-slate-200 p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900 mb-6 text-center">
              טופס רישום תלמיד
            </h1>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-right block">
                  שם מלא
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="שם המשתמש שיוצגלכם מהתחברת"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="text-right"
                  required
                />
                <p className="text-xs text-slate-500 text-right">
                  שם המשתמש אשר עלי זה יבוצע כניסה והצגת קורסי
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-right block">
                  דוא״ל
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="student@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="text-left"
                  dir="ltr"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-right block">
                  טלפון (אופציונלי)
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="050-1234567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="text-left"
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-right block">
                  סיסמה
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="הסיסמה שיצרללם מהתחברת"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="text-right"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="courseCode" className="text-right block">
                  קוד קורס / כיתה (אופציונלי)
                </Label>
                <Input
                  id="courseCode"
                  type="text"
                  placeholder="לדוגמא: BIO101-A"
                  value={formData.courseCode}
                  onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })}
                  className="text-right"
                />
                <p className="text-xs text-slate-500 text-right">
                  אם קיבלתם קוד הצטרפות לקורס או כיתה, הזינו אותו כאן
                </p>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-cyan-400 hover:bg-cyan-500 text-white h-12 text-base font-medium disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    נרשם...
                  </>
                ) : (
                  'כניסה ללמידה'
                )}
              </Button>

              <p className="text-sm text-center text-slate-600">
                כניסה באמתווריל? עם למורה שלנו{' '}
                <Link href="#" className="text-cyan-500 hover:text-cyan-600 font-medium">
                  צור קשר
                </Link>
              </p>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-200 text-center">
              <Link href="/teacher-register" className="text-sm text-cyan-500 hover:text-cyan-600">
                כבר רשומתי? התחברו כאן
              </Link>
            </div>
          </div>

          <div className="space-y-8">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-cyan-100 rounded-full flex items-center justify-center flex-shrink-0">
                <UserCircle className="w-8 h-8 text-cyan-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">הצטרפות כתלמיד</h2>
                <p className="text-slate-600 leading-relaxed">
                  הירשמו עם הפרטים שיצרנלם מהתחברת והתחילו ללמוד קורסים אינטראקטיביים
                </p>
              </div>
            </div>

            <div className="bg-cyan-50 rounded-lg p-6 space-y-4">
              <div className="flex items-start gap-3">
                <BookOpen className="w-5 h-5 text-cyan-600 flex-shrink-0 mt-1" />
                <p className="text-slate-700">
                  גישה לקורסים אינטראקטיביים ומתקדמים
                </p>
              </div>

              <div className="flex items-start gap-3">
                <Trophy className="w-5 h-5 text-cyan-600 flex-shrink-0 mt-1" />
                <p className="text-slate-700">
                  מעקב אחרי ציונים והתקדמות
                </p>
              </div>

              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-cyan-600 flex-shrink-0 mt-1" />
                <p className="text-slate-700">
                  קבלת הודעות ומשימות מהמורה
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-6">
              <p className="text-slate-700 font-medium mb-3">
                שימו לב:
              </p>
              <p className="text-slate-600 text-sm leading-relaxed">
                אתר הרישום הראשוני, ההתחברות נשמרת ולא תצטרכו להירשם שוב. לקורסים נוספים פשוט להזין על הרושמת לקורסי בתוך אזור הלמידה.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
