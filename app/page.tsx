import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Upload, Brain, Users, CheckCircle, Zap } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3 space-x-reverse">
              <BookOpen className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-slate-900">Slide2Course</h1>
            </div>
            <div className="flex space-x-3 space-x-reverse">
              <Button variant="ghost" asChild>
                <Link href="/auth/login">התחברות</Link>
              </Button>
              <Button asChild>
                <Link href="/auth/signup">הרשמה חינם</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto text-center">
            <h2 className="text-5xl font-bold text-slate-900 mb-6">
              המר מצגות לקורסים אינטראקטיביים
            </h2>
            <p className="text-xl text-slate-600 mb-8 max-w-3xl mx-auto">
              העלה קבצי PowerPoint, PDF ומסמכים נוספים והפוך אותם לקורסים דיגיטליים מרהיבים עם
              שאלות אינטראקטיביות, ניווט חכם וחוויית למידה מושלמת
            </p>
            <div className="flex justify-center space-x-4 space-x-reverse">
              <Button size="lg" asChild>
                <Link href="/auth/signup">
                  התחל עכשיו
                  <Upload className="mr-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/auth/login">התחבר</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
          <div className="max-w-7xl mx-auto">
            <h3 className="text-3xl font-bold text-center text-slate-900 mb-12">איך זה עובד?</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card>
                <CardHeader>
                  <div className="flex justify-center mb-4">
                    <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <Upload className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                  <CardTitle className="text-center">1. העלה קבצים</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-center">
                    העלה מצגות PPTX, PDF, DOCX, תמונות, וידאו ועוד. המערכת תומכת בפורמטים רבים.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex justify-center mb-4">
                    <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                      <Brain className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                  <CardTitle className="text-center">2. עיבוד חכם</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-center">
                    המערכת מזהה אוטומטית פרקים (שקופיות צהובות), שאלות ומבנה תוכן באמצעות AI.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex justify-center mb-4">
                    <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                      <Users className="h-6 w-6 text-purple-600" />
                    </div>
                  </div>
                  <CardTitle className="text-center">3. שתף ולמד</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-center">
                    שתף קישור עם תלמידים והם יוכלו ללמוד אינטראקטיבית עם שאלות ומעקב התקדמות.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <h3 className="text-3xl font-bold text-center text-slate-900 mb-12">יכולות מרכזיות</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  title: 'המרת PPTX חכמה',
                  description:
                    'המרה אוטומטית של מצגות לתוכן web קריא עם שמירה על עיצוב, תמונות וטבלאות',
                },
                {
                  title: 'זיהוי שאלות אוטומטי',
                  description: 'AI מזהה שאלות במצגת ומציע תשובות נכונות שניתן לערוך ולאשר',
                },
                {
                  title: 'ניווט בפרקים',
                  description: 'צבע שקופית בצהוב ליצירת פרק חדש עם ניווט טאבים נוח',
                },
                {
                  title: 'שאלות אינטראקטיביות',
                  description: 'בחירה יחידה, רב-ברירה ונכון/לא נכון עם פידבק מיידי',
                },
                {
                  title: 'מעקב התקדמות',
                  description: 'מעקב אחר ניסיונות תלמידים, תשובות וציונים',
                },
                {
                  title: 'תמיכה בפורמטים רבים',
                  description: 'PPTX, PDF, DOCX, תמונות, וידאו, אודיו ו-ZIP',
                },
              ].map((feature, index) => (
                <Card key={index}>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2 space-x-reverse">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span>{feature.title}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-blue-600 text-white">
          <div className="max-w-4xl mx-auto text-center">
            <Zap className="h-16 w-16 mx-auto mb-6" />
            <h3 className="text-4xl font-bold mb-4">מוכן להתחיל?</h3>
            <p className="text-xl mb-8 text-blue-100">
              הצטרף לעשרות מורים שכבר יצרו מאות קורסים אינטראקטיביים
            </p>
            <Button size="lg" variant="secondary" asChild>
              <Link href="/auth/signup">התחל בחינם עכשיו</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="bg-slate-900 text-slate-300 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p>© 2024 Slide2Course. כל הזכויות שמורות.</p>
        </div>
      </footer>
    </div>
  );
}
