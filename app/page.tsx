import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  Play
} from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-white" dir="rtl">
      <header className="border-b bg-white sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-cyan-400 rounded-lg flex items-center justify-center">
                <Download className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900">SlidesUp Learning</span>
            </div>
            <nav className="hidden md:flex items-center gap-8 text-sm">
              <Link href="#" className="text-slate-700 hover:text-slate-900">דף הבית</Link>
              <Link href="#" className="text-slate-700 hover:text-slate-900">יצירת קורס</Link>
              <Link href="#" className="text-slate-700 hover:text-slate-900">מדריך תבניות</Link>
              <Link href="#" className="text-slate-700 hover:text-slate-900">רישוי מורה</Link>
              <Link href="#" className="text-slate-700 hover:text-slate-900">רישוי תלמיד</Link>
              <Link href="#" className="text-slate-700 hover:text-slate-900">כתיבת עיצונים</Link>
              <Link href="#" className="text-slate-700 hover:text-slate-900">אודות תלמיד</Link>
              <Link href="#" className="text-slate-700 hover:text-slate-900">צור קשר</Link>
              <Link href="#" className="text-slate-700 hover:text-slate-900">EN / HE</Link>
            </nav>
            <Button className="bg-cyan-400 hover:bg-cyan-500 text-white">
              הרשמה
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white to-gray-50">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-50 text-cyan-600 text-sm mb-6">
                <Sparkles className="h-4 w-4" />
                <span>פלטפורמה חינוכית מבוססת AI</span>
              </div>
              <h1 className="text-6xl font-bold text-slate-900 mb-6 leading-tight">
                הפכו את המצגות שלכם
                <br />
                <span className="text-cyan-400">לקורסים אינטראקטיביים</span>
              </h1>
              <p className="text-xl text-slate-600 max-w-3xl mx-auto mb-10">
                העלו מצגת ‎PowerPoint‎, ‎OneDrive‎ או ‎Canva‎ והפכו אותה לקורס זוב עם
                <br />
                שאלות אינטראקטיביות, סנכרון חי של שעונים וחיווי בניה מלאכותית
              </p>
              <div className="flex justify-center gap-4">
                <Button size="lg" className="bg-cyan-400 hover:bg-cyan-500 text-white px-8 h-12">
                  <span>יצירת קורס חינם</span>
                  <ArrowRight className="mr-2 h-5 w-5" />
                </Button>
                <Button size="lg" variant="outline" className="h-12 px-8">
                  <Play className="ml-2 h-5 w-5" />
                  <span>איך זה עובד?</span>
                </Button>
              </div>
              <div className="flex justify-center gap-12 mt-12 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                  </div>
                  <span>ניקוד אוטומטי לכל שאלה</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-purple-600" />
                  </div>
                  <span>חיווי בניה מלאכותית לשאלות פתוחות</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-pink-100 rounded-full flex items-center justify-center">
                    <ShieldCheck className="h-4 w-4 text-pink-600" />
                  </div>
                  <span>סנכרון חי של שעונים</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-5xl font-bold text-slate-900 mb-4">
                יכולות הפלטפורמה
              </h2>
              <p className="text-xl text-slate-600">
                כל מה שצריך לעזהול למידה דיגיטלית אפקטיבית
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="border-gray-200 hover:shadow-lg transition-shadow">
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 mx-auto mb-4 bg-cyan-100 rounded-2xl flex items-center justify-center">
                    <MessageSquare className="h-8 w-8 text-cyan-600" />
                  </div>
                  <CardTitle className="text-lg">משוב חיזרי ללמידה</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 text-center">
                    כל תלמיד מקבל משוב מיקוד מותאם על כל שאלה חיזרי אחרי הגשה, כולל הסברים והעמקות.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-gray-200 hover:shadow-lg transition-shadow">
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-2xl flex items-center justify-center">
                    <Layers className="h-8 w-8 text-blue-600" />
                  </div>
                  <CardTitle className="text-lg">הפרה של 6 סוגי שאלות לפי תבניות</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 text-center">
                    בחירה יחידה, בחירה מרובה, נכון/לא נכון, שאלות פתוחות, השלמת משפטות - הכל לפי תבניות פשוטות בתוצאה.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-gray-200 hover:shadow-lg transition-shadow">
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 rounded-2xl flex items-center justify-center">
                    <RotateCcw className="h-8 w-8 text-purple-600" />
                  </div>
                  <CardTitle className="text-lg">סנכרון חי של שעונים</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 text-center">
                    עדכנו את התצאות המקורית והשינויים יעדכנו אוטומטית בקורס - בלי צורך ליאור מחדש.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-gray-200 hover:shadow-lg transition-shadow">
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 mx-auto mb-4 bg-pink-100 rounded-2xl flex items-center justify-center">
                    <Sparkles className="h-8 w-8 text-pink-600" />
                  </div>
                  <CardTitle className="text-lg">גלילה וביצת</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 text-center">
                    כל השקופיות תחת שקופית עבודה מתחלקות אחד שתהלמיד עולל זה בצורה טבעונית.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-gray-200 hover:shadow-lg transition-shadow">
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 mx-auto mb-4 bg-teal-100 rounded-2xl flex items-center justify-center">
                    <Download className="h-8 w-8 text-teal-600" />
                  </div>
                  <CardTitle className="text-lg">סגל ניווח</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 text-center">
                    נבנה אוטומטית מכתבורות שקופיות תוכן, מאפשר ניווח מהיר בין יחידות תוכן.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-gray-200 hover:shadow-lg transition-shadow">
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-2xl flex items-center justify-center">
                    <Globe className="h-8 w-8 text-orange-600" />
                  </div>
                  <CardTitle className="text-lg">תמיכה מלאה בעברית</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 text-center">
                    המעכתת, הקורסים והשאלותים מותכים בעברית מלאה כולל ניווט מסט RTL אוטומטי.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-gray-200 hover:shadow-lg transition-shadow">
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-2xl flex items-center justify-center">
                    <Smartphone className="h-8 w-8 text-green-600" />
                  </div>
                  <CardTitle className="text-lg">התאמה לנייד</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 text-center">
                    הקורסים מותאמים לכל מכשיר - חשגום, טאבלט ונייד עם עיצוב ריספונסיבי מלא.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-gray-200 hover:shadow-lg transition-shadow">
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 mx-auto mb-4 bg-indigo-100 rounded-2xl flex items-center justify-center">
                    <BookmarkCheck className="h-8 w-8 text-indigo-600" />
                  </div>
                  <CardTitle className="text-lg">שליחת התקדמות</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 text-center">
                    התקדמות תלמיד נשמרת אוטומטית עם אם לא סיים את הקורס, וניתן להמשיך מאותה נקודה.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-gray-200 hover:shadow-lg transition-shadow">
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 mx-auto mb-4 bg-rose-100 rounded-2xl flex items-center justify-center">
                    <ShieldCheck className="h-8 w-8 text-rose-600" />
                  </div>
                  <CardTitle className="text-lg">ניקוד אוטומטי</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 text-center">
                    כל השאלות מקבלות ציון אוטומטי בלי שתצכרכו להגדיר את המערכת פחדה את התשובות מהאבניית.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-50 to-white">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-5xl font-bold text-slate-900 mb-4">
                איך זה עובד?
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
              <Card className="border-gray-200 relative">
                <div className="absolute -top-4 -right-4 w-12 h-12 bg-pink-500 text-white rounded-xl flex items-center justify-center font-bold text-lg">
                  01
                </div>
                <CardHeader className="text-center pb-4 pt-8">
                  <div className="w-16 h-16 mx-auto mb-4 bg-pink-100 rounded-2xl flex items-center justify-center">
                    <Upload className="h-8 w-8 text-pink-600" />
                  </div>
                  <CardTitle className="text-lg">העלו מצגת</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 text-center">
                    העלו קובץ ‎PowerPoint‎, הביכו קישור מ-‎OneDrive‎ או ‎Canva‎. המערכת פותחת את התבנה אוטומטית.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-gray-200 relative">
                <div className="absolute -top-4 -right-4 w-12 h-12 bg-amber-500 text-white rounded-xl flex items-center justify-center font-bold text-lg">
                  02
                </div>
                <CardHeader className="text-center pb-4 pt-8">
                  <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 rounded-2xl flex items-center justify-center">
                    <Edit3 className="h-8 w-8 text-amber-600" />
                  </div>
                  <CardTitle className="text-lg">סמנו כותרות ושאלות</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 text-center">
                    רשומו בין השקופיות של היחידה וצבעו את הרקע שלה בצהוב. הכתיסו בין השקופיות שאלות לפי תבניות פסיגטות לפי התבניה שבארנו.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-gray-200 relative">
                <div className="absolute -top-4 -right-4 w-12 h-12 bg-purple-500 text-white rounded-xl flex items-center justify-center font-bold text-lg">
                  03
                </div>
                <CardHeader className="text-center pb-4 pt-8">
                  <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 rounded-2xl flex items-center justify-center">
                    <Sparkles className="h-8 w-8 text-purple-600" />
                  </div>
                  <CardTitle className="text-lg">המרה חכמה לקורס זובי</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 text-center">
                    כל מספר שקופיות יאוגדו לעמוד אחד עם גלילה, ושקופיות השער והצוגה תהפוכו לניווט בלשונית תיגוונית.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-gray-200 relative">
                <div className="absolute -top-4 -right-4 w-12 h-12 bg-orange-500 text-white rounded-xl flex items-center justify-center font-bold text-lg">
                  04
                </div>
                <CardHeader className="text-center pb-4 pt-8">
                  <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-2xl flex items-center justify-center">
                    <Edit3 className="h-8 w-8 text-orange-600" />
                  </div>
                  <CardTitle className="text-lg">המדה של תמונות, סרטונים ושאלות</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 text-center">
                    המערכת מזהיר גם ממונות ושקופיות וגם עוזרות פתח השירהפני להוסיפו.
                  </p>
                </CardContent>
              </Card>

              <Card className="border-gray-200 relative">
                <div className="absolute -top-4 -right-4 w-12 h-12 bg-teal-500 text-white rounded-xl flex items-center justify-center font-bold text-lg">
                  05
                </div>
                <CardHeader className="text-center pb-4 pt-8">
                  <div className="w-16 h-16 mx-auto mb-4 bg-teal-100 rounded-2xl flex items-center justify-center">
                    <Share2 className="h-8 w-8 text-teal-600" />
                  </div>
                  <CardTitle className="text-lg">שתפו והתחילו ללמד</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 text-center">
                    קבלו קישור יחודי לקורס, שתפו עם התלמידים ועקבו אחרי התקדמות בזמן אמת.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-4xl mx-auto">
            <Card className="border-2 border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50">
              <CardContent className="p-12 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-cyan-600 text-sm mb-6">
                  <Sparkles className="h-4 w-4" />
                  <span>התחילו בחינם עוד היום</span>
                </div>
                <h2 className="text-4xl font-bold text-slate-900 mb-4">
                  מוכנים להפוך את המצגות שלכם לקורסים?
                </h2>
                <p className="text-xl text-slate-600 mb-8">
                  העלו מצגת, הגדירו שאלות, ותנו לתלמידים ללמוד בקצב שלהם - הכל בלי עלות
                </p>
                <div className="flex justify-center gap-4">
                  <Button size="lg" className="bg-cyan-400 hover:bg-cyan-500 text-white px-8 h-12">
                    <span>הרשמה כמורה</span>
                    <ArrowRight className="mr-2 h-5 w-5" />
                  </Button>
                  <Button size="lg" variant="outline" className="h-12 px-8">
                    <span>יצירת קורס ראשון</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="bg-gray-50 border-t border-gray-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-cyan-400 rounded-lg flex items-center justify-center">
                  <Download className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold text-slate-900">SlidesUp Learning</span>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                הפלטפורמה המתקדמת להמרת מצגות לקורסים אינטראקטיביים עם תרבות וניהול למידה מלאה.
              </p>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 mb-4">קישורים מהירים</h3>
              <ul className="space-y-2 text-sm text-slate-600">
                <li><Link href="#" className="hover:text-cyan-500">יצירת קורס</Link></li>
                <li><Link href="#" className="hover:text-cyan-500">כתיבת עיצונים</Link></li>
                <li><Link href="#" className="hover:text-cyan-500">מדריך תבניות</Link></li>
                <li><Link href="#" className="hover:text-cyan-500">צור קשר</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 mb-4">למשתמשים</h3>
              <ul className="space-y-2 text-sm text-slate-600">
                <li><Link href="#" className="hover:text-cyan-500">רישוי מורה</Link></li>
                <li><Link href="#" className="hover:text-cyan-500">רישוי תלמיד</Link></li>
                <li><Link href="#" className="hover:text-cyan-500">אודות תלמיד</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 mb-4">צור קשר</h3>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <span>info@slidesup.learn</span>
                </li>
                <li className="flex items-center gap-2">
                  <span>+972-3-1234567</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200 text-center text-sm text-slate-500">
            <p>© 2024 SlidesUp Learning. כל הזכויות שמורות.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
