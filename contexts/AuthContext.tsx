'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string, email?: string): Promise<Profile | null> => {
    console.log('[Auth] Fetching profile for user:', userId);
    const { data, error } = await (supabase
      .from('profiles') as any)
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[Auth] Error fetching profile:', error);
      return null;
    }

    if (data) {
      console.log('[Auth] Profile found:', data.full_name);
      return data as Profile;
    }

    console.log('[Auth] No profile found, attempting to create one...');
    const displayName = email ? email.split('@')[0] : 'User';

    const { data: newSchool, error: schoolErr } = await (supabase
      .from('schools') as any)
      .insert({ name: `${displayName}'s School`, owner_id: userId })
      .select('id')
      .maybeSingle();

    if (schoolErr || !newSchool) {
      console.error('[Auth] Failed to create school:', schoolErr);
      return null;
    }

    const { data: newProfile, error: profileErr } = await (supabase
      .from('profiles') as any)
      .insert({ id: userId, full_name: displayName, school_id: newSchool.id, role: 'teacher' })
      .select('*')
      .maybeSingle();

    if (profileErr) {
      console.error('[Auth] Failed to create profile:', profileErr);
      return null;
    }

    console.log('[Auth] Profile created successfully:', newProfile?.full_name);
    return newProfile;
  };

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id, user.email);
      setProfile(profileData);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      (async () => {
        setUser(session?.user ?? null);
        if (session?.user) {
          const profileData = await fetchProfile(session.user.id, session.user.email);
          setProfile(profileData);
        }
        setLoading(false);
      })();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setUser(session?.user ?? null);
        if (session?.user) {
          const profileData = await fetchProfile(session.user.id, session.user.email);
          setProfile(profileData);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
