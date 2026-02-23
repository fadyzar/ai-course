'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MessageSquare,
  Layers,
  RotateCcw,
  Sparkles,
  Smartphone,
  BookmarkCheck,
  Globe,
  ShieldCheck,
  Upload,
  Edit3,
  Share2,
  Download,
  ArrowRight,
  Play,
  ArrowLeft
} from 'lucide-react';

export default function Home() {
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
              <Link href="#" className="text-slate-600 hover:text-slate-900">דף הבית</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">יצירת קורס</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">מדריך תבניות</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">רישוי מורה</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">רישוי תלמיד</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">כתיבת עיצונים</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">אודות תלמיד</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">צור קשר</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">EN / HE</Link>
              <Link href="#" className="text-slate-600 hover:text-slate-900">התחברות</Link>
            </nav>

            <Button className="bg-cyan-400 hover:bg-cyan-500 text-white rounded-md px-6">
              הרשמה
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="py-20 px-6">
          <div className="max-w-6xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-50 text-cyan-600 text-sm mb-6 border border-cyan-100">
              <Sparkles className="h-4 w-4" />
              <span>פלטפורמה חינוכית מבוססת AI</span>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
              הפכו את המצגות שלכם
              <br />
              <span className="text-cyan-400">לקורסים אינטראקטיביים</span>
            </h1>

            <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed">
              העלו מצגת ‎PowerPoint‎, ‎OneDrive‎ או ‎Canva‎ והפכו אותה לקורס זוב עם
              <br />
              שאלות אינטראקטיביות, סנכרון חי של שעונים וחיווי בניה מלאכותית
            </p>

            <div className="flex justify-center gap-4 mb-12">
              <Button size="lg" className="bg-cyan-400 hover:bg-cyan-500 text-white h-11 px-6 rounded-md">
                יצירת קורס חינם
                <ArrowLeft className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="h-11 px-6 rounded-md border-slate-300">
                <Play className="mr-2 h-4 w-4" />
                איך זה עובד?
              </Button>
            </div>

            <div className="flex flex-wrap justify-center gap-8 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center">
                  <ShieldCheck className="h-3 w-3 text-red-500" />
                </div>
                <span>ניקוד אוטומטי לכל שאלה</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-purple-100 rounded-full flex items-center justify-center">
                  <MessageSquare className="h-3 w-3 text-purple-500" />
                </div>
                <span>חיווי בניה מלאכותית לשאלות פתוחות</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center">
                  <RotateCcw className="h-3 w-3 text-blue-500" />
                </div>
                <span>סנכרון חי של שעונים</span>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 px-6 bg-gray-50">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-slate-900 mb-3">
                יכולות הפלטפורמה
              </h2>
              <p className="text-lg text-slate-600">
                כל מה שצריך לעזהול למידה דיגיטלית אפקטיבית
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              <Card className="bg-white border border-slate-200 hover:shadow-md transition-shadow">
                <CardHeader className="text-center pb-3 pt-6">
                  <div className="w-14 h-14 mx-auto mb-3 bg-cyan-50 rounded-xl flex items-center justify-center">
                    <MessageSquare className="h-7 w-7 text-cyan-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">משוב חיזרי ללמידה</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    כל תלמיד מקבל משוב מיקוד מותאם על כל שאלה חיזרי אחרי הגשה, כולל הסברים והעמקות.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 hover:shadow-md transition-shadow">
                <CardHeader className="text-center pb-3 pt-6">
                  <div className="w-14 h-14 mx-auto mb-3 bg-blue-50 rounded-xl flex items-center justify-center">
                    <Layers className="h-7 w-7 text-blue-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">הפרה של 6 סוגי שאלות לפי תבניות</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    בחירה יחידה, בחירה מרובה, נכון/לא נכון, שאלות פתוחות, השלמת משפטות - הכל לפי תבניות פשוטות בתוצאה.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 hover:shadow-md transition-shadow">
                <CardHeader className="text-center pb-3 pt-6">
                  <div className="w-14 h-14 mx-auto mb-3 bg-purple-50 rounded-xl flex items-center justify-center">
                    <RotateCcw className="h-7 w-7 text-purple-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">סנכרון חי של שעונים</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    עדכנו את התצאות המקורית והשינויים יעדכנו אוטומטית בקורס - בלי צורך ליאור מחדש.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 hover:shadow-md transition-shadow">
                <CardHeader className="text-center pb-3 pt-6">
                  <div className="w-14 h-14 mx-auto mb-3 bg-pink-50 rounded-xl flex items-center justify-center">
                    <Sparkles className="h-7 w-7 text-pink-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">גלילה וביצת</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    כל השקופיות תחת שקופית עבודה מתחלקות אחד שתהלמיד עולל זה בצורה טבעונית.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 hover:shadow-md transition-shadow">
                <CardHeader className="text-center pb-3 pt-6">
                  <div className="w-14 h-14 mx-auto mb-3 bg-teal-50 rounded-xl flex items-center justify-center">
                    <Download className="h-7 w-7 text-teal-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">סגל ניווח</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    נבנה אוטומטית מכתבורות שקופיות תוכן, מאפשר ניווח מהיר בין יחידות תוכן.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 hover:shadow-md transition-shadow">
                <CardHeader className="text-center pb-3 pt-6">
                  <div className="w-14 h-14 mx-auto mb-3 bg-orange-50 rounded-xl flex items-center justify-center">
                    <Globe className="h-7 w-7 text-orange-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">תמיכה מלאה בעברית</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    המעכתת, הקורסים והשאלותים מותכים בעברית מלאה כולל ניווט מסט RTL אוטומטי.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 hover:shadow-md transition-shadow">
                <CardHeader className="text-center pb-3 pt-6">
                  <div className="w-14 h-14 mx-auto mb-3 bg-green-50 rounded-xl flex items-center justify-center">
                    <Smartphone className="h-7 w-7 text-green-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">התאמה לנייד</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    הקורסים מותאמים לכל מכשיר - חשגום, טאבלט ונייד עם עיצוב ריספונסיבי מלא.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 hover:shadow-md transition-shadow">
                <CardHeader className="text-center pb-3 pt-6">
                  <div className="w-14 h-14 mx-auto mb-3 bg-indigo-50 rounded-xl flex items-center justify-center">
                    <BookmarkCheck className="h-7 w-7 text-indigo-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">שליחת התקדמות</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    התקדמות תלמיד נשמרת אוטומטית עם אם לא סיים את הקורס, וניתן להמשיך מאותה נקודה.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 hover:shadow-md transition-shadow">
                <CardHeader className="text-center pb-3 pt-6">
                  <div className="w-14 h-14 mx-auto mb-3 bg-rose-50 rounded-xl flex items-center justify-center">
                    <ShieldCheck className="h-7 w-7 text-rose-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">ניקוד אוטומטי</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    כל השאלות מקבלות ציון אוטומטי בלי שתצכרכו להגדיר את המערכת פחדה את התשובות מהאבניית.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-16 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-slate-900">
                איך זה עובד?
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
              <Card className="bg-white border border-slate-200 relative overflow-visible">
                <div className="absolute -top-3 -right-3 w-10 h-10 bg-pink-500 text-white rounded-lg flex items-center justify-center font-bold text-sm shadow-md">
                  01
                </div>
                <CardHeader className="text-center pb-3 pt-8">
                  <div className="w-14 h-14 mx-auto mb-3 bg-pink-50 rounded-xl flex items-center justify-center">
                    <Upload className="h-7 w-7 text-pink-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">העלו מצגת</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    העלו קובץ ‎PowerPoint‎, הביכו קישור מ-‎OneDrive‎ או ‎Canva‎. המערכת פותחת את התבנה אוטומטית.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 relative overflow-visible">
                <div className="absolute -top-3 -right-3 w-10 h-10 bg-amber-500 text-white rounded-lg flex items-center justify-center font-bold text-sm shadow-md">
                  02
                </div>
                <CardHeader className="text-center pb-3 pt-8">
                  <div className="w-14 h-14 mx-auto mb-3 bg-amber-50 rounded-xl flex items-center justify-center">
                    <Edit3 className="h-7 w-7 text-amber-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">סמנו כותרות ושאלות</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    רשומו בין השקופיות של היחידה וצבעו את הרקע שלה בצהוב. הכתיסו בין השקופיות שאלות לפי תבניות פסיגטות לפי התבניה שבארנו.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 relative overflow-visible">
                <div className="absolute -top-3 -right-3 w-10 h-10 bg-purple-500 text-white rounded-lg flex items-center justify-center font-bold text-sm shadow-md">
                  03
                </div>
                <CardHeader className="text-center pb-3 pt-8">
                  <div className="w-14 h-14 mx-auto mb-3 bg-purple-50 rounded-xl flex items-center justify-center">
                    <Sparkles className="h-7 w-7 text-purple-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">המרה חכמה לקורס זובי</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    כל מספר שקופיות יאוגדו לעמוד אחד עם גלילה, ושקופיות השער והצוגה תהפוכו לניווט בלשונית תיגוונית.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 relative overflow-visible">
                <div className="absolute -top-3 -right-3 w-10 h-10 bg-orange-500 text-white rounded-lg flex items-center justify-center font-bold text-sm shadow-md">
                  04
                </div>
                <CardHeader className="text-center pb-3 pt-8">
                  <div className="w-14 h-14 mx-auto mb-3 bg-orange-50 rounded-xl flex items-center justify-center">
                    <Edit3 className="h-7 w-7 text-orange-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">המדה של תמונות, סרטונים ושאלות</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    המערכת מזהיר גם ממונות ושקופיות וגם עוזרות פתח השירהפני להוסיפו.
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white border border-slate-200 relative overflow-visible">
                <div className="absolute -top-3 -right-3 w-10 h-10 bg-teal-500 text-white rounded-lg flex items-center justify-center font-bold text-sm shadow-md">
                  05
                </div>
                <CardHeader className="text-center pb-3 pt-8">
                  <div className="w-14 h-14 mx-auto mb-3 bg-teal-50 rounded-xl flex items-center justify-center">
                    <Share2 className="h-7 w-7 text-teal-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">שתפו והתחילו ללמד</CardTitle>
                </CardHeader>
                <CardContent className="pb-6">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    קבלו קישור יחודי לקורס, שתפו עם התלמידים ועקבו אחרי התקדמות בזמן אמת.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-16 px-6 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <Card className="border border-cyan-200 bg-gradient-to-br from-cyan-50/50 to-blue-50/50 shadow-sm">
              <CardContent className="p-10 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white text-cyan-600 text-xs font-medium mb-5 shadow-sm">
                  <Sparkles className="h-3 w-3" />
                  <span>התחילו בחינם עוד היום</span>
                </div>
                <h2 className="text-3xl font-bold text-slate-900 mb-3">
                  מוכנים להפוך את המצגות שלכם לקורסים?
                </h2>
                <p className="text-base text-slate-600 mb-7 leading-relaxed">
                  העלו מצגת, הגדירו שאלות, ותנו לתלמידים ללמוד בקצב שלהם - הכל בלי עלות
                </p>
                <div className="flex justify-center gap-3">
                  <Button size="lg" className="bg-cyan-400 hover:bg-cyan-500 text-white h-11 px-6 rounded-md">
                    הרשמה כמורה
                    <ArrowLeft className="ml-2 h-4 w-4" />
                  </Button>
                  <Button size="lg" variant="outline" className="h-11 px-6 rounded-md border-slate-300">
                    יצירת קורס ראשון
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-gray-200 py-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg font-bold text-slate-900">SlidesUp Learning</span>
                <div className="w-7 h-7 bg-cyan-400 rounded flex items-center justify-center">
                  <Download className="h-4 w-4 text-white" />
                </div>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                הפלטפורמה המתקדמת להמרת מצגות לקורסים אינטראקטיביים עם תרבות וניהול למידה מלאה.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-3 text-sm">קישורים מהירים</h3>
              <ul className="space-y-2 text-sm text-slate-600">
                <li><Link href="#" className="hover:text-cyan-500 transition-colors">יצירת קורס</Link></li>
                <li><Link href="#" className="hover:text-cyan-500 transition-colors">רישוי מורה</Link></li>
                <li><Link href="#" className="hover:text-cyan-500 transition-colors">כתיבת עיצונים</Link></li>
                <li><Link href="#" className="hover:text-cyan-500 transition-colors">מדריך תבניות</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-3 text-sm">למשתמשים</h3>
              <ul className="space-y-2 text-sm text-slate-600">
                <li><Link href="#" className="hover:text-cyan-500 transition-colors">רישוי תלמיד</Link></li>
                <li><Link href="#" className="hover:text-cyan-500 transition-colors">אודות תלמיד</Link></li>
                <li><Link href="#" className="hover:text-cyan-500 transition-colors">צור קשר</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900 mb-3 text-sm">צור קשר</h3>
              <ul className="space-y-2 text-sm text-slate-600">
                <li>info@slidesup.learn</li>
                <li>+972-3-1234567</li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-gray-200 text-center text-xs text-slate-500">
            <p>© 2024 SlidesUp Learning. כל הזכויות שמורות.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
