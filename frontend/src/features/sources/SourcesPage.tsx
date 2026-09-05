import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, Typography, Button, Paper, Breadcrumbs, Link as MuiLink, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { ChevronRight, Plus, Link as LinkIcon, FileText, Globe } from 'lucide-react';
import { sourcesApi, Source } from '@/api/sources';
import { workspacesApi } from '@/api/workspaces';
import AddSourceDialog from './AddSourceDialog';
import { formatRelativeTime } from '@/lib/formatters';

export default function SourcesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { data: workspace } = useQuery({
    queryKey: ['workspaces', workspaceId],
    queryFn: () => workspacesApi.get(workspaceId!),
    enabled: !!workspaceId,
  });

  const { data: sources, isLoading } = useQuery({
    queryKey: ['sources', workspaceId],
    queryFn: () => sourcesApi.listSources(workspaceId!),
    enabled: !!workspaceId,
  });

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'url': return <LinkIcon size={16} />;
      case 'web': return <Globe size={16} />;
      default: return <FileText size={16} />;
    }
  };

  return (
    <Box>
      <Breadcrumbs separator={<ChevronRight size={16} />} aria-label="breadcrumb" sx={{ mb: 3 }}>
        <MuiLink component={Link} to="/dashboard" color="inherit" underline="hover">
          Workspaces
        </MuiLink>
        <MuiLink component={Link} to={`/workspaces/${workspaceId}`} color="inherit" underline="hover">
          {workspace?.name || 'Workspace'}
        </MuiLink>
        <Typography color="text.primary">Knowledge Sources</Typography>
      </Breadcrumbs>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h1" sx={{ mb: 1 }}>Knowledge Sources</Typography>
          <Typography variant="body1" color="text.secondary">
            Manage external context and documents available to the AI.
          </Typography>
        </Box>
        <Button 
          variant="contained" 
          startIcon={<Plus size={18} />}
          onClick={() => setAddDialogOpen(true)}
        >
          Add Source
        </Button>
      </Box>

      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <TableContainer>
          <Table sx={{ minWidth: 650 }} aria-label="sources table">
            <TableHead sx={{ bgcolor: 'background.default' }}>
              <TableRow>
                <TableCell width={50}>Type</TableCell>
                <TableCell>Title</TableCell>
                <TableCell>URL / Path</TableCell>
                <TableCell align="right">Added</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4 }}>Loading sources...</TableCell>
                </TableRow>
              ) : sources?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 6 }}>
                    <Typography variant="body1" color="text.secondary" gutterBottom>
                      No sources added yet.
                    </Typography>
                    <Button variant="outlined" size="small" onClick={() => setAddDialogOpen(true)}>
                      Add your first source
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                sources?.map((source: Source) => (
                  <TableRow key={source.id} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
                        {getSourceIcon(source.type)}
                      </Box>
                    </TableCell>
                    <TableCell component="th" scope="row">
                      <Typography variant="body2" fontWeight={500}>
                        {source.title}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {source.url ? (
                        <MuiLink href={source.url} target="_blank" rel="noopener noreferrer" variant="body2" color="primary.main">
                          {source.url.length > 50 ? source.url.substring(0, 50) + '...' : source.url}
                        </MuiLink>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {formatRelativeTime(source.created_at) || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <AddSourceDialog 
        open={addDialogOpen} 
        onClose={() => setAddDialogOpen(false)} 
        workspaceId={workspaceId!}
      />
    </Box>
  );
}
