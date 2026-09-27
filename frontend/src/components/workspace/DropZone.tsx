import React, { useState, useEffect } from 'react';

interface DropZoneProps {
  onDropSource: (content: string, type: 'file' | 'text') => void;
  children: React.ReactNode;
}

export default function DropZone({ onDropSource, children }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // Handle file drop
      const file = e.dataTransfer.files[0];
      if (file) {
        onDropSource(file.name, 'file');
      }
    } else {
      // Handle text/URL drop
      const text = e.dataTransfer.getData('text');
      if (text) {
        onDropSource(text, 'text');
      }
    }
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text');
      if (text) {
        onDropSource(text, 'text');
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [onDropSource]);

  return (
    <div
      className="relative flex-1 min-h-0 w-full flex flex-col items-center justify-center"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#111114]/85 backdrop-blur-md border-[2px] border-dashed border-[#6A89A7] rounded-xl transition-all duration-200 ease-in-out">
          <div className="flex flex-col items-center animate-fade-in-up">
            <svg
              className="w-16 h-16 text-[#6A89A7] mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-xl font-semibold text-[#F4F4F5] tracking-tight">Drop Knowledge Source</p>
            <p className="text-[#A1A1AA] text-sm mt-1">PDFs, URLs, YouTube, GitHub or Text</p>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
