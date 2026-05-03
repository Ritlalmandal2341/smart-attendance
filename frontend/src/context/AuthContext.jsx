import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

// Timeout helper — prevents hanging if Supabase is unreachable
const withTimeout = (promise, ms) => {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), ms)
  );
  return Promise.race([promise, timeout]);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // 1. Initial Session Check
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(), 8000
        );
        if (mountedRef.current && session) {
          await handleSession(session);
        }
      } catch (err) {
        console.error("AuthContext: Initialization error", err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    // 2. Listen for Auth Changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mountedRef.current) return;
      try {
        if (session) {
          await handleSession(session);
        } else {
          handleLogout();
        }
      } catch (err) {
        console.error("AuthContext: Auth state change error", err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    });

    initializeAuth();

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSession = async (session) => {
    if (!mountedRef.current) return;
    const jwtToken = session.access_token;
    setToken(jwtToken);
    
    try {
      const API_BASE = import.meta.env.VITE_API_URL || 'https://smart-attendance-backend-62hr.onrender.com';
      
      let response = await withTimeout(
        fetch(`${API_BASE}/users/me`, {
          headers: { 'Authorization': `Bearer ${jwtToken}` }
        }), 8000
      );

      if (response.status === 401) {
        // User might be new, try to sync
        response = await withTimeout(
          fetch(`${API_BASE}/users/sync`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${jwtToken}` }
          }), 8000
        );
      }

      if (response.ok && mountedRef.current) {
        const userData = await response.json();
        setUser(userData);
      } else if (mountedRef.current) {
        const errorData = await response.text();
        console.error("AuthContext: Failed to fetch local user profile:", errorData);
      }
    } catch (error) {
      console.error("AuthContext: Backend communication failed:", error);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
  };

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signUp = async (email, password, metadata = {}) => {
    const { data, error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: { data: metadata }
    });
    if (error) throw error;
    return data;
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signUp, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
