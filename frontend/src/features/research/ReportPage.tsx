import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, CheckCircle2 } from 'lucide-react';
import { researchApi } from '@/api/research';
import MarkdownRenderer from '@/components/common/MarkdownRenderer';
import { format } from 'date-fns';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function ReportPage() {
  const { workspaceId, sessionId } = useParams<{ workspaceId: string; sessionId: string }>();

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
    return <p className="text-sm text-[#A1A1AA]">Loading report...</p>;
  }

  return (
    <div>
      <Breadcrumb
        className="mb-6"
        items={[
          { label: 'Workspaces', href: '/dashboard' },
          { label: 'Workspace', href: `/workspaces/${workspaceId}` },
          { label: 'Research Report' },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#F4F4F5] tracking-tight mb-1">
          {report?.title || 'Research Report'}
        </h1>
        <p className="text-sm text-[#A1A1AA]">Based on query: "{session?.question}"</p>
        {session?.completed_at && !isNaN(new Date(session.completed_at).getTime()) && (
          <p className="text-xs text-[#71717A] mt-1">
            Generated {format(new Date(session.completed_at), 'PPP pp')}
          </p>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Report content */}
        <Card className="flex-[2]">
          <CardContent className="pt-6">
            {report?.content_markdown ? (
              <MarkdownRenderer content={report.content_markdown} />
            ) : (
              <p className="text-sm text-[#A1A1AA]">No report content available.</p>
            )}
          </CardContent>
        </Card>

        {/* Evidence sidebar */}
        <Card className="lg:flex-[1] lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto self-start">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-5">
              <FileText size={18} className="text-[#818CF8]" />
              <h2 className="text-base font-semibold text-[#F4F4F5]">Evidence & Citations</h2>
            </div>

            <div className="flex flex-col gap-5">
              {evidence?.map((item, idx) => (
                <div key={item.id} className="border-l-2 border-[#818CF8] pl-3">
                  <p className="text-sm font-medium text-[#F4F4F5] mb-1">
                    [{idx + 1}] {item.claim}
                  </p>
                  <p className="text-xs text-[#A1A1AA] italic mb-2">"{item.supporting_excerpt}"</p>
                  <Badge variant={item.confidence > 0.8 ? 'success' : 'default'}>
                    <CheckCircle2 size={10} />
                    {Math.round(item.confidence * 100)}% Confidence
                  </Badge>
                </div>
              ))}

              {(!evidence || evidence.length === 0) && (
                <p className="text-sm text-[#A1A1AA]">No explicit evidence chunks found for this report.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
