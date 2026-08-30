import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, Typography, Breadcrumbs, Link as MuiLink, Button, Grid, Paper } from '@mui/material';
import { ChevronRight, Plus, BrainCircuit, Database } from 'lucide-react';
import { workspacesApi } from '@/api/workspaces';

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const { data: workspace, isLoading, error } = useQuery({
    queryKey: ['workspaces', workspaceId],
    queryFn: () => workspacesApi.get(workspaceId!),
    enabled: !!workspaceId,
  });

  if (isLoading) {
    return <Typography color="text.secondary">Loading workspace...</Typography>;
  }

  if (error || !workspace) {
    return <Typography color="error">Failed to load workspace.</Typography>;
  }

  return (
    <Box>
      <Breadcrumbs separator={<ChevronRight size={16} />} aria-label="breadcrumb" sx={{ mb: 3 }}>
        <MuiLink component={Link} to="/dashboard" color="inherit" underline="hover">
          Workspaces
        </MuiLink>
        <Typography color="text.primary">{workspace.name}</Typography>
      </Breadcrumbs>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
        <Box>
          <Typography variant="h1" sx={{ mb: 1 }}>{workspace.name}</Typography>
          {workspace.description && (
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 800 }}>
              {workspace.description}
            </Typography>
          )}
        </Box>
        <Button 
          component={Link} 
          to={`/workspaces/${workspace.id}/research/new`}
          variant="contained" 
          startIcon={<Plus size={18} />}
        >
          New Research
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main' }}>
              <BrainCircuit size={24} />
              <Typography variant="h3">Research Sessions</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              You have {workspace.research_count} active or completed research sessions.
            </Typography>
            <Button 
              component={Link} 
              to={`/workspaces/${workspace.id}/research`} 
              variant="outlined" 
              sx={{ mt: 'auto', alignSelf: 'flex-start' }}
            >
              View All Sessions
            </Button>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main' }}>
              <Database size={24} />
              <Typography variant="h3">Knowledge Sources</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              {workspace.source_count} external sources and documents indexed for this workspace.
            </Typography>
            <Button 
              component={Link} 
              to={`/workspaces/${workspace.id}/sources`} 
              variant="outlined" 
              sx={{ mt: 'auto', alignSelf: 'flex-start' }}
            >
              Manage Sources
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
