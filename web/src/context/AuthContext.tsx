import { createContext, useContext, useState, useCallback, useEffect, startTransition, type ReactNode } from 'react';
import { getStoredToken, setToken as storeToken, getStoredUser, getProfile, type LoginUser } from '../api/client';
import { clearMediaBlobCache } from '../lib/mediaBlobCache';
import { clearSessionCache } from '../lib/sessionApiCache';

type AuthContextValue = {
  token: string;
  isLoggedIn: boolean;
  isAdmin: boolean;
  user: LoginUser | null;
  setToken: (t: string, user?: LoginUser | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState(getStoredToken);
  const [user, setUser] = useState<LoginUser | null>(getStoredUser);

  const setToken = useCallback((t: string, u?: LoginUser | null) => {
    storeToken(t);
    setTokenState(t);
    if (u !== undefined) setUser(u ?? getStoredUser());
  }, []);

  const logout = useCallback(() => {
    // 登出会切到 lazy Landing；同步 setState 会触发 React #426，须包在 transition 里
    startTransition(() => {
      storeToken('');
      setTokenState('');
      setUser(null);
      clearMediaBlobCache();
      clearSessionCache();
    });
  }, []);

  useEffect(() => {
    if (token && !user) {
      getProfile().then((res) => {
        if (!res.error && res.data?.data) setUser(res.data.data as LoginUser);
      });
    }
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        token,
        isLoggedIn: !!token,
        isAdmin: user?.role === 'admin',
        user,
        setToken,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
