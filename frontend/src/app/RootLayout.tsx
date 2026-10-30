import { Outlet } from 'react-router-dom';
import AuthDialog from '@/features/auth/AuthDialog';

/** Wraps every route so the log in / sign up dialog can open over any page. */
export default function RootLayout() {
  return (
    <>
      <Outlet />
      <AuthDialog />
    </>
  );
}
