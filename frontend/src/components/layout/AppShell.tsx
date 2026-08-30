import { useState } from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { Outlet, Navigate } from 'react-router-dom';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import { useAuth } from '@/features/auth/useAuth';

export default function AppShell() {
  const { isAuthenticated, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleDrawerToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  if (isLoading) {
    return <Box sx={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>Loading...</Box>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <TopBar onMenuClick={handleDrawerToggle} />
      
      <Sidebar 
        open={sidebarOpen} 
        onClose={handleDrawerToggle} 
        isMobile={isMobile}
      />
      
      <Box 
        component="main" 
        sx={{ 
          flexGrow: 1, 
          height: '100vh',
          pt: '64px', // TopBar height
          overflow: 'auto',
          backgroundColor: 'background.default'
        }}
      >
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
