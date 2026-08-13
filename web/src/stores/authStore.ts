import { create } from 'zustand';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  school_id: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const savedUser = localStorage.getItem('user');
  
  return {
    user: savedUser ? JSON.parse(savedUser) : null,
    isAuthenticated: !!localStorage.getItem('accessToken'),

    login: (user, accessToken, refreshToken) => {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, isAuthenticated: true });
    },

    logout: () => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      set({ user: null, isAuthenticated: false });
    },

    setUser: (user) => {
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, isAuthenticated: true });
    },
  };
});
