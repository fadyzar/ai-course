import { AuthForm } from '@/components/auth/AuthForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-900">Slide2Course</h1>
          <p className="mt-2 text-slate-600">המר מצגות לקורסים אינטראקטיביים</p>
        </div>
        <AuthForm mode="login" />
      </div>
    </div>
  );
}
