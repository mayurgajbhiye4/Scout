import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Box, Button, TextField, Typography, Paper, Alert, Link as MuiLink } from '@mui/material';
import { Link, Navigate } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { RegisterSchema, RegisterData } from '@/api/auth';
import { useAuth } from './useAuth';

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
    } catch (err) {
      // Handled by react query
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
          Create an account
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4, alignSelf: 'flex-start' }}>
          Start your autonomous research journey
        </Typography>

        {registerError && (
          <Alert severity="error" sx={{ width: '100%', mb: 3 }}>
            {/* @ts-ignore */}
            {registerError.response?.data?.meta?.message || 'Registration failed. Email might be taken.'}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ width: '100%' }}>
          <TextField
            fullWidth
            label="Full name"
            {...register('name')}
            error={!!errors.name}
            helperText={errors.name?.message}
            sx={{ mb: 3 }}
            autoComplete="name"
          />
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
            autoComplete="new-password"
          />
          <Button
            fullWidth
            variant="contained"
            size="large"
            type="submit"
            disabled={isRegistering}
          >
            {isRegistering ? 'Creating account...' : 'Create account'}
          </Button>
        </Box>
        
        <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
          Already have an account?{' '}
          <MuiLink component={Link} to="/login" color="primary.main" underline="hover">
            Sign in
          </MuiLink>
        </Typography>
      </Paper>
    </Box>
  );
}
