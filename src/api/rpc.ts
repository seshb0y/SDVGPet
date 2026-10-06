import { ZodError } from 'zod';
import type { Db } from '../db/client.js';
import { getUnlockedPhoto } from '../db/rewards.js';
import { createRoutine, deleteRoutine, listRoutines, updateRoutine } from '../db/routines.js';
import { getSettings, saveSettings } from '../db/state.js';
import { createTask, deleteTask, listTasksSince, updateTask } from '../db/tasks.js';
import { completeRoutine, completeTask } from '../services/completion.js';
import type { OutgoingMessage } from '../services/messages.js';
import { parseSettings } from '../services/settings.js';
import { verifyInitData } from './initData.js';
import { finish, rewards, state, today } from './rpcQueries.js';
import { RpcRequest } from './rpcSchema.js';

export interface RpcDeps {
  db: Db;
  botToken: string;
  allowedUserIds: readonly number[];
  now: Date;
  notify: (chatId: number, messages: OutgoingMessage[]) => Promise<void>;
  fetchPhoto: (fileId: string) => Promise<Response>;
}

class NotFound extends Error {}

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });
const found = <T>(value: T | null): T => {
  if (value === null) throw new NotFound();
  return value;
};
const dueDate = (value: string | null | undefined) => (value == null ? value : new Date(value));

async function dispatch(request: RpcRequest, deps: RpcDeps, userId: number): Promise<unknown> {
  const { db, now } = deps;
  switch (request.op) {
    case 'state':
      return state(deps);
    case 'tasks.list':
      return listTasksSince(db, (await today(deps)).since);
    case 'tasks.create':
      return createTask(db, { title: request.title, need: request.need, dueAt: dueDate(request.dueAt) ?? null });
    case 'tasks.update': {
      const { id, op: _op, dueAt, ...patch } = request;
      return found(await updateTask(db, id, dueAt === undefined ? patch : { ...patch, dueAt: dueDate(dueAt) ?? null }));
    }
    case 'tasks.delete':
      return found((await deleteTask(db, request.id)) ? { deleted: true } : null);
    case 'tasks.complete':
      return finish(deps, userId, await completeTask(db, request.id, now));
    case 'routines.list':
      return listRoutines(db);
    case 'routines.create':
      return createRoutine(db, request);
    case 'routines.update': {
      const { id, op: _op, ...patch } = request;
      return found(await updateRoutine(db, id, patch));
    }
    case 'routines.delete':
      return found((await deleteRoutine(db, request.id)) ? { deleted: true } : null);
    case 'routines.complete':
      return finish(deps, userId, await completeRoutine(db, request.id, (await today(deps)).date, now));
    case 'settings.get':
      return getSettings(db);
    case 'settings.update': {
      const settings = parseSettings(request.settings);
      await saveSettings(db, settings);
      return settings;
    }
    case 'rewards.list':
      return rewards(deps);
    case 'photo':
      return found(await getUnlockedPhoto(db, request.id));
  }
}

export async function handleRpc(req: Request, deps: RpcDeps): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  const verified = auth.startsWith('tma ') ? verifyInitData(auth.slice(4), deps.botToken, deps.now) : null;
  if (!verified || !deps.allowedUserIds.includes(verified.userId)) return fail(401, 'unauthorized');

  try {
    const request = RpcRequest.parse(await req.json());
    const result = await dispatch(request, deps, verified.userId);
    if (request.op === 'photo') {
      const fileId = (result as { fileId: string | null }).fileId;
      return fileId ? deps.fetchPhoto(fileId) : fail(404, 'not_found');
    }
    return Response.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return fail(400, 'bad_request');
    if (error instanceof NotFound) return fail(404, 'not_found');
    console.error('[rpc] ошибка', error);
    return fail(500, 'internal');
  }
}
