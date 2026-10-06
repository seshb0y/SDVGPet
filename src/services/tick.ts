import { planTick, type Outgoing } from '../core/schedule/plan.js';
import { localTime } from '../core/time.js';
import type { Settings } from '../core/types.js';
import type { Db } from '../db/client.js';
import { claimOutbox, getOutboxToday, markFollowedUp, releaseOutbox } from '../db/outbox.js';
import {
  claimRoutine,
  claimRoutineResend,
  countRoutinesDoneOn,
  getRoutineLog,
  listRoutines,
  type RoutineRecord,
  releaseRoutine,
  restoreSnooze,
} from '../db/routines.js';
import { listDoneSince, listOpenTasks } from '../db/tasks.js';
import { loadCurrentNeeds } from './completion.js';
import {
  eveningMessage,
  morningMessage,
  needMessage,
  type OutgoingMessage,
  routineMessage,
  type Sender,
} from './messages.js';

export interface TickDeps {
  db: Db;
  send: Sender;
  now: Date;
  random: () => number;
  miniAppUrl: string;
}

export interface TickReport {
  sent: number;
  failed: number;
}

interface TickContext extends TickDeps {
  settings: Settings;
  date: string;
  weekday: number;
  routines: readonly RoutineRecord[];
}

type Delivery = 'sent' | 'failed' | 'skipped';
const MS_PER_HOUR = 3_600_000;

async function trySend(ctx: TickContext, message: OutgoingMessage, kind: string): Promise<boolean> {
  try {
    await ctx.send(message);
    return true;
  } catch (error) {
    console.error(`[tick] не удалось отправить ${kind}`, error);
    return false;
  }
}

async function deliverRoutine(ctx: TickContext, item: Extract<Outgoing, { kind: 'routine' }>): Promise<Delivery> {
  const { db, now, date } = ctx;
  const routine = ctx.routines.find((r) => r.id === item.routineId);
  if (!routine) return 'skipped';
  const claimed = item.resend
    ? await claimRoutineResend(db, routine.id, date, now)
    : await claimRoutine(db, routine.id, date, now);
  if (!claimed) return 'skipped';
  if (await trySend(ctx, routineMessage(routine, date, now, ctx.settings, ctx.random), 'routine')) return 'sent';
  if (item.resend) await restoreSnooze(db, routine.id, date, now);
  else await releaseRoutine(db, routine.id, date);
  return 'failed';
}

async function doneToday(ctx: TickContext): Promise<number> {
  const recent = await listDoneSince(ctx.db, new Date(ctx.now.getTime() - 36 * MS_PER_HOUR));
  const tasks = recent.filter((t) => t.doneAt && localTime(t.doneAt, ctx.settings.timezone).date === ctx.date);
  return tasks.length + (await countRoutinesDoneOn(ctx.db, ctx.date));
}

async function cappedMessage(ctx: TickContext, item: Exclude<Outgoing, { kind: 'routine' }>): Promise<OutgoingMessage> {
  if (item.kind === 'morning') {
    const today = ctx.routines.filter((r) => r.active && (r.days & (1 << ctx.weekday)) !== 0);
    return morningMessage(today, ctx.miniAppUrl, ctx.random);
  }
  if (item.kind === 'evening') return eveningMessage(await doneToday(ctx), ctx.random);
  const needItem = item as Extract<Outgoing, { kind: 'need' | 'followup' }>;
  const suggestion = (await listOpenTasks(ctx.db)).find((t) => t.need === needItem.need) ?? null;
  return needMessage(needItem.need, suggestion, ctx.random, item.kind === 'followup');
}

async function deliverCapped(ctx: TickContext, item: Exclude<Outgoing, { kind: 'routine' }>): Promise<Delivery> {
  const need = item.kind === 'need' || item.kind === 'followup' ? (item as any).need : null;
  const id = await claimOutbox(ctx.db, { dedupKey: item.dedupKey, kind: item.kind, need, localDate: ctx.date, now: ctx.now });
  if (id === null) return 'skipped';
  if (!(await trySend(ctx, await cappedMessage(ctx, item), item.kind))) {
    await releaseOutbox(ctx.db, id);
    return 'failed';
  }
  if (item.kind === 'followup') await markFollowedUp(ctx.db, item.parentId);
  return 'sent';
}

export async function runTick(deps: TickDeps): Promise<TickReport> {
  const { db, now } = deps;
  const { needs, settings } = await loadCurrentNeeds(db, now);
  const local = localTime(now, settings.timezone);
  const [routines, routineLog, outboxToday] = await Promise.all([
    listRoutines(db),
    getRoutineLog(db, local.date),
    getOutboxToday(db, local.date),
  ]);
  const plan = planTick({ now, settings, needs, routines, routineLog, outboxToday });
  const ctx: TickContext = { ...deps, settings, date: local.date, weekday: local.weekday, routines };

  const report: TickReport = { sent: 0, failed: 0 };
  for (const item of plan) {
    const result = item.kind === 'routine' ? await deliverRoutine(ctx, item) : await deliverCapped(ctx, item);
    if (result === 'sent') report.sent++;
    if (result === 'failed') report.failed++;
  }
  return report;
}
