import { getInitData, isDevPreview } from '../telegram';
import { httpApi } from './client';
import type { Api } from './types';

export async function createApi(): Promise<Api> {
  if (isDevPreview()) return (await import('./mock')).mockApi();
  return httpApi(getInitData());
}
