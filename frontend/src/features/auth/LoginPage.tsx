import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Box, Button, TextField, Typography, Paper, Alert, Link as MuiLink } from '@mui/material';
import { Link, Navigate } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { LoginSchema, LoginData } from '@/api/auth';
import { useAuth } from './useAuth';

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
    } catch (err) {
      // Error is handled by React Query state
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        backgroundColor: 'background.default'
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 4, md: 6 },
          maxWidth: 400,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 4, color: 'primary.main' }}>
          <Bot size={32} />
          <Typography variant="h2" component="h1" color="text.primary">
            Workspace
          </Typography>
        </Box>

        <Typography variant="h4" sx={{ mb: 1, alignSelf: 'flex-start' }}>
          Welcome back
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4, alignSelf: 'flex-start' }}>
          Sign in to continue your research
        </Typography>

        {loginError && (
          <Alert severity="error" sx={{ width: '100%', mb: 3 }}>
            {/* @ts-ignore */}
            {loginError.response?.data?.meta?.message || 'Invalid credentials or server error'}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ width: '100%' }}>
          <TextField
            fullWidth
            label="Email address"
            {...register('email')}
            error={!!errors.email}
            helperText={errors.email?.message}
            sx={{ mb: 3 }}
            autoComplete="email"
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            {...register('password')}
            error={!!errors.password}
            helperText={errors.password?.message}
            sx={{ mb: 4 }}
            autoComplete="current-password"
          />
          <Button
            fullWidth
            variant="contained"
            size="large"
            type="submit"
            disabled={isLoggingIn}
          >
            {isLoggingIn ? 'Signing in...' : 'Sign in'}
          </Button>
        </Box>
        
        <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
          Don't have an account?{' '}
          <MuiLink component={Link} to="/register" color="primary.main" underline="hover">
            Sign up
          </MuiLink>
        </Typography>
      </Paper>
    </Box>
  );
}
