import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import { NavLink, useParams } from 'react-router-dom';
import { Home, FolderKanban, Settings, Database, BrainCircuit } from 'lucide-react';

const DRAWER_WIDTH = 260;

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  isMobile: boolean;
}

export default function Sidebar({ open, onClose, isMobile }: SidebarProps) {
  const { workspaceId } = useParams();

  const mainNav = [
    { name: 'Dashboard', path: '/dashboard', icon: <Home size={20} /> },
  ];

  const workspaceNav = workspaceId ? [
    { name: 'Overview', path: `/workspaces/${workspaceId}`, icon: <FolderKanban size={20} /> },
    { name: 'Research Sessions', path: `/workspaces/${workspaceId}/research`, icon: <BrainCircuit size={20} /> },
    { name: 'Knowledge Sources', path: `/workspaces/${workspaceId}/sources`, icon: <Database size={20} /> },
    { name: 'Settings', path: `/workspaces/${workspaceId}/settings`, icon: <Settings size={20} /> },
  ] : [];

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', pt: 2 }}>
      <Box sx={{ px: 3, mb: 1 }}>
        <Typography variant="overline" color="text.disabled">Global</Typography>
      </Box>
      <List disablePadding sx={{ px: 2 }}>
        {mainNav.map((item) => (
          <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              component={NavLink}
              to={item.path}
              onClick={isMobile ? onClose : undefined}
              sx={{
                borderRadius: 2,
                '&.active': {
                  bgcolor: 'action.selected',
                  color: 'primary.main',
                  '& .MuiListItemIcon-root': { color: 'primary.main' }
                }
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.name} primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      {workspaceNav.length > 0 && (
        <>
          <Box sx={{ px: 3, mt: 4, mb: 1 }}>
            <Typography variant="overline" color="text.disabled">Current Workspace</Typography>
          </Box>
          <List disablePadding sx={{ px: 2 }}>
            {workspaceNav.map((item) => (
              <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  component={NavLink}
                  to={item.path}
                  end={item.path === `/workspaces/${workspaceId}`} // Exact match for overview
                  onClick={isMobile ? onClose : undefined}
                  sx={{
                    borderRadius: 2,
                    '&.active': {
                      bgcolor: 'action.selected',
                      color: 'primary.main',
                      '& .MuiListItemIcon-root': { color: 'primary.main' }
                    }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.name} primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </>
      )}
    </Box>
  );

  return (
    <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
      {isMobile ? (
        <Drawer
          variant="temporary"
          open={open}
          onClose={onClose}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH, mt: '64px', height: 'calc(100% - 64px)' },
          }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH, mt: '64px', height: 'calc(100% - 64px)', borderRight: '1px solid', borderColor: 'divider' },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      )}
    </Box>
  );
}
