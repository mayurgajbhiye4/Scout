import React, { useState, useRef, useEffect } from 'react';

interface PromptStudioProps {
  onSubmit: (prompt: string) => void;
  suggestedPrompts?: string[];
}

export default function PromptStudio({ onSubmit, suggestedPrompts = [] }: PromptStudioProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) {
        onSubmit(input.trim());
        setInput('');
      }
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-3">
      {suggestedPrompts.length > 0 && (
        <div className="flex flex-wrap gap-2 animate-fade-in-up">
          {suggestedPrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={() => onSubmit(p)}
              className="text-xs font-medium px-3 py-1.5 rounded-none bg-[#18181b] border border-[#27272a] text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#202024] hover:border-[#2563eb] transition-colors duration-150 cursor-pointer"
            >
              {p}
            </button>
          ))}
        </div>
      )}
      
      <div 
        className={`relative flex flex-col bg-[#141416] border rounded-none transition-colors duration-150 ${
          isFocused 
            ? 'border-[#2563eb]' 
            : 'border-[#27272a] hover:border-[#3f3f46]'
        }`}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Ask anything or drop knowledge here..."
          className="w-full bg-transparent text-[#F4F4F5] placeholder-[#71717A] p-4 resize-none outline-none min-h-[56px] text-sm leading-relaxed"
          rows={1}
        />
        
        <div className="flex items-center justify-between p-3 border-t border-[#27272a]">
          <div className="flex gap-2 text-[#71717A]">
            <button className="p-1.5 rounded-none hover:bg-[#202024] hover:text-[#F4F4F5] transition-colors cursor-pointer" title="Attach file">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
            </button>
            <button className="p-1.5 rounded-none hover:bg-[#202024] hover:text-[#F4F4F5] transition-colors cursor-pointer" title="Web Search Fallback">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
            </button>
          </div>
          <button 
            onClick={() => { if (input.trim()) { onSubmit(input.trim()); setInput(''); } }}
            disabled={!input.trim()}
            className="bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:bg-[#202024] disabled:text-[#71717A] p-2 rounded-none transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
