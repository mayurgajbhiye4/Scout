import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Box, Typography, Button, TextField, Paper, Breadcrumbs, Link as MuiLink, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { ChevronRight, Sparkles } from 'lucide-react';
import { researchApi, ResearchCreateData } from '@/api/research';

export default function ResearchComposer() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  
  const [question, setQuestion] = useState('');
  const [depth, setDepth] = useState<'quick' | 'standard' | 'deep'>('standard');

  const createMutation = useMutation({
    mutationFn: (data: ResearchCreateData) => researchApi.createSession(workspaceId!, data),
    onSuccess: (session) => {
      navigate(`/workspaces/${workspaceId}/research/${session.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.length < 5) return;
    
    createMutation.mutate({
      question,
      research_depth: depth,
    });
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Breadcrumbs separator={<ChevronRight size={16} />} aria-label="breadcrumb" sx={{ mb: 4 }}>
        <MuiLink component={Link} to="/dashboard" color="inherit" underline="hover">
          Workspaces
        </MuiLink>
        <MuiLink component={Link} to={`/workspaces/${workspaceId}`} color="inherit" underline="hover">
          Workspace
        </MuiLink>
        <Typography color="text.primary">New Research</Typography>
      </Breadcrumbs>

      <Typography variant="h1" sx={{ mb: 1 }}>Start Research</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Ask a question or describe a topic. The AI will autonomously gather evidence from your sources and the web to draft a comprehensive report.
      </Typography>

      <Paper sx={{ p: 4 }}>
        <form onSubmit={handleSubmit}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            
            <TextField
              label="What do you want to research?"
              placeholder="e.g., How do the latest transformer architectures optimize inference latency?"
              multiline
              rows={4}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              fullWidth
              autoFocus
              required
              helperText="Be as specific as possible for better results."
            />

            <FormControl fullWidth>
              <InputLabel id="depth-label">Research Depth</InputLabel>
              <Select
                labelId="depth-label"
                value={depth}
                label="Research Depth"
                onChange={(e) => setDepth(e.target.value as any)}
              >
                <MenuItem value="quick">Quick (1-2 iterations, fast)</MenuItem>
                <MenuItem value="standard">Standard (Balanced thoroughness)</MenuItem>
                <MenuItem value="deep">Deep Dive (Exhaustive search and synthesis)</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button
                type="submit"
                variant="contained"
                size="large"
                startIcon={<Sparkles size={18} />}
                disabled={question.length < 5 || createMutation.isPending}
              >
                {createMutation.isPending ? 'Starting Engine...' : 'Begin Autonomous Research'}
              </Button>
            </Box>
          </Box>
        </form>
      </Paper>
    </Box>
  );
}
