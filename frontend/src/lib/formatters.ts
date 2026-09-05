/**
 * Date and status formatting utilities.
 */

import { formatDistanceToNow } from 'date-fns';

export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return dateString;
  }
}

export function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return '';
  }
}

export function formatStatusLabel(status: string): string {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'Completed';
    case 'researching':
      return 'Researching';
    case 'planning':
      return 'Planning';
    case 'finalizing':
      return 'Finalizing';
    case 'failed':
      return 'Failed';
    case 'queued':
      return 'Queued';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
