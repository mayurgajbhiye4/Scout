import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { researchApi, ResearchCreateData } from '@/api/research';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    createMutation.mutate({ question, research_depth: depth });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Breadcrumb
        className="mb-8"
        items={[
          { label: 'Workspaces', href: '/dashboard' },
          { label: 'Workspace', href: `/workspaces/${workspaceId}` },
          { label: 'New Research' },
        ]}
      />

      <h1 className="text-3xl font-bold text-[#F4F4F5] tracking-tight mb-1">Start Research</h1>
      <p className="text-sm text-[#A1A1AA] mb-8">
        Ask a question or describe a topic. The AI will autonomously gather evidence from your sources and the web to draft a comprehensive report.
      </p>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="block text-sm text-[#A1A1AA] mb-1.5">What do you want to research?</label>
              <Textarea
                placeholder="e.g., How do the latest transformer architectures optimize inference latency?"
                rows={5}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                autoFocus
                required
                className="resize-none"
              />
              <p className="text-xs text-[#71717A] mt-1.5">Be as specific as possible for better results.</p>
            </div>

            <div>
              <label className="block text-sm text-[#A1A1AA] mb-1.5">Research Depth</label>
              <Select value={depth} onValueChange={(v) => setDepth(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select depth" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick">Quick (1–2 iterations, fast)</SelectItem>
                  <SelectItem value="standard">Standard (Balanced thoroughness)</SelectItem>
                  <SelectItem value="deep">Deep Dive (Exhaustive search and synthesis)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end mt-2">
              <Button
                type="submit"
                size="lg"
                disabled={question.length < 5 || createMutation.isPending}
              >
                <Sparkles size={16} />
                {createMutation.isPending ? 'Starting Engine...' : 'Begin Autonomous Research'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
