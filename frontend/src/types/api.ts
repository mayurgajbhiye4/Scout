/**
 * Unified API Response and Error Interfaces.
 */

export interface ApiResponse<T> {
  data: T;
  meta: Record<string, unknown>;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginationMeta {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
