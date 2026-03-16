import { supabase } from './supabase';

export type UserRole = 'teacher' | 'student' | 'admin';

export interface SignUpData {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  schoolName?: string;
  courseCode?: string;
  phone?: string;
  bio?: string;
}

export interface AuthResponse {
  success: boolean;
  error?: string;
  userId?: string;
  needsEmailConfirmation?: boolean;
}

export async function signUpUser(data: SignUpData): Promise<AuthResponse> {
  try {
    const { email, password, fullName, role, schoolName, courseCode, phone, bio } = data;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: role,
        },
      },
    });

    if (authError) {
      if (authError.status === 422 || authError.message?.toLowerCase().includes('already registered')) {
        return { success: false, error: 'כתובת האימייל כבר רשומה במערכת. נסה להתחבר.' };
      }
      return { success: false, error: authError.message };
    }

    if (!authData.user) {
      return { success: false, error: 'שגיאה ביצירת המשתמש' };
    }

    const userId = authData.user.id;

    if (!authData.session) {
      return { success: true, userId, needsEmailConfirmation: true };
    }

    await updateProfileAfterSignup({ userId, role, fullName, email, phone, bio, schoolName, courseCode });

    return { success: true, userId };
  } catch (error: any) {
    console.error('Signup error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred' };
  }
}

async function updateProfileAfterSignup({
  userId, role, fullName, email, phone, bio, schoolName, courseCode,
}: {
  userId: string;
  role: UserRole;
  fullName: string;
  email: string;
  phone?: string;
  bio?: string;
  schoolName?: string;
  courseCode?: string;
}) {
  let schoolId: string | null = null;

  if (role === 'teacher' && schoolName) {
    const { data: schoolData } = await (supabase as any)
      .from('schools')
      .insert([{ name: schoolName, owner_id: userId }])
      .select()
      .maybeSingle();
    schoolId = schoolData?.id || null;
  } else if (role === 'student' && courseCode) {
    const { data: shareData } = await (supabase as any)
      .from('shares')
      .select('course_id, courses(school_id)')
      .eq('share_token', courseCode)
      .maybeSingle();
    if (shareData) {
      schoolId = (shareData as any)?.courses?.school_id || null;
    }
  }

  await (supabase as any).from('profiles').upsert([{
    id: userId,
    role,
    full_name: fullName,
    email,
    phone: phone || null,
    bio: bio || null,
    school_id: schoolId,
    is_active: true,
    last_login_at: new Date().toISOString(),
  }]);
}

export async function signInUser(email: string, password: string): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message?.toLowerCase().includes('email not confirmed')) {
        return { success: false, error: 'יש לאשר את כתובת האימייל לפני ההתחברות. בדוק את תיבת הדואר שלך.' };
      }
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: 'Login failed' };
    }

    await (supabase as any).from('profiles').update({
      last_login_at: new Date().toISOString(),
    }).eq('id', data.user.id);

    return { success: true, userId: data.user.id };
  } catch (error: any) {
    console.error('Sign in error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred' };
  }
}

export async function signOutUser(): Promise<AuthResponse> {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Sign out error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred' };
  }
}

export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      console.error('Get user error:', error);
      return null;
    }

    return user;
  } catch (error) {
    console.error('Get user error:', error);
    return null;
  }
}

export async function getUserProfile(userId: string) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, schools(*)')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Get profile error:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Get profile error:', error);
    return null;
  }
}
