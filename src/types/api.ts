export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string | ApiValidationError[];
}

export interface ApiValidationError {
  code: string;
  message: string;
  path: (string | number)[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}
