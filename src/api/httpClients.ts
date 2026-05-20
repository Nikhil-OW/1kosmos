import type { APIRequestContext, APIResponse } from '@playwright/test';

export interface ApiResponse<T> {
  _id?: string;
  data: T;
  status: number;
  code?: number;
  message?: string;
  [key: string]: unknown;
}

export class HttpClients {
  constructor(
    private readonly request: APIRequestContext,
    private readonly defaultHeaders: Record<string, string> = {}
  ) { }

  private async requestWrapper<T>(method: 'put' | 'delete' | 'post' | 'get' | 'patch', path: string, data?: unknown, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    const requestOptions: Parameters<APIRequestContext['get']>[1] = {
      headers: { ...this.defaultHeaders, ...headers }
    };

    if (method !== 'get') {
      requestOptions.data = data;
    }

    const response = await this.request[method](path, requestOptions);
    const contentType = response.headers()['content-type'] ?? '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    const status = response.status();

    if (status >= 400) {
      const errorText = await response.text();
      console.error(`❌ API FAILURE [${status}] at ${path}`);
      console.error(`❌ SERVER MESSAGE: ${errorText}`);
    }

    return {
      data: body as T,
      status: status,
    };
  }

  async put<T>(path: string, data: unknown, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.requestWrapper<T>('put', path, data, headers);
  }

  async delete<T>(path: string, data?: unknown, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.requestWrapper<T>('delete', path, data, headers);
  }

  async post<T>(path: string, data: unknown, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.requestWrapper<T>('post', path, data, headers);
  }

  async get<T>(path: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.requestWrapper<T>('get', path, undefined, headers);
  }

  async patch<T>(path: string, data: unknown, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.requestWrapper<T>('patch', path, data, headers);
  }
}
