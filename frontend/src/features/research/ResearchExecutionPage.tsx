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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    <div className="flex flex-col h-[calc(100vh-100px)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/5">
        <Link to="/sessions">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
            <ArrowLeft size={16} />
          </Button>
        </Link>
        <div>
          <h2 className="font-medium text-foreground">{session?.title || 'Chat Session'}</h2>
          <p className="text-xs text-muted-foreground capitalize">{session?.mode?.replace('_', ' ')} Mode</p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto rounded-xl bg-card border border-border p-4 mb-4 space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <Bot size={40} className="mb-4 opacity-50" />
            <p>Start chatting with your sources...</p>
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
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user' 
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
            className="w-full min-h-[56px] max-h-[200px] rounded-2xl bg-card border border-border pl-4 pr-14 py-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none shadow-sm"
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
            className="absolute right-2 bottom-2 h-10 w-10 rounded-xl"
          >
            <Send size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
}
