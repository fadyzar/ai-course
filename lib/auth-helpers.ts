import { supabase } from './supabase';

export type UserRole = 'teacher' | 'student' | 'admin';

export interface SignUpData {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  schoolName?: string;
  courseCode?: string;
}

export interface AuthResponse {
  success: boolean;
  error?: string;
  userId?: string;
}

export async function signUpUser(data: SignUpData): Promise<AuthResponse> {
  try {
    const { email, password, fullName, role, schoolName, courseCode } = data;

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
      return { success: false, error: authError.message };
    }

    if (!authData.user) {
      return { success: false, error: 'Failed to create user' };
    }

    const userId = authData.user.id;

    let schoolId: string | null = null;

    if (role === 'teacher' && schoolName) {
      const { data: schoolData, error: schoolError } = await (supabase as any)
        .from('schools')
        .insert([{
          name: schoolName,
          owner_id: userId,
        }])
        .select()
        .maybeSingle();

      if (schoolError) {
        console.error('Error creating school:', schoolError);
        return { success: false, error: 'Failed to create school' };
      }

      schoolId = schoolData?.id || null;
    } else if (role === 'student' && courseCode) {
      const { data: shareData, error: shareError } = await (supabase as any)
        .from('shares')
        .select('course_id, courses(school_id)')
        .eq('share_token', courseCode)
        .maybeSingle();

      if (!shareError && shareData) {
        schoolId = (shareData as any)?.courses?.school_id || null;
      }
    }

    const { error: profileError } = await (supabase as any).from('profiles').upsert([{
      id: userId,
      role: role,
      full_name: fullName,
      school_id: schoolId,
    }]);

    if (profileError) {
      console.error('Error creating profile:', profileError);
      return { success: false, error: 'Failed to create user profile' };
    }

    return { success: true, userId };
  } catch (error: any) {
    console.error('Signup error:', error);
    return { success: false, error: error.message || 'An unexpected error occurred' };
  }
}

export async function signInUser(email: string, password: string): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data.user) {
      return { success: false, error: 'Login failed' };
    }

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
