import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { LoginSchema, LoginData } from '@/api/auth';
import { useAuth } from './useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';

export default function LoginPage() {
  const { login, isLoggingIn, loginError, isAuthenticated } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginData>({
    resolver: zodResolver(LoginSchema),
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (data: LoginData) => {
    try {
      await login(data);
    } catch {
      // Error handled by React Query
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090B] p-4">
      <Card className="w-full max-w-[400px] border-[#27272A] bg-[#111114]">
        <CardContent className="pt-8 pb-8 px-8 flex flex-col items-center">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-8 text-white">
            <Bot size={28} />
            <span className="text-xl font-semibold tracking-tight">Workspace</span>
          </div>

          <div className="w-full mb-6">
            <h1 className="text-2xl font-bold text-[#F4F4F5] tracking-tight mb-1">Sign in</h1>
            <p className="text-sm text-[#A1A1AA]">Welcome back! Enter your details to continue.</p>
          </div>

          {loginError && (
            <Alert variant="error" className="w-full mb-5">
              {/* @ts-ignore */}
              {loginError.response?.data?.meta?.message || 'Invalid credentials or server error'}
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="w-full flex flex-col gap-4">
            <div>
              <label htmlFor="email" className="block text-sm text-[#A1A1AA] mb-1.5">Email address</label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                autoComplete="email"
                placeholder="you@example.com"
                className={errors.email ? 'border-[#EF4444]' : ''}
              />
              {errors.email && (
                <p className="text-xs text-[#EF4444] mt-1">{errors.email.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="password" className="block text-sm text-[#A1A1AA] mb-1.5">Password</label>
              <Input
                id="password"
                type="password"
                {...register('password')}
                autoComplete="current-password"
                placeholder="••••••••"
                className={errors.password ? 'border-[#EF4444]' : ''}
              />
              {errors.password && (
                <p className="text-xs text-[#EF4444] mt-1">{errors.password.message}</p>
              )}
            </div>
            <Button type="submit" disabled={isLoggingIn} size="lg" className="w-full mt-2">
              {isLoggingIn ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <p className="text-sm text-[#A1A1AA] mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-white hover:underline font-medium">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
