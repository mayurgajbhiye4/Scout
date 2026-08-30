import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Box, Typography } from '@mui/material';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <Box 
      sx={{ 
        '& h1, & h2, & h3, & h4': { 
          color: 'text.primary',
          mt: 4, 
          mb: 2,
          fontWeight: 600
        },
        '& p': {
          color: 'text.secondary',
          lineHeight: 1.7,
          mb: 2
        },
        '& a': {
          color: 'primary.main',
          textDecoration: 'none',
          '&:hover': {
            textDecoration: 'underline'
          }
        },
        '& ul, & ol': {
          color: 'text.secondary',
          pl: 3,
          mb: 2
        },
        '& li': {
          mb: 1
        },
        '& blockquote': {
          borderLeft: '4px solid',
          borderColor: 'primary.main',
          pl: 2,
          ml: 0,
          color: 'text.secondary',
          fontStyle: 'italic'
        },
        '& code': {
          fontFamily: 'monospace',
          bgcolor: 'action.hover',
          p: 0.5,
          borderRadius: 1,
          fontSize: '0.875em'
        },
        '& pre': {
          bgcolor: 'action.hover',
          p: 2,
          borderRadius: 1,
          overflowX: 'auto',
          '& code': {
            bgcolor: 'transparent',
            p: 0
          }
        }
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </Box>
  );
}
