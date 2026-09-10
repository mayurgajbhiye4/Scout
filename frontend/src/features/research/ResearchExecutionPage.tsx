import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { researchApi } from '@/api/research';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { ProgressSteps } from '@/components/ui/progress-steps';

const STATUS_STEPS = ['queued', 'planning', 'researching', 'finalizing', 'completed'];
const STATUS_LABELS = ['Queued', 'Planning Tasks', 'Gathering Evidence', 'Drafting Report', 'Complete'];

export default function ResearchExecutionPage() {
  const { workspaceId, sessionId } = useParams<{ workspaceId: string; sessionId: string }>();
  const navigate = useNavigate();

  const { data: session, isLoading } = useQuery({
    queryKey: ['research', workspaceId, sessionId],
    queryFn: () => researchApi.getSession(workspaceId!, sessionId!),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') return false;
      return 3000;
    },
  });

  useEffect(() => {
    if (session?.status === 'completed') {
      navigate(`/workspaces/${workspaceId}/research/${sessionId}/report`);
    }
  }, [session?.status, navigate, workspaceId, sessionId]);

  if (isLoading) {
    return <p className="text-sm text-[#A1A1AA]">Loading session details...</p>;
  }

  if (!session) {
    return <p className="text-sm text-[#EF4444]">Research session not found.</p>;
  }

  const activeStep = STATUS_STEPS.indexOf(session.status);

  return (
    <div className="max-w-2xl mx-auto">
      <Breadcrumb
        className="mb-8"
        items={[
          { label: 'Workspaces', href: '/dashboard' },
          { label: 'Workspace', href: `/workspaces/${workspaceId}` },
          { label: 'Research Execution' },
        ]}
      />

      <Card>
        <CardContent className="pt-8 pb-8 text-center">
          <h2 className="text-xl font-semibold text-[#F4F4F5] tracking-tight mb-2">{session.question}</h2>
          <p className="text-sm text-[#A1A1AA] mb-10">
            The autonomous agent is currently executing your research query. This may take a few minutes.
          </p>

          <ProgressSteps
            steps={STATUS_LABELS}
            activeStep={activeStep === -1 ? 0 : activeStep}
            className="mb-10 px-4"
          />

          {session.status === 'failed' && (
            <div className="mt-6 p-4 bg-red-950/30 border border-red-800/50 rounded-xl text-left">
              <h3 className="text-sm font-semibold text-red-300 mb-1">Research Failed</h3>
              <p className="text-xs text-red-400">{session.error_message}</p>
            </div>
          )}

          {session.status === 'completed' && (
            <Button asChild size="lg">
              <Link to={`/workspaces/${workspaceId}/research/${sessionId}/report`}>
                <FileText size={16} />
                View Report
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
