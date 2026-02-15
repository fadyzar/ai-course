import './globals.css';
import type { Metadata } from 'next';
import { Heebo } from 'next/font/google';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/sonner';

const heebo = Heebo({ subsets: ['latin', 'hebrew'] });

export const metadata: Metadata = {
  title: 'Slide2Course - המר מצגות לקורסים אינטראקטיביים',
  description: 'פלטפורמה להמרת מצגות PowerPoint, PDF וקבצים נוספים לקורסים אינטראקטיביים עם שאלות ובחנים',
  openGraph: {
    images: [
      {
        url: 'https://bolt.new/static/og_default.png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: [
      {
        url: 'https://bolt.new/static/og_default.png',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className={heebo.className}>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
