import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, Typography, Button, Paper, Breadcrumbs, Link as MuiLink, CircularProgress, Stepper, Step, StepLabel } from '@mui/material';
import { ChevronRight, FileText } from 'lucide-react';
import { researchApi } from '@/api/research';

const STATUS_STEPS = ['queued', 'planning', 'researching', 'finalizing', 'completed'];
const STATUS_LABELS = ['Queued', 'Planning Tasks', 'Gathering Evidence', 'Drafting Report', 'Complete'];

export default function ResearchExecutionPage() {
  const { workspaceId, sessionId } = useParams<{ workspaceId: string, sessionId: string }>();
  const navigate = useNavigate();

  const { data: session, isLoading } = useQuery({
    queryKey: ['research', workspaceId, sessionId],
    queryFn: () => researchApi.getSession(workspaceId!, sessionId!),
    refetchInterval: (query) => {
      // Poll every 3 seconds while not completed or failed
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') return false;
      return 3000;
    },
  });

  useEffect(() => {
    // If completed, redirect to report page
    if (session?.status === 'completed') {
      navigate(`/workspaces/${workspaceId}/research/${sessionId}/report`);
    }
  }, [session?.status, navigate, workspaceId, sessionId]);

  if (isLoading) {
    return <Typography>Loading session details...</Typography>;
  }

  if (!session) {
    return <Typography color="error">Research session not found.</Typography>;
  }

  const activeStep = STATUS_STEPS.indexOf(session.status);

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Breadcrumbs separator={<ChevronRight size={16} />} aria-label="breadcrumb" sx={{ mb: 4 }}>
        <MuiLink component={Link} to="/dashboard" color="inherit" underline="hover">
          Workspaces
        </MuiLink>
        <MuiLink component={Link} to={`/workspaces/${workspaceId}`} color="inherit" underline="hover">
          Workspace
        </MuiLink>
        <Typography color="text.primary">Research Execution</Typography>
      </Breadcrumbs>

      <Paper sx={{ p: 5, textAlign: 'center' }}>
        <Typography variant="h2" sx={{ mb: 2 }}>{session.question}</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 6 }}>
          The autonomous agent is currently executing your research query. This may take a few minutes.
        </Typography>

        <Box sx={{ width: '100%', mb: 6 }}>
          <Stepper activeStep={activeStep === -1 ? 0 : activeStep} alternativeLabel>
            {STATUS_LABELS.map((label, index) => (
              <Step key={label}>
                <StepLabel 
                  icon={
                    index === activeStep ? (
                      <CircularProgress size={24} thickness={5} />
                    ) : undefined
                  }
                >
                  {label}
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {session.status === 'failed' && (
          <Box sx={{ mt: 4, p: 3, bgcolor: 'error.main', color: 'error.contrastText', borderRadius: 2 }}>
            <Typography variant="h6">Research Failed</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>{session.error_message}</Typography>
          </Box>
        )}
        
        {session.status === 'completed' && (
           <Button 
            variant="contained" 
            component={Link} 
            to={`/workspaces/${workspaceId}/research/${sessionId}/report`}
            startIcon={<FileText size={18} />}
          >
            View Report
          </Button>
        )}
      </Paper>
    </Box>
  );
}
