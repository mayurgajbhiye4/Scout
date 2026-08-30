import React, { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Paper,
} from '@mui/material';
import {
  PanelLeftClose,
  PanelLeft,
  SquarePen,
  MessageSquare,
  Compass,
  Link2,
  Plus,
  ArrowUp,
  Youtube,
  FileText,
  Github,
  Globe,
  Brain,
  ChevronDown,
  X,
  ExternalLink,
  Sparkles,
  Layers,
  FolderKanban,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/useAuth';

type SourceType = 'youtube' | 'pdf' | 'github' | 'docs' | 'web';

interface AttachedSource {
  id: string;
  type: SourceType;
  title: string;
  urlOrName: string;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  // Input & Prompt state
  const [prompt, setPrompt] = useState<string>('');
  const [reasoningEnabled, setReasoningEnabled] = useState<boolean>(true);
  const [attachedSources, setAttachedSources] = useState<AttachedSource[]>([]);

  // Dialog & Menu states
  const [addSourceAnchor, setAddSourceAnchor] = useState<null | HTMLElement>(null);
  const [modelAnchor, setModelAnchor] = useState<null | HTMLElement>(null);

  // Source Input Dialogs
  const [sourceModalType, setSourceModalType] = useState<SourceType | null>(null);
  const [sourceInputVal, setSourceInputVal] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add source handlers
  const handleAddSource = (type: SourceType, title: string, urlOrName: string) => {
    const newSource: AttachedSource = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      title,
      urlOrName,
    };
    setAttachedSources((prev) => [...prev, newSource]);
    setSourceModalType(null);
    setSourceInputVal('');
  };

  const handleRemoveSource = (id: string) => {
    setAttachedSources((prev) => prev.filter((s) => s.id !== id));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleAddSource('pdf', file.name, file.name);
    }
  };

  // Quick Action Starter Pills — Linear Style with Colored Accents
  const quickStarters = [
    {
      label: 'YouTube Analysis',
      icon: <Youtube size={14} color="#EF4444" />,
      isNew: true,
      prompt: 'Extract key insights, chapters, and fact-check arguments from this lecture video: ',
      action: () => setSourceModalType('youtube'),
    },
    {
      label: 'PDF Synthesis',
      icon: <FileText size={14} color="#F59E0B" />,
      prompt: 'Synthesize methodology and empirical conclusions from the uploaded PDF paper.',
      action: () => fileInputRef.current?.click(),
    },
    {
      label: 'GitHub Codebase',
      icon: <Github size={14} color="#A855F7" />,
      prompt: 'Analyze repository architecture and summarize technical design tradeoffs: ',
      action: () => setSourceModalType('github'),
    },
    {
      label: 'Doc & Web Crawler',
      icon: <Globe size={14} color="#38BDF8" />,
      prompt: 'Index this documentation site and explain core API patterns: ',
      action: () => setSourceModalType('docs'),
    },
    {
      label: 'Tech Trends',
      icon: <Sparkles size={14} color="#F59E0B" />,
      prompt: 'Identify emerging breakthroughs and paradigm shifts in AI agent architectures.',
    },
    {
      label: 'Multi-Paper Review',
      icon: <Layers size={14} color="#10B981" />,
      prompt: 'Synthesize consensus and conflicting findings across recent benchmark publications.',
    },
  ];

  // Submit Prompt / Launch Research
  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() && attachedSources.length === 0) return;

    const draft = {
      prompt,
      reasoningEnabled,
      sources: attachedSources,
    };

    sessionStorage.setItem('airw_landing_draft', JSON.stringify(draft));

    if (isAuthenticated) {
      navigate('/dashboard', { state: { draft } });
    } else {
      navigate('/register', { state: { draft } });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getSourceIcon = (type: SourceType) => {
    switch (type) {
      case 'youtube':
        return <Youtube size={14} color="#EF4444" />;
      case 'pdf':
        return <FileText size={14} color="#F59E0B" />;
      case 'github':
        return <Github size={14} color="#A855F7" />;
      case 'docs':
      case 'web':
        return <Globe size={14} color="#38BDF8" />;
    }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#09090B', color: '#F4F4F5', overflow: 'hidden' }}>
      {/* Hidden file upload */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".pdf,.txt,.md,.doc,.docx"
        onChange={handleFileUpload}
      />

      {/* ── 1. COLLAPSIBLE LEFT SIDEBAR ────────────────────────────────────────── */}
      <Box
        sx={{
          width: sidebarOpen ? 260 : 56,
          transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          borderRight: '1px solid #27272A',
          bgcolor: '#0B0B0E',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          py: 2,
          px: sidebarOpen ? 2 : 1,
          zIndex: 20,
          flexShrink: 0,
        }}
      >
        <Box>
          {/* Sidebar Toggle */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'space-between' : 'center', mb: 3 }}>
            <Tooltip title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} placement="right">
              <IconButton
                size="small"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                sx={{ color: '#A1A1AA', '&:hover': { bgcolor: '#18181B', color: '#F4F4F5' } }}
              >
                {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
              </IconButton>
            </Tooltip>

            {sidebarOpen && (
              <Typography variant="caption" sx={{ fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                WORKSPACE
              </Typography>
            )}
          </Box>

          {/* Action Icons */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Tooltip title="New Research" placement="right">
              <Button
                onClick={() => {
                  setPrompt('');
                  setAttachedSources([]);
                }}
                sx={{
                  minWidth: 0,
                  width: '100%',
                  justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  px: sidebarOpen ? 1.5 : 1,
                  py: 1,
                  borderRadius: 2,
                  color: '#F4F4F5',
                  bgcolor: '#141418',
                  border: '1px solid #27272A',
                  '&:hover': { bgcolor: '#1E1E24', borderColor: '#3F3F46' },
                }}
              >
                <SquarePen size={18} color="#10B981" />
                {sidebarOpen && <Typography variant="body2" sx={{ ml: 1.5, fontWeight: 500 }}>New Research</Typography>}
              </Button>
            </Tooltip>

            <Tooltip title="Workspaces & History" placement="right">
              <Button
                onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}
                sx={{
                  minWidth: 0,
                  width: '100%',
                  justifyContent: sidebarOpen ? 'flex-start' : 'center',
                  px: sidebarOpen ? 1.5 : 1,
                  py: 1,
                  borderRadius: 2,
                  color: '#A1A1AA',
                  '&:hover': { bgcolor: '#141418', color: '#F4F4F5', borderColor: '#3F3F46' },
                }}
              >
                <FolderKanban size={18} color="#818CF8" />
                {sidebarOpen && <Typography variant="body2" sx={{ ml: 1.5 }}>Recent Workspaces</Typography>}
              </Button>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* ── 2. MAIN VIEW AREA ─────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh', overflowY: 'auto' }}>
        {/* TOP HEADER */}
        <Box
          component="header"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: { xs: 2, sm: 4, md: 6 },
            height: 64,
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            bgcolor: 'rgba(9, 9, 11, 0.82)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            transition: 'background-color 0.2s ease, border-color 0.2s ease',
          }}
        >
          {/* Top Left: App Name */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 600,
                  fontSize: '1.25rem',
                  letterSpacing: '-0.02em',
                  color: '#FFFFFF',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    opacity: 0.9,
                  },
                }}
              >
                Scout
              </Typography>
            </Link>
          </Box>

          {/* Top Right: Log In & Sign Up */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {isAuthenticated ? (
              <></>
            ) : (
              <>
                <Button
                  onClick={() => navigate('/login')}
                  sx={{
                    color: '#A1A1AA',
                    fontWeight: 500,
                    fontSize: '0.875rem',
                    textTransform: 'none',
                    px: 2,
                    borderRadius: 2,
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      color: '#F4F4F5',
                      bgcolor: 'rgba(255, 255, 255, 0.05)',
                    },
                    '&:active': {
                      transform: 'scale(0.97)',
                    },
                  }}
                >
                  Log In
                </Button>
                <Button
                  variant="contained"
                  onClick={() => navigate('/register')}
                  sx={{
                    borderRadius: '9999px',
                    px: 2.5,
                    py: 0.8,
                    bgcolor: '#FFFFFF',
                    color: '#09090B',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    textTransform: 'none',
                    boxShadow: '0 2px 10px rgba(255, 255, 255, 0.12)',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    '&:hover': {
                      bgcolor: '#E4E4E7',
                      boxShadow: '0 4px 18px rgba(255, 255, 255, 0.22)',
                      transform: 'translateY(-1px)',
                    },
                    '&:active': {
                      transform: 'scale(0.97)',
                    },
                  }}
                >
                  Sign Up
                </Button>
              </>
            )}
          </Box>
        </Box>

        {/* ── 3. HERO & PROMPT CENTER ────────────────────────────────────────── */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            px: 2,
            py: { xs: 4, md: 8 },
            maxWidth: 880,
            mx: 'auto',
            width: '100%',
            animation: 'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          {/* Headline */}
          <Typography
            variant="h2"
            sx={{
              fontWeight: 600,
              fontSize: { xs: '1.75rem', sm: '2.25rem', md: '2.5rem' },
              color: '#F4F4F5',
              textAlign: 'center',
              letterSpacing: '-0.02em',
              mb: 4,
            }}
          >
            Dump your future knowledge
          </Typography>

          {/* ── MAIN PROMPT & SOURCES CARD ─────────────────────────────────────── */}
          <Paper
            elevation={0}
            sx={{
              width: '100%',
              borderRadius: 3.5,
              border: '1px solid #27272A',
              bgcolor: '#111114',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
              transition: 'border-color 0.2s ease, box-shadow 0.25s ease, transform 0.2s ease',
              '&:hover': {
                borderColor: '#3F3F46',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8)',
              },
              '&:focus-within': {
                borderColor: '#E4E4E7',
                boxShadow: '0 0 0 2px rgba(228, 228, 231, 0.25), 0 20px 48px -12px rgba(0, 0, 0, 0.85)',
              },
              p: 2.5,
              mb: 2.5,
            }}
          >
            {/* Attached Sources Badges Container */}
            {attachedSources.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                {attachedSources.map((source) => (
                  <Chip
                    key={source.id}
                    icon={getSourceIcon(source.type)}
                    label={`${source.type.toUpperCase()}: ${source.title}`}
                    onDelete={() => handleRemoveSource(source.id)}
                    deleteIcon={<X size={14} />}
                    size="small"
                    sx={{
                      bgcolor: '#18181B',
                      border: '1px solid #27272A',
                      color: '#F4F4F5',
                      fontWeight: 500,
                      fontSize: '0.75rem',
                      py: 0.5,
                      '& .MuiChip-deleteIcon': {
                        color: '#A1A1AA',
                        '&:hover': { color: '#EF4444' },
                      },
                    }}
                  />
                ))}
              </Box>
            )}

            {/* Prompt Text Input */}
            <Box
              component="textarea"
              rows={3}
              value={prompt}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Drop a link or a PDF/Doc to learn"
              sx={{
                width: '100%',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontFamily: 'inherit',
                fontSize: '1rem',
                lineHeight: 1.6,
                color: '#F4F4F5',
                bgcolor: 'transparent',
                '&::placeholder': {
                  color: '#71717A',
                },
              }}
            />

            {/* Bottom Actions Bar */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                pt: 1.5,
                borderTop: '1px solid #1C1C22',
                flexWrap: 'wrap',
                gap: 1.5,
              }}
            >
              {/* Left: Add Source + Reasoning + Quick Pickers */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                {/* Add Source Plus Button */}
                <Tooltip title="Attach Source Document or URL">
                  <IconButton
                    size="small"
                    onClick={(e) => setAddSourceAnchor(e.currentTarget)}
                    sx={{
                      bgcolor: '#18181B',
                      border: '1px solid #27272A',
                      color: '#A1A1AA',
                      '&:hover': { bgcolor: '#27272A', color: '#F4F4F5' },
                    }}
                  >
                    <Plus size={16} />
                  </IconButton>
                </Tooltip>

                {/* Source Selection Popover Menu */}
                <Menu
                  anchorEl={addSourceAnchor}
                  open={Boolean(addSourceAnchor)}
                  onClose={() => setAddSourceAnchor(null)}
                  PaperProps={{ sx: { minWidth: 200, mt: 1, borderRadius: 2, border: '1px solid #27272A', bgcolor: '#17171C' } }}
                >
                  <MenuItem
                    onClick={() => {
                      setAddSourceAnchor(null);
                      setSourceModalType('youtube');
                    }}
                    sx={{ gap: 1.5, fontSize: '0.875rem', color: '#F4F4F5', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' } }}
                  >
                    <Youtube size={18} color="#EF4444" />
                    Add YouTube Link
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setAddSourceAnchor(null);
                      fileInputRef.current?.click();
                    }}
                    sx={{ gap: 1.5, fontSize: '0.875rem', color: '#F4F4F5', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' } }}
                  >
                    <FileText size={18} color="#F59E0B" />
                    Upload PDF / Document
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setAddSourceAnchor(null);
                      setSourceModalType('github');
                    }}
                    sx={{ gap: 1.5, fontSize: '0.875rem', color: '#F4F4F5', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' } }}
                  >
                    <Github size={18} color="#F4F4F5" />
                    Add GitHub Repository
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setAddSourceAnchor(null);
                      setSourceModalType('docs');
                    }}
                    sx={{ gap: 1.5, fontSize: '0.875rem', color: '#F4F4F5', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' } }}
                  >
                    <Globe size={18} color="#E4E4E7" />
                    Add Docs / Website URL
                  </MenuItem>
                </Menu>

                {/* Reasoning Toggle */}
                <Button
                  size="small"
                  onClick={() => setReasoningEnabled(!reasoningEnabled)}
                  sx={{
                    borderRadius: '9999px',
                    px: 1.5,
                    py: 0.4,
                    fontSize: '0.8125rem',
                    textTransform: 'none',
                    color: reasoningEnabled ? '#F4F4F5' : '#A1A1AA',
                    bgcolor: reasoningEnabled ? 'rgba(168, 85, 247, 0.12)' : 'transparent',
                    border: '1px solid',
                    borderColor: reasoningEnabled ? 'rgba(168, 85, 247, 0.4)' : '#27272A',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    '&:hover': {
                      bgcolor: reasoningEnabled ? 'rgba(168, 85, 247, 0.2)' : '#18181B',
                      borderColor: reasoningEnabled ? 'rgba(168, 85, 247, 0.6)' : '#3F3F46',
                      transform: 'translateY(-1px)',
                    },
                    '&:active': {
                      transform: 'scale(0.97)',
                    },
                  }}
                  startIcon={<Brain size={15} color={reasoningEnabled ? '#A855F7' : '#71717A'} />}
                >
                  Reasoning
                </Button>

                {/* Quick Source Icons */}
                <Tooltip title="Paste YouTube Video">
                  <IconButton
                    size="small"
                    onClick={() => setSourceModalType('youtube')}
                    sx={{
                      color: '#71717A',
                      transition: 'all 0.15s ease',
                      '&:hover': { bgcolor: '#18181B', transform: 'scale(1.08)' },
                      '&:active': { transform: 'scale(0.92)' },
                    }}
                  >
                    <Youtube size={16} color="#EF4444" />
                  </IconButton>
                </Tooltip>

                <Tooltip title="Upload PDF">
                  <IconButton
                    size="small"
                    onClick={() => fileInputRef.current?.click()}
                    sx={{
                      color: '#71717A',
                      transition: 'all 0.15s ease',
                      '&:hover': { bgcolor: '#18181B', transform: 'scale(1.08)' },
                      '&:active': { transform: 'scale(0.92)' },
                    }}
                  >
                    <FileText size={16} color="#F59E0B" />
                  </IconButton>
                </Tooltip>

                <Tooltip title="GitHub Repository">
                  <IconButton
                    size="small"
                    onClick={() => setSourceModalType('github')}
                    sx={{
                      color: '#71717A',
                      transition: 'all 0.15s ease',
                      '&:hover': { bgcolor: '#18181B', transform: 'scale(1.08)' },
                      '&:active': { transform: 'scale(0.92)' },
                    }}
                  >
                    <Github size={16} color="#A855F7" />
                  </IconButton>
                </Tooltip>

                <Tooltip title="Documentation / Web URL">
                  <IconButton
                    size="small"
                    onClick={() => setSourceModalType('docs')}
                    sx={{
                      color: '#71717A',
                      transition: 'all 0.15s ease',
                      '&:hover': { bgcolor: '#18181B', transform: 'scale(1.08)' },
                      '&:active': { transform: 'scale(0.92)' },
                    }}
                  >
                    <Globe size={16} color="#38BDF8" />
                  </IconButton>
                </Tooltip>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {/* Send Button */}
                <IconButton
                  onClick={() => handleSubmit()}
                  disabled={!prompt.trim() && attachedSources.length === 0}
                  sx={{
                    width: 36,
                    height: 36,
                    bgcolor: (!prompt.trim() && attachedSources.length === 0) ? '#18181B' : '#FFFFFF',
                    color: (!prompt.trim() && attachedSources.length === 0) ? '#52525B' : '#09090B',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: (!prompt.trim() && attachedSources.length === 0) ? 'none' : '0 2px 10px rgba(255, 255, 255, 0.2)',
                    '&:hover': {
                      bgcolor: '#E4E4E7',
                      transform: 'scale(1.06)',
                      boxShadow: '0 4px 18px rgba(255, 255, 255, 0.3)',
                    },
                    '&:active': {
                      transform: 'scale(0.94)',
                    },
                    '&.Mui-disabled': { bgcolor: '#18181B', color: '#52525B' },
                  }}
                >
                  <ArrowUp size={18} />
                </IconButton>
              </Box>
            </Box>
          </Paper>

          {/* ── 4. QUICK SUGGESTION PILLS ─────────────────────────────────────── */}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.2,
              width: '100%',
            }}
          >
            {quickStarters.map((item, index) => (
              <Button
                key={index}
                size="small"
                onClick={() => {
                  if (item.action) {
                    item.action();
                  }
                  setPrompt((prev) => (prev ? `${prev} ${item.prompt}` : item.prompt));
                }}
                sx={{
                  borderRadius: '9999px',
                  px: 1.8,
                  py: 0.6,
                  bgcolor: '#111114',
                  color: '#D4D4D8',
                  border: '1px solid #27272A',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  textTransform: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.8,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  '&:hover': {
                    borderColor: '#3F3F46',
                    color: '#FFFFFF',
                    bgcolor: 'rgba(255, 255, 255, 0.05)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 6px 16px rgba(0, 0, 0, 0.6)',
                  },
                  '&:active': {
                    transform: 'scale(0.97)',
                  },
                }}
              >
                {item.isNew && (
                  <Chip
                    label="NEW"
                    size="small"
                    sx={{
                      height: 16,
                      fontSize: '0.625rem',
                      fontWeight: 700,
                      bgcolor: 'rgba(255, 255, 255, 0.12)',
                      color: '#F4F4F5',
                      mr: -0.2,
                    }}
                  />
                )}
                {item.icon}
                {item.label}
              </Button>
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── 5. MODAL DIALOGS FOR ADDING SOURCES ────────────────────────────────── */}
      <Dialog
        open={Boolean(sourceModalType)}
        onClose={() => setSourceModalType(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, p: 1, bgcolor: '#17171C', border: '1px solid #27272A' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1, color: '#F4F4F5' }}>
          {sourceModalType === 'youtube' && <Youtube size={22} color="#EF4444" />}
          {sourceModalType === 'github' && <Github size={22} color="#A855F7" />}
          {sourceModalType === 'docs' && <Globe size={22} color="#38BDF8" />}
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#F4F4F5' }}>
            {sourceModalType === 'youtube' && 'Add YouTube Video Link'}
            {sourceModalType === 'github' && 'Add GitHub Repository'}
            {sourceModalType === 'docs' && 'Add Documentation / Web Link'}
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, color: '#A1A1AA' }}>
            {sourceModalType === 'youtube' && 'Paste a YouTube video or playlist URL. The agent will fetch transcripts, chapters, and extract key insights.'}
            {sourceModalType === 'github' && 'Paste a public GitHub repo URL (e.g. https://github.com/facebook/react) to index the codebase.'}
            {sourceModalType === 'docs' && 'Paste any web page or documentation link to extract and ground answers against it.'}
          </Typography>

          <TextField
            autoFocus
            fullWidth
            placeholder={
              sourceModalType === 'youtube'
                ? 'https://www.youtube.com/watch?v=...'
                : sourceModalType === 'github'
                  ? 'https://github.com/owner/repository'
                  : 'https://docs.example.com'
            }
            value={sourceInputVal}
            onChange={(e) => setSourceInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (sourceInputVal.trim() && sourceModalType) {
                  handleAddSource(sourceModalType, sourceInputVal.trim(), sourceInputVal.trim());
                }
              }
            }}
          />
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSourceModalType(null)} color="inherit" sx={{ color: '#A1A1AA' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!sourceInputVal.trim()}
            onClick={() => {
              if (sourceInputVal.trim() && sourceModalType) {
                handleAddSource(sourceModalType, sourceInputVal.trim(), sourceInputVal.trim());
              }
            }}
            sx={{ borderRadius: '9999px', px: 2.5 }}
          >
            Attach Source
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}