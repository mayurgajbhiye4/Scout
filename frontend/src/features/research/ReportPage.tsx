import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, Typography, Paper, Breadcrumbs, Link as MuiLink, Grid, Chip } from '@mui/material';
import { ChevronRight, FileText, CheckCircle2 } from 'lucide-react';
import { researchApi } from '@/api/research';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import { format } from 'date-fns';

export default function ReportPage() {
  const { workspaceId, sessionId } = useParams<{ workspaceId: string, sessionId: string }>();

  const { data: session } = useQuery({
    queryKey: ['research', workspaceId, sessionId],
    queryFn: () => researchApi.getSession(workspaceId!, sessionId!),
  });

  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['research', workspaceId, sessionId, 'report'],
    queryFn: () => researchApi.getReport(workspaceId!, sessionId!),
    enabled: !!session && session.status === 'completed',
  });

  const { data: evidence, isLoading: evidenceLoading } = useQuery({
    queryKey: ['research', workspaceId, sessionId, 'evidence'],
    queryFn: () => researchApi.getEvidence(workspaceId!, sessionId!),
    enabled: !!session && session.status === 'completed',
  });

  if (reportLoading || evidenceLoading) {
    return <Typography>Loading report...</Typography>;
  }

  return (
    <Box>
      <Breadcrumbs separator={<ChevronRight size={16} />} aria-label="breadcrumb" sx={{ mb: 4 }}>
        <MuiLink component={Link} to="/dashboard" color="inherit" underline="hover">
          Workspaces
        </MuiLink>
        <MuiLink component={Link} to={`/workspaces/${workspaceId}`} color="inherit" underline="hover">
          Workspace
        </MuiLink>
        <Typography color="text.primary">Research Report</Typography>
      </Breadcrumbs>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h1" sx={{ mb: 1 }}>{report?.title || 'Research Report'}</Typography>
        <Typography variant="body1" color="text.secondary">
          Based on query: "{session?.question}"
        </Typography>
        {session?.completed_at && !isNaN(new Date(session.completed_at).getTime()) && (
          <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
            Generated {format(new Date(session.completed_at), 'PPP pp')}
          </Typography>
        )}
      </Box>

      <Grid container spacing={4}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 4 }}>
            {report?.content_markdown ? (
              <MarkdownRenderer content={report.content_markdown} />
            ) : (
              <Typography color="text.secondary">No report content available.</Typography>
            )}
          </Paper>
        </Grid>
        
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, position: 'sticky', top: 24, maxHeight: 'calc(100vh - 48px)', overflow: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
              <FileText size={20} color="var(--mui-palette-primary-main)" />
              <Typography variant="h3">Evidence & Citations</Typography>
            </Box>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {evidence?.map((item, idx) => (
                <Box key={item.id} sx={{ borderLeft: '2px solid', borderColor: 'primary.main', pl: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    [{idx + 1}] {item.claim}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 1 }}>
                    "{item.supporting_excerpt}"
                  </Typography>
                  <Chip 
                    size="small" 
                    icon={<CheckCircle2 size={12} />} 
                    label={`${Math.round(item.confidence * 100)}% Confidence`} 
                    color={item.confidence > 0.8 ? 'success' : 'default'}
                    variant="outlined"
                  />
                </Box>
              ))}
              
              {(!evidence || evidence.length === 0) && (
                <Typography variant="body2" color="text.secondary">
                  No explicit evidence chunks found for this report.
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
