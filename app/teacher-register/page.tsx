'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BookOpen, Users, ChartBar as BarChart3, Globe, Download, Mail, Phone, GraduationCap, Loader as Loader2 } from 'lucide-react';
import { signUpUser } from '@/lib/auth-helpers';
import { toast } from 'sonner';

export default function TeacherRegister() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    username: '',
    password: '',
    confirmPassword: '',
    institution: '',
    teachingField: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error('הסיסמאות אינן תואמות');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    setIsLoading(true);

    try {
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();

      const result = await signUpUser({
        email: formData.email,
        password: formData.password,
        fullName: fullName || formData.username,
        role: 'teacher',
        schoolName: formData.institution || 'בית ספר ברירת מחדל',
        phone: formData.phone || undefined,
      });

      if (result.success) {
        if (result.needsEmailConfirmation) {
          toast.success('הרישום הושלם! אנא אשר את כתובת האימייל שלך ואז התחבר.');
          router.push('/auth/login');
        } else {
          toast.success('הרישום הושלם בהצלחה!');
          router.push('/dashboard');
        }
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
              <Link href="/teacher-register">
                הרשמה
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div className="order-2 lg:order-1">
              <Card className="border border-slate-200 shadow-sm">
                <CardContent className="p-8">
                  <h1 className="text-2xl font-bold text-slate-900 text-center mb-8">
                    טופס רישום מורה
                  </h1>

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="lastName" className="text-sm font-medium text-slate-700 text-right block">
                          שם משפחה
                        </Label>
                        <Input
                          id="lastName"
                          type="text"
                          placeholder="מורהי"
                          value={formData.lastName}
                          onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                          className="text-right"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="firstName" className="text-sm font-medium text-slate-700 text-right block">
                          שם פרטי
                        </Label>
                        <Input
                          id="firstName"
                          type="text"
                          placeholder="רחל"
                          value={formData.firstName}
                          onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                          className="text-right"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium text-slate-700 text-right block">
                        דוא״ל
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="rachel@school.ac.il"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="text-left"
                        dir="ltr"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-sm font-medium text-slate-700 text-right block">
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
                      <Label htmlFor="username" className="text-sm font-medium text-slate-700 text-right block">
                        שם משתמש
                      </Label>
                      <Input
                        id="username"
                        type="text"
                        placeholder="rachel_teacher"
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        className="text-left"
                        dir="ltr"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700 text-right block">
                          אימות סיסמה
                        </Label>
                        <Input
                          id="confirmPassword"
                          type="password"
                          placeholder="********"
                          value={formData.confirmPassword}
                          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password" className="text-sm font-medium text-slate-700 text-right block">
                          סיסמה
                        </Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="********"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="institution" className="text-sm font-medium text-slate-700 text-right block">
                        בית ספר / מוסד (אופציונלי)
                      </Label>
                      <Input
                        id="institution"
                        type="text"
                        placeholder="בית ספר תיכון הרצליה"
                        value={formData.institution}
                        onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                        className="text-right"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="teachingField" className="text-sm font-medium text-slate-700 text-right block">
                        תחום הוראה
                      </Label>
                      <Select onValueChange={(value) => setFormData({ ...formData, teachingField: value })}>
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="בחרו תחום" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="math">מתמטיקה</SelectItem>
                          <SelectItem value="science">מדעים</SelectItem>
                          <SelectItem value="languages">שפות</SelectItem>
                          <SelectItem value="history">היסטוריה</SelectItem>
                          <SelectItem value="other">אחר</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-teal-600 hover:bg-teal-700 text-white h-12 text-base rounded-md disabled:opacity-50"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                          נרשם...
                        </>
                      ) : (
                        'יצירת חשבון מורה'
                      )}
                    </Button>

                    <div className="text-center">
                      <Link href="/auth/login" className="text-sm text-cyan-600 hover:text-cyan-700">
                        כבר רשומים? התחברו כאן
                      </Link>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>

            <div className="order-1 lg:order-2 lg:sticky lg:top-24">
              <div className="text-center mb-8">
                <div className="w-20 h-20 mx-auto mb-6 bg-teal-500 rounded-2xl flex items-center justify-center">
                  <GraduationCap className="h-10 w-10 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-slate-900 mb-4">
                  הצטרפו כמורה
                </h2>
                <p className="text-base text-slate-600 leading-relaxed max-w-md mx-auto">
                  הירשמו עכשיו וקבלו גישה מלאה לכלל הכלים ליצירת חוויות למידה מעולות
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-teal-50 rounded-lg border border-teal-100">
                  <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <BookOpen className="h-5 w-5 text-teal-600" />
                  </div>
                  <div className="text-right flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      יצירת קורסים אינטראקטיביים ללא הגבלה
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-sky-50 rounded-lg border border-sky-100">
                  <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users className="h-5 w-5 text-sky-600" />
                  </div>
                  <div className="text-right flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      ניהול כיתות ותלמידים ממקום אחד
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-violet-50 rounded-lg border border-violet-100">
                  <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="h-5 w-5 text-violet-600" />
                  </div>
                  <div className="text-right flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      דוחות וסטטיסטיקות מפורטות
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Globe className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="text-right flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      תת-דומיין אישי לבית הספר שלכם
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-gray-200 py-10 mt-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end mb-4">
                <span className="text-lg font-bold text-slate-900">SlidesUp Learning</span>
                <div className="w-8 h-8 bg-cyan-400 rounded flex items-center justify-center">
                  <Download className="h-4 w-4 text-white" />
                </div>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                הפלטפורמה המתקדמת להמרת מצגות לקורסים אינטראקטיביים עם תערבת ניהול למידה מלאה.
              </p>
            </div>

            <div className="text-right">
              <h3 className="font-semibold text-slate-900 mb-3">קישורים מהירים</h3>
              <ul className="space-y-2">
                <li>
                  <Link href="#" className="text-sm text-slate-600 hover:text-slate-900">
                    יצירת קורס
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-slate-600 hover:text-slate-900">
                    מדריך תבניות
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-slate-600 hover:text-slate-900">
                    כתיבת עיצונים
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-slate-600 hover:text-slate-900">
                    צור קשר
                  </Link>
                </li>
              </ul>
            </div>

            <div className="text-right">
              <h3 className="font-semibold text-slate-900 mb-3">למשתמשים</h3>
              <ul className="space-y-2">
                <li>
                  <Link href="#" className="text-sm text-slate-600 hover:text-slate-900">
                    רישוי מורה
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-slate-600 hover:text-slate-900">
                    רישוי תלמיד
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-sm text-slate-600 hover:text-slate-900">
                    אודות תלמיד
                  </Link>
                </li>
              </ul>
            </div>

            <div className="text-right">
              <h3 className="font-semibold text-slate-900 mb-3">צור קשר</h3>
              <ul className="space-y-3">
                <li className="flex items-center gap-2 justify-end">
                  <span className="text-sm text-slate-600">info@slidesup.learn</span>
                  <Mail className="h-4 w-4 text-slate-400" />
                </li>
                <li className="flex items-center gap-2 justify-end">
                  <span className="text-sm text-slate-600">+972-3-1234567</span>
                  <Phone className="h-4 w-4 text-slate-400" />
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-200 mt-8 pt-6 text-center">
            <p className="text-sm text-slate-500">
              © SlidesUp Learning 2026. כל הזכויות שמורות
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
