import { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Send, ArrowLeft, Bot } from 'lucide-react';
import { sessionsApi } from '@/api/sessions';
import { chatApi, ChatMessage } from '@/api/chat';
import { soundEffects } from '@/lib/soundEffects';
import { Button } from '@/components/ui/button';

export default function ResearchExecutionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: session } = useQuery({
    queryKey: ['sessions', sessionId],
    queryFn: () => sessionsApi.getSession(sessionId!),
    enabled: !!sessionId,
  });

  const { data: initialMessages } = useQuery({
    queryKey: ['chat', sessionId],
    queryFn: () => chatApi.getMessages(sessionId!),
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (initialMessages) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isStreaming]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !sessionId || isStreaming) return;

    const userMsg = input.trim();
    setInput('');

    // Optimistic UI for user message
    const tempUserMsg: ChatMessage = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      role: 'user',
      content: userMsg,
      status: 'sent',
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, tempUserMsg]);
    setIsStreaming(true);

    try {
      const token = localStorage.getItem('token');
      // We simulate streaming since standard apiClient doesn't easily handle SSE Streams here without fetch.
      const response = await fetch(`http://localhost:8000/api/v1/chat/sessions/${sessionId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ content: userMsg, force_web_search: false })
      });

      if (!response.body) throw new Error("No body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let asstContent = "";
      let tempAsstMsg: ChatMessage = {
        id: crypto.randomUUID(),
        session_id: sessionId,
        role: 'assistant',
        content: "",
        status: 'streaming',
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, tempAsstMsg]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '');
            if (!dataStr) continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.delta) {
                asstContent += data.delta;
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = { ...tempAsstMsg, content: asstContent, status: 'streaming' };
                  return newMsgs;
                });
              } else if (data.content || data.done) {
                soundEffects.playStreamComplete();
                asstContent = data.content || asstContent;
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = { ...tempAsstMsg, content: asstContent, status: 'completed' };
                  return newMsgs;
                });
              }
            } catch (e) {
              console.error("SSE parse error", e);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[#0d0d0f]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 shrink-0 border-b border-[#27272a] bg-[#141416]">
        <div className="flex items-center gap-3">
          <Link to="/sessions">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none border border-[#27272a] bg-[#18181b] hover:bg-[#202024]">
              <ArrowLeft size={16} className="text-[#3b82f6]" />
            </Button>
          </Link>
          <div>
            <h2 className="font-semibold text-[#f4f4f5] text-sm sm:text-base">{session?.title || 'Chat Session'}</h2>
            <p className="text-xs text-[#71717a] capitalize">{session?.mode?.replace('_', ' ')} Mode</p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-6 sidebar-scroll"
      >
        <div className="max-w-3xl lg:max-w-4xl mx-auto w-full space-y-5">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-[#71717a] py-16">
              <div className="w-12 h-12 rounded-none bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-3">
                <Bot size={22} className="text-[#3b82f6]" />
              </div>
              <p className="text-xs">Start chatting with your sources...</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-none bg-[#18181b] border border-[#27272a] flex items-center justify-center shrink-0 mt-0.5 text-[#2563eb]">
                  <Bot size={15} />
                </div>
              )}
              <div
                className={`max-w-[85%] sm:max-w-[78%] rounded-none px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                    ? 'bg-[#202024] text-[#f4f4f5] border border-[#2e2e33]'
                    : 'bg-[#141416] text-[#e4e4e7] border border-[#27272a]'
                  }`}
              >
                <div className="whitespace-pre-wrap">{msg.content || (isStreaming && i === messages.length - 1 ? '...' : '')}</div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input Area */}
      <footer className="shrink-0 p-4 border-t border-[#27272a] bg-[#141416]">
        <div className="max-w-3xl lg:max-w-4xl mx-auto w-full">
          <form onSubmit={handleSubmit} className="relative flex flex-col rounded-none bg-[#18181b] border border-[#27272a] focus-within:border-[#2563eb] p-3 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your sources..."
              className="w-full min-h-[48px] max-h-[140px] bg-transparent text-sm text-[#f4f4f5] placeholder-[#71717a] focus:outline-none resize-none leading-relaxed"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <div className="flex justify-end pt-2 mt-1 border-t border-[#27272a]">
              <Button
                type="submit"
                size="sm"
                disabled={!input.trim() || isStreaming}
                className="rounded-none bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-3 cursor-pointer"
              >
                <Send size={14} className="mr-1.5" />
                <span>Send</span>
              </Button>
            </div>
          </form>
        </div>
      </footer>
    </div>
  );
}
