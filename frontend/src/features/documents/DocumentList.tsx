/**
 * DocumentList component displaying uploaded workspace documents with status badges.
 */

import { Trash2, Globe, Youtube, Github, FileText } from 'lucide-react';
import { DocumentItem, SourceType } from '@/types';
import { formatDate } from '@/lib/formatters';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DocumentListProps {
  documents: DocumentItem[];
  onDelete?: (id: string) => void;
}

function getSourceIcon(type: SourceType) {
  switch (type) {
    case 'url': return <Globe size={15} className="text-[#38BDF8]" />;
    case 'youtube': return <Youtube size={15} className="text-[#EF4444]" />;
    case 'github': return <Github size={15} className="text-[#A1A1AA]" />;
    default: return <FileText size={15} className="text-[#71717A]" />;
  }
}

function getStatusVariant(status: string): 'success' | 'info' | 'error' | 'default' {
  switch (status) {
    case 'completed': return 'success';
    case 'processing': return 'info';
    case 'failed': return 'error';
    default: return 'default';
  }
}

export default function DocumentList({ documents, onDelete }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-[#A1A1AA]">
            No documents uploaded yet. Add PDFs, URLs, or repository sources.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-[#27272A]">
        {documents.map((doc, idx) => (
          <li
            key={doc.id}
            className={cn(
              'flex items-center gap-4 px-5 py-4',
              idx === 0 && 'pt-5',
              idx === documents.length - 1 && 'pb-5'
            )}
          >
            <span className="shrink-0">{getSourceIcon(doc.source_type)}</span>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#F4F4F5] truncate">{doc.filename}</p>
              <p className="text-xs text-[#71717A] truncate mt-0.5">
                {doc.url ? `${doc.url} • ` : ''}Added {formatDate(doc.created_at)}
              </p>
            </div>

            <Badge variant={getStatusVariant(doc.status)}>{doc.status}</Badge>

            {onDelete && (
              <button
                onClick={() => onDelete(doc.id)}
                aria-label="Delete"
                className="shrink-0 p-1.5 rounded-lg text-[#71717A] hover:text-[#EF4444] hover:bg-red-950/30 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
