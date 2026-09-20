import { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Send, ArrowLeft, Bot } from 'lucide-react';
import { sessionsApi } from '@/api/sessions';
import { chatApi, ChatMessage } from '@/api/chat';
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
              if (data.content) {
                asstContent = data.content;
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
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0 mb-3 pb-3 border-b border-border/40">
        <Link to="/sessions">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <div>
          <h2 className="font-medium text-foreground text-sm sm:text-base">{session?.title || 'Chat Session'}</h2>
          <p className="text-xs text-muted-foreground capitalize">{session?.mode?.replace('_', ' ')} Mode</p>
        </div>
      </div>

      {/* Messages Area */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 min-h-0 overflow-y-auto rounded-2xl bg-card border border-border p-4 sm:p-6 mb-3 space-y-5 shadow-sm"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <Bot size={40} className="mb-4 opacity-50" />
            <p className="text-sm">Start chatting with your sources...</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-1">
                <Bot size={16} className="text-primary" />
              </div>
            )}
            <div
              className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                  ? 'bg-[#F4F4F5] text-[#18181B]'
                  : 'bg-muted/50 text-foreground border border-border/50'
                }`}
            >
              <div className="whitespace-pre-wrap">{msg.content || (isStreaming && i === messages.length - 1 ? '...' : '')}</div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 relative">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your sources..."
            className="w-full min-h-[52px] max-h-[140px] rounded-2xl bg-card border border-border pl-4 pr-14 py-3.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none shadow-sm placeholder:text-muted-foreground/60"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isStreaming}
            className="absolute right-2 bottom-2 h-9 w-9 rounded-xl cursor-pointer"
          >
            <Send size={15} />
          </Button>
        </form>
      </div>
    </div>
  );
}
