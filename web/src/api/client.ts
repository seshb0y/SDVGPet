import type { Api } from './types';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

const browserFetch: FetchLike = (url, init) => fetch(url, init);

export function httpApi(initData: string, fetchImpl: FetchLike = browserFetch): Api {
  async function post(body: object): Promise<Response> {
    const res = await fetchImpl('/api/app', {
      method: 'POST',
      headers: { authorization: `tma ${initData}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res;
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, json?.error ?? 'network');
  }

  async function call<T>(body: object): Promise<T> {
    const json = (await (await post(body)).json()) as { data: T };
    return json.data;
  }

  return {
    state: () => call({ op: 'state' }),
    listTasks: () => call({ op: 'tasks.list' }),
    createTask: (input) => call({ op: 'tasks.create', ...input }),
    updateTask: (id, patch) => call({ op: 'tasks.update', id, ...patch }),
    deleteTask: async (id) => {
      await call({ op: 'tasks.delete', id });
    },
    completeTask: (id) => call({ op: 'tasks.complete', id }),
    listRoutines: () => call({ op: 'routines.list' }),
    createRoutine: (input) => call({ op: 'routines.create', ...input }),
    updateRoutine: (id, patch) => call({ op: 'routines.update', id, ...patch }),
    deleteRoutine: async (id) => {
      await call({ op: 'routines.delete', id });
    },
    completeRoutine: (id) => call({ op: 'routines.complete', id }),
    updateSettings: (settings) => call({ op: 'settings.update', settings }),
    rewards: () => call({ op: 'rewards.list' }),
    photo: async (id) => (await post({ op: 'photo', id })).blob(),
  };
}
