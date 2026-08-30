import { Card, CardContent, CardActionArea, Typography, Box, Chip } from '@mui/material';
import { Database, BrainCircuit, ArrowRight, FolderKanban } from 'lucide-react';
import { Link } from 'react-router-dom';
import { WorkspaceListItem } from '@/api/workspaces';
import { formatDistanceToNow } from 'date-fns';

interface WorkspaceCardProps {
  workspace: WorkspaceListItem;
}

export default function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        bgcolor: '#111114',
        border: '1px solid #27272A',
        borderRadius: 2.5,
        transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        '&:hover': {
          transform: 'translateY(-4px)',
          borderColor: '#3F3F46',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          '& .arrow-icon': {
            color: '#FFFFFF',
            transform: 'translateX(4px)',
          },
          '& .workspace-title': {
            color: '#FFFFFF',
          },
        },
      }}
    >
      <CardActionArea
        component={Link}
        to={`/workspaces/${workspace.id}`}
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          p: 0,
        }}
      >
        <CardContent sx={{ width: '100%', flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
              <Box
                sx={{
                  p: 0.8,
                  borderRadius: 1.5,
                  bgcolor: '#17171C',
                  border: '1px solid #27272A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FolderKanban size={18} color="#818CF8" />
              </Box>
              <Typography
                variant="h6"
                component="h2"
                className="workspace-title"
                sx={{
                  fontWeight: 600,
                  fontSize: '1.05rem',
                  color: '#F4F4F5',
                  letterSpacing: '-0.01em',
                  transition: 'color 0.2s ease',
                }}
              >
                {workspace.name}
              </Typography>
            </Box>
            <ArrowRight
              size={18}
              className="arrow-icon"
              style={{
                color: '#71717A',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                flexShrink: 0,
              }}
            />
          </Box>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mb: 2.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.55,
              minHeight: 40,
              fontSize: '0.8125rem',
            }}
          >
            {workspace.description || 'No description provided.'}
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
            <Chip
              icon={<Database size={13} color="#38BDF8" />}
              label={`${workspace.source_count} Sources`}
              size="small"
              sx={{
                bgcolor: '#17171C',
                border: '1px solid #27272A',
                borderRadius: 1.5,
                fontSize: '0.75rem',
                color: '#D4D4D8',
                fontWeight: 500,
                '& .MuiChip-icon': { ml: 0.8 },
              }}
            />
            <Chip
              icon={<BrainCircuit size={13} color="#10B981" />}
              label={`${workspace.research_count} Sessions`}
              size="small"
              sx={{
                bgcolor: '#17171C',
                border: '1px solid #27272A',
                borderRadius: 1.5,
                fontSize: '0.75rem',
                color: '#D4D4D8',
                fontWeight: 500,
                '& .MuiChip-icon': { ml: 0.8 },
              }}
            />
          </Box>

          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 'auto',
              color: '#71717A',
              fontSize: '0.725rem',
            }}
          >
            Updated {formatDistanceToNow(new Date(workspace.  d_at), { addSuffix: true })}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
