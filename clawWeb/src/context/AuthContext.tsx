import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  getStoredToken,
  getStoredUser,
  setToken as storeToken,
  type LoginUser,
} from '../api/client';

type AuthContextValue = {
  token: string;
  user: LoginUser | null;
  isLoggedIn: boolean;
  isAdmin: boolean;
  setAuth: (token: string, user?: LoginUser | null) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string>(() => getStoredToken());
  const [user, setUser] = useState<LoginUser | null>(() => getStoredUser());

  const setAuth = useCallback((t: string, u?: LoginUser | null) => {
    storeToken(t);
    setTokenState(t);
    if (u !== undefined) {
      setUser(u);
    } else {
      setUser(getStoredUser());
    }
  }, []);

  const logout = useCallback(() => {
    storeToken('');
    setTokenState('');
    setUser(null);
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
    } else if (!user) {
      setUser(getStoredUser());
    }
  }, [token, user]);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isLoggedIn: !!token,
        isAdmin: user?.role === 'admin',
        setAuth,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

