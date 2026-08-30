import { z } from 'zod';
import { apiClient } from './client';

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginData = z.infer<typeof LoginSchema>;

export const RegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type RegisterData = z.infer<typeof RegisterSchema>;

export const authApi = {
  login: async (data: LoginData) => {
    const res = await apiClient.post('/auth/login', data);
    return res.data.data; // { access_token: string }
  },
  
  register: async (data: RegisterData) => {
    const res = await apiClient.post('/auth/register', data);
    return res.data.data as User;
  },
  
  me: async () => {
    const res = await apiClient.get('/auth/me');
    return res.data.data as User;
  },
  
  logout: async () => {
    await apiClient.post('/auth/logout');
  }
};
