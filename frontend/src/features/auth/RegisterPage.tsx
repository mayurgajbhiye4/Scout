import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { RegisterSchema, RegisterData } from '@/api/auth';
import { useAuth } from './useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';

export default function RegisterPage() {
  const { register: registerUser, isRegistering, registerError, isAuthenticated } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterData>({
    resolver: zodResolver(RegisterSchema),
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (data: RegisterData) => {
    try {
      await registerUser(data);
    } catch {
      // Handled by react query
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
            <h1 className="text-2xl font-bold text-[#F4F4F5] tracking-tight mb-1">Create an account</h1>
            <p className="text-sm text-[#A1A1AA]">Start your autonomous research journey</p>
          </div>

          {registerError && (
            <Alert variant="error" className="w-full mb-5">
              {/* @ts-ignore */}
              {registerError.response?.data?.meta?.message || 'Registration failed. Email might be taken.'}
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="w-full flex flex-col gap-4">
            <div>
              <label htmlFor="name" className="block text-sm text-[#A1A1AA] mb-1.5">Full name</label>
              <Input
                id="name"
                {...register('name')}
                autoComplete="name"
                placeholder="Jane Doe"
                className={errors.name ? 'border-[#EF4444]' : ''}
              />
              {errors.name && (
                <p className="text-xs text-[#EF4444] mt-1">{errors.name.message}</p>
              )}
            </div>
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
                autoComplete="new-password"
                placeholder="••••••••"
                className={errors.password ? 'border-[#EF4444]' : ''}
              />
              {errors.password && (
                <p className="text-xs text-[#EF4444] mt-1">{errors.password.message}</p>
              )}
            </div>
            <Button type="submit" disabled={isRegistering} size="lg" className="w-full mt-2">
              {isRegistering ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <p className="text-sm text-[#A1A1AA] mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-white hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
