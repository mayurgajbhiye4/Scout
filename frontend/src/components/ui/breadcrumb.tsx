import * as React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: React.ReactNode;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="breadcrumb" className={cn('flex items-center gap-1 text-sm', className)}>
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <ChevronRight size={14} className="text-[#71717A] shrink-0" />}
          {item.href ? (
            <Link
              to={item.href}
              className="text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-[#F4F4F5] font-medium">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export { Breadcrumb };
export type { BreadcrumbItem };
