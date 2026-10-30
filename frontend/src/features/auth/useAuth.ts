import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/api/auth';

export function useAuth() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const token = localStorage.getItem('airw_token');

  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    enabled: !!token,
    retry: false, // Don't retry on 401s
  });

  // Signing in happens in the auth dialog over the current page, so success only stores the token; the page
  // the person was on stays put and re-renders as signed in.
  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      localStorage.setItem('airw_token', data.access_token);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  const googleLoginMutation = useMutation({
    mutationFn: authApi.googleLogin,
    onSuccess: (data) => {
      localStorage.setItem('airw_token', data.access_token);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  // Registering returns the new user, not a token; the auth dialog logs in with the same details next
  const registerMutation = useMutation({
    mutationFn: authApi.register,
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      localStorage.removeItem('airw_token');
      queryClient.clear();
      navigate('/');
    },
  });

  return {
    user,
    isLoading: isLoading && !!token,
    isAuthenticated: !!user,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
    googleLogin: googleLoginMutation.mutateAsync,
    isGoogleLoggingIn: googleLoginMutation.isPending,
    googleLoginError: googleLoginMutation.error,
    register: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,
    logout: logoutMutation.mutate,
  };
}
