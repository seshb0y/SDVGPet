import { z } from 'zod';
import { NEEDS } from '../core/types.js';
import { SettingsInput } from '../services/settings.js';

const Need = z.enum(NEEDS);
const Title = z.string().trim().min(1).max(200);
const Id = z.number().int().positive();
const DueAt = z.iso.datetime({ offset: true }).nullable();
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Days = z.number().int().min(1).max(127);
const op = <T extends string>(name: T) => z.literal(name);

export const RpcRequest = z.discriminatedUnion('op', [
  z.object({ op: op('state') }),
  z.object({ op: op('tasks.list') }),
  z.object({ op: op('tasks.create'), title: Title, need: Need, dueAt: DueAt.optional() }),
  z.object({ op: op('tasks.update'), id: Id, title: Title.optional(), need: Need.optional(), dueAt: DueAt.optional() }),
  z.object({ op: op('tasks.delete'), id: Id }),
  z.object({ op: op('tasks.complete'), id: Id }),
  z.object({ op: op('routines.list') }),
  z.object({ op: op('routines.create'), title: Title, need: Need, time: Time, days: Days }),
  z.object({
    op: op('routines.update'),
    id: Id,
    title: Title.optional(),
    need: Need.optional(),
    time: Time.optional(),
    days: Days.optional(),
    active: z.boolean().optional(),
  }),
  z.object({ op: op('routines.delete'), id: Id }),
  z.object({ op: op('routines.complete'), id: Id }),
  z.object({ op: op('settings.get') }),
  z.object({ op: op('settings.update'), settings: SettingsInput }),
  z.object({ op: op('rewards.list') }),
  z.object({ op: op('photo'), id: Id }),
]);

export type RpcRequest = z.infer<typeof RpcRequest>;
