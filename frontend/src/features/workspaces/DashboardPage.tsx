import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Typography, Button, Grid, Skeleton, Chip } from '@mui/material';
import { Plus, ArrowLeft, FolderPlus, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '@/api/workspaces';
import WorkspaceCard from './WorkspaceCard';
import CreateWorkspaceDialog from './CreateWorkspaceDialog';

export default function DashboardPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: workspacesApi.list,
  });

  return (
    <Box
      sx={{
        animation: 'fadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}
    >
      <Button
        component={Link}
        to="/"
        startIcon={<ArrowLeft size={16} className="back-arrow" />}
        sx={{
          mb: 3,
          color: '#A1A1AA',
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.875rem',
          borderRadius: 2,
          px: 1.5,
          py: 0.75,
          transition: 'all 0.15s ease',
          '& .back-arrow': {
            transition: 'transform 0.15s ease',
          },
          '&:hover': {
            color: '#F4F4F5',
            bgcolor: 'rgba(255, 255, 255, 0.05)',
            '& .back-arrow': {
              transform: 'translateX(-3px)',
            },
          },
          '&:active': {
            transform: 'scale(0.97)',
          },
        }}
      >
        Back to Home
      </Button>

      {/* Header Section */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 4 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <Typography variant="h1" sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', sm: '2rem' }, letterSpacing: '-0.02em', color: '#F4F4F5' }}>
              Workspaces
            </Typography>
            {workspaces && (
              <Chip
                icon={<Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#10B981', ml: 0.8 }} />}
                label={`${workspaces.length} ${workspaces.length === 1 ? 'Workspace' : 'Workspaces'}`}
                size="small"
                sx={{
                  bgcolor: '#141418',
                  border: '1px solid #27272A',
                  color: '#D4D4D8',
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  borderRadius: '9999px',
                }}
              />
            )}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
            Manage your research environments, deep explorations, and knowledge libraries.
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={() => setCreateDialogOpen(true)}
          sx={{
            borderRadius: '9999px',
            px: 2.5,
            py: 0.9,
            bgcolor: '#FFFFFF',
            color: '#09090B',
            fontWeight: 600,
            fontSize: '0.875rem',
            textTransform: 'none',
            boxShadow: '0 2px 10px rgba(255, 255, 255, 0.12)',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            '&:hover': {
              bgcolor: '#E4E4E7',
              transform: 'translateY(-1px)',
              boxShadow: '0 4px 18px rgba(255, 255, 255, 0.22)',
            },
            '&:active': {
              transform: 'scale(0.97)',
            },
          }}
        >
          New Workspace
        </Button>
      </Box>

      {/* Content Section */}
      {isLoading ? (
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map((i) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={i}>
              <Box
                sx={{
                  height: 220,
                  p: 3,
                  bgcolor: '#111114',
                  borderRadius: 2.5,
                  border: '1px solid #27272A',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Skeleton variant="rounded" width={140} height={24} sx={{ bgcolor: '#1C1C22', borderRadius: 1 }} />
                  <Skeleton variant="circular" width={20} height={20} sx={{ bgcolor: '#1C1C22' }} />
                </Box>
                <Skeleton variant="text" width="90%" height={16} sx={{ bgcolor: '#1C1C22' }} />
                <Skeleton variant="text" width="60%" height={16} sx={{ bgcolor: '#1C1C22' }} />
                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                  <Skeleton variant="rounded" width={80} height={24} sx={{ bgcolor: '#1C1C22', borderRadius: 1.5 }} />
                  <Skeleton variant="rounded" width={80} height={24} sx={{ bgcolor: '#1C1C22', borderRadius: 1.5 }} />
                </Box>
                <Skeleton variant="text" width={100} height={14} sx={{ bgcolor: '#1C1C22', mt: 'auto' }} />
              </Box>
            </Grid>
          ))}
        </Grid>
      ) : workspaces && workspaces.length > 0 ? (
        <Grid container spacing={3}>
          {workspaces.map((workspace) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={workspace.id}>
              <WorkspaceCard workspace={workspace} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Box
          sx={{
            textAlign: 'center',
            py: 10,
            px: 3,
            bgcolor: '#111114',
            borderRadius: 3,
            border: '1px dashed #27272A',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'border-color 0.2s ease',
            '&:hover': {
              borderColor: '#3F3F46',
            },
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              bgcolor: '#17171C',
              border: '1px solid #27272A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#F59E0B',
              mb: 2.5,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
            }}
          >
            <FolderPlus size={28} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 600, color: '#F4F4F5', mb: 1 }}>
            No workspaces yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5, maxWidth: 400, fontSize: '0.875rem' }}>
            Create your first research workspace to start attaching knowledge sources, generating reports, and querying autonomous agents.
          </Typography>
          <Button
            variant="contained"
            startIcon={<Plus size={18} />}
            onClick={() => setCreateDialogOpen(true)}
            sx={{
              borderRadius: '9999px',
              px: 3,
              py: 0.9,
              bgcolor: '#FFFFFF',
              color: '#09090B',
              fontWeight: 600,
              boxShadow: '0 2px 10px rgba(255, 255, 255, 0.12)',
              '&:hover': {
                bgcolor: '#E4E4E7',
                boxShadow: '0 4px 18px rgba(255, 255, 255, 0.22)',
              },
            }}
          >
            Create Your First Workspace
          </Button>
        </Box>
      )}

      <CreateWorkspaceDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />
    </Box>
  );
}
