/**
 * DocumentList component displaying uploaded workspace documents with status chips.
 */

import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionIcon from '@mui/icons-material/Description';
import LanguageIcon from '@mui/icons-material/Language';
import YouTubeIcon from '@mui/icons-material/YouTube';
import GitHubIcon from '@mui/icons-material/GitHub';
import { DocumentItem, SourceType } from '@/types';
import { formatDate } from '@/lib/formatters';

interface DocumentListProps {
  documents: DocumentItem[];
  onDelete?: (id: string) => void;
}

function getSourceIcon(type: SourceType) {
  switch (type) {
    case 'url':
      return <LanguageIcon color="primary" fontSize="small" />;
    case 'youtube':
      return <YouTubeIcon color="error" fontSize="small" />;
    case 'github':
      return <GitHubIcon fontSize="small" />;
    default:
      return <DescriptionIcon color="action" fontSize="small" />;
  }
}

function getStatusColor(status: string): 'default' | 'primary' | 'success' | 'error' | 'warning' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'processing':
      return 'primary';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
}

export default function DocumentList({ documents, onDelete }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <Card variant="outlined">
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">
            No documents uploaded yet. Add PDFs, URLs, or repository sources.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="outlined">
      <List disablePadding>
        {documents.map((doc, idx) => (
          <ListItem
            key={doc.id}
            divider={idx < documents.length - 1}
            secondaryAction={
              onDelete && (
                <IconButton edge="end" aria-label="delete" onClick={() => onDelete(doc.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              )
            }
          >
            <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%' }}>
              <Box>{getSourceIcon(doc.source_type)}</Box>
              <ListItemText
                primary={doc.filename}
                secondary={
                  doc.url ? (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {doc.url} • Added {formatDate(doc.created_at)}
                    </Typography>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      Added {formatDate(doc.created_at)}
                    </Typography>
                  )
                }
              />
              <Chip
                label={doc.status}
                size="small"
                color={getStatusColor(doc.status)}
                variant="outlined"
              />
            </Stack>
          </ListItem>
        ))}
      </List>
    </Card>
  );
}
