'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';

interface AuthFormProps {
  mode: 'login' | 'signup';
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;

        if (authData.user) {
          const { data: schoolData, error: schoolError } = await (supabase
            .from('schools') as any)
            .insert({
              name: schoolName,
              owner_id: authData.user.id,
            })
            .select()
            .single();

          if (schoolError) throw schoolError;

          const { error: profileError } = await (supabase
            .from('profiles') as any)
            .insert({
              id: authData.user.id,
              full_name: fullName,
              role: 'teacher',
              school_id: schoolData.id,
            });

          if (profileError) throw profileError;
        }

        router.push('/dashboard');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'אירעה שגיאה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{mode === 'login' ? 'התחברות' : 'הרשמה'}</CardTitle>
        <CardDescription>
          {mode === 'login'
            ? 'הזן את פרטי ההתחברות שלך'
            : 'צור חשבון חדש כדי להתחיל ליצור קורסים'}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {mode === 'signup' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="fullName">שם מלא</Label>
                <Input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="schoolName">שם בית הספר/מוסד</Label>
                <Input
                  id="schoolName"
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">אימייל</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">סיסמה</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            {mode === 'login' ? 'התחבר' : 'הירשם'}
          </Button>

          <p className="text-sm text-center text-muted-foreground">
            {mode === 'login' ? (
              <>
                אין לך חשבון?{' '}
                <a href="/auth/signup" className="text-primary hover:underline">
                  הירשם כאן
                </a>
              </>
            ) : (
              <>
                יש לך כבר חשבון?{' '}
                <a href="/auth/login" className="text-primary hover:underline">
                  התחבר כאן
                </a>
              </>
            )}
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
