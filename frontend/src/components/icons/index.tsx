import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import * as LucideAnimate from '@animateicons/react/lucide';
import * as HugeAnimate from '@animateicons/react/huge';

export interface AnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

export interface AnimatedIconProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
  color?: string;
  duration?: number;
  isAnimated?: boolean;
  className?: string;
}

export type LucideIcon = React.ForwardRefExoticComponent<
  AnimatedIconProps & React.RefAttributes<AnimatedIconHandle>
>;

/**
 * Higher-order component wrapping an AnimateIcons icon component:
 * 1. Forwards ref with startAnimation / stopAnimation handles
 * 2. Auto-triggers animation when the closest parent interactive element
 *    (button, anchor, pill, tab, menuitem, .group, etc.) is hovered
 * 3. Supports direct hover animations out of the box
 * 4. Ensures consistent sizing and CSS inheritance
 */
export function createAnimatedIcon(AnimateComponent: any): LucideIcon {
  const IconComponent = forwardRef<AnimatedIconHandle, AnimatedIconProps>((props, forwardedRef) => {
    const iconRef = useRef<AnimatedIconHandle | null>(null);
    const spanRef = useRef<HTMLSpanElement | null>(null);

    useImperativeHandle(forwardedRef, () => ({
      startAnimation: () => iconRef.current?.startAnimation?.(),
      stopAnimation: () => iconRef.current?.stopAnimation?.(),
    }));

    useEffect(() => {
      const span = spanRef.current;
      if (!span) return;

      // Find the closest interactive parent (e.g. button, pill, tab, link, group)
      const parent = span.closest<HTMLElement>(
        'button, a, [role="button"], [role="tab"], [role="menuitem"], .group, .pill, [data-interactive="true"]'
      );
      if (!parent) return;

      const onEnter = () => iconRef.current?.startAnimation?.();
      const onLeave = () => iconRef.current?.stopAnimation?.();

      parent.addEventListener('mouseenter', onEnter);
      parent.addEventListener('mouseleave', onLeave);

      return () => {
        parent.removeEventListener('mouseenter', onEnter);
        parent.removeEventListener('mouseleave', onLeave);
      };
    }, []);

    return (
      <span ref={spanRef} className="inline-flex items-center justify-center shrink-0">
        <AnimateComponent ref={iconRef} {...props} />
      </span>
    );
  });

  IconComponent.displayName = AnimateComponent?.displayName || 'AnimatedIcon';
  return IconComponent;
}

// ── Standard Lucide Animated Icons ──────────────────────────────────────────
export const ArrowLeft = createAnimatedIcon(LucideAnimate.ArrowLeft);
export const ArrowRight = createAnimatedIcon(LucideAnimate.ArrowRight);
export const ArrowUp = createAnimatedIcon(LucideAnimate.ArrowUp);
export const ArrowUpRight = createAnimatedIcon(LucideAnimate.ArrowUpRight);
export const BookOpen = createAnimatedIcon(LucideAnimate.BookOpen);
export const Bot = createAnimatedIcon(LucideAnimate.Bot);
export const Check = createAnimatedIcon(LucideAnimate.Check);
export const ChevronDown = createAnimatedIcon(LucideAnimate.ChevronDown);
export const ChevronRight = createAnimatedIcon(LucideAnimate.ChevronRight);
export const ChevronUp = createAnimatedIcon(LucideAnimate.ChevronUp);
export const Clock = createAnimatedIcon(LucideAnimate.Clock);
export const CloudUpload = createAnimatedIcon(LucideAnimate.CloudUpload);
export const Copy = createAnimatedIcon(LucideAnimate.Copy);
export const Database = createAnimatedIcon(LucideAnimate.Database);
export const ExternalLink = createAnimatedIcon(LucideAnimate.ExternalLink);
export const FileText = createAnimatedIcon(LucideAnimate.FileText);
export const Github = createAnimatedIcon(LucideAnimate.Github);
export const Globe = createAnimatedIcon(LucideAnimate.Globe);
export const Info = createAnimatedIcon(LucideAnimate.Info);
export const Layers = createAnimatedIcon(LucideAnimate.Layers);
export const LayoutGrid = createAnimatedIcon(LucideAnimate.LayoutGrid);
export const Link = createAnimatedIcon(LucideAnimate.Link);
export const List = createAnimatedIcon(LucideAnimate.List);
export const LogIn = createAnimatedIcon(LucideAnimate.LogIn);
export const LogOut = createAnimatedIcon(LucideAnimate.LogOut);
export const MessageSquare = createAnimatedIcon(LucideAnimate.MessageSquare);
export const Network = createAnimatedIcon(LucideAnimate.Network);
export const Plus = createAnimatedIcon(LucideAnimate.Plus);
export const RotateCw = createAnimatedIcon(LucideAnimate.RotateCw);
export const Search = createAnimatedIcon(LucideAnimate.Search);
export const Send = createAnimatedIcon(LucideAnimate.Send);
export const Sparkles = createAnimatedIcon(LucideAnimate.Sparkles);
export const Trash2 = createAnimatedIcon(LucideAnimate.Trash2);
export const User = createAnimatedIcon(LucideAnimate.User);
export const Volume2 = createAnimatedIcon(LucideAnimate.Volume2);
export const VolumeX = createAnimatedIcon(LucideAnimate.VolumeX);
export const X = createAnimatedIcon(LucideAnimate.X);
export const ZoomIn = createAnimatedIcon(LucideAnimate.ZoomIn);
export const ZoomOut = createAnimatedIcon(LucideAnimate.ZoomOut);

// ── Smart Mapped Animated Icons (Lucide modern & alternate equivalents) ─────
export const CircleAlert = createAnimatedIcon(LucideAnimate.CircleAlert);
export const AlertCircle = CircleAlert; // Direct animated replacement

export const TriangleAlert = createAnimatedIcon(LucideAnimate.TriangleAlert);
export const AlertTriangle = TriangleAlert; // Direct animated replacement

export const CircleCheck = createAnimatedIcon(LucideAnimate.CircleCheck);
export const CheckCircle = CircleCheck; // Direct animated replacement
export const CheckCircle2 = CircleCheck; // Direct animated replacement

export const Brain = createAnimatedIcon(LucideAnimate.Brain);
export const BrainCircuit = Brain; // Direct animated replacement

export const Kanban = createAnimatedIcon(LucideAnimate.Kanban);
export const FolderKanban = Kanban; // Direct animated replacement

export const LoaderCircle = createAnimatedIcon(LucideAnimate.LoaderCircle);
export const Loader2 = LoaderCircle; // Direct animated replacement
export const Loader = LoaderCircle;

// ── Huge Icons Animated Variants ────────────────────────────────────────────
export const MaximizeScreen = createAnimatedIcon(HugeAnimate.MaximizeScreen);
export const Maximize2 = MaximizeScreen; // Direct animated replacement

export const Stop = createAnimatedIcon(HugeAnimate.Stop);
export const Square = Stop; // Direct animated replacement for stop/square

export const Youtube = createAnimatedIcon(HugeAnimate.Youtube);
