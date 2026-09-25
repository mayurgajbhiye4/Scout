import React from 'react';

interface Node {
  id: string;
  label: string;
  type: 'concept' | 'source' | 'person' | 'technology';
}

interface CuriosityMapProps {
  nodes?: Node[];
}

export default function CuriosityMap({ nodes = [] }: CuriosityMapProps) {
  // A simple structured list / pill visualization of the user's mindmap for MVP
  // Ideally this would be a force-graph but pills are cleaner initially
  
  if (nodes.length === 0) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-12 text-[#71717A]">
        <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
        <p className="text-sm">Your memory graph is empty.</p>
        <p className="text-xs mt-1">Drop a source to start building your brain.</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#111114] border border-[#27272A] rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-[#F4F4F5] mb-4 tracking-wide">Curiosity Map</h3>
      <div className="flex flex-wrap gap-2">
        {nodes.map(node => (
          <div 
            key={node.id} 
            className="flex items-center gap-1.5 bg-[#1C1C22] border border-[#3F3F46] rounded-full px-3 py-1.5 transition-transform hover:-translate-y-0.5 cursor-default"
          >
            {node.type === 'concept' && <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />}
            {node.type === 'source' && <span className="w-2 h-2 rounded-full bg-[#6A89A7]" />}
            {node.type === 'person' && <span className="w-2 h-2 rounded-full bg-[#10B981]" />}
            {node.type === 'technology' && <span className="w-2 h-2 rounded-full bg-[#E11D48]" />}
            <span className="text-xs font-medium text-[#F4F4F5]">{node.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
