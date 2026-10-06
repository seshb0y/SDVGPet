import type { PetState } from '../../../src/core/mood';
import type { Need, Needs, Settings } from '../../../src/core/types';

export type { Need, Needs, PetState, Settings };

export interface Task {
  id: number;
  title: string;
  need: Need | null;
  dueAt: string | null;
  doneAt: string | null;
  createdAt: string;
}

export interface Routine {
  id: number;
  title: string;
  need: Need;
  time: string;
  /** Битовая маска: бит 0 = понедельник … бит 6 = воскресенье. */
  days: number;
  active: boolean;
}

export interface RoutineToday {
  id: number;
  title: string;
  time: string;
  need: Need;
  done: boolean;
}

export interface AppState {
  needs: Needs;
  mood: PetState;
  settings: Settings;
  tasks: Task[];
  routinesToday: RoutineToday[];
}

export interface CompleteResult {
  completed: boolean;
  needs: Needs;
}

export interface Rewards {
  notes: { id: number; text: string | null; unlockedAt: string }[];
  photos: { id: number; caption: string | null; unlockedAt: string }[];
  lockedPhotos: number;
  nextPhotoIn: number;
}

export interface TaskInput {
  title: string;
  need: Need;
  dueAt?: string | null;
}

export interface RoutineInput {
  title: string;
  need: Need;
  time: string;
  days: number;
}

export type RoutinePatch = Partial<RoutineInput & { active: boolean }>;

export interface Api {
  state(): Promise<AppState>;
  listTasks(): Promise<Task[]>;
  createTask(input: TaskInput): Promise<Task>;
  updateTask(id: number, patch: Partial<TaskInput>): Promise<Task>;
  deleteTask(id: number): Promise<void>;
  completeTask(id: number): Promise<CompleteResult>;
  listRoutines(): Promise<Routine[]>;
  createRoutine(input: RoutineInput): Promise<Routine>;
  updateRoutine(id: number, patch: RoutinePatch): Promise<Routine>;
  deleteRoutine(id: number): Promise<void>;
  completeRoutine(id: number): Promise<CompleteResult>;
  updateSettings(settings: Settings): Promise<Settings>;
  rewards(): Promise<Rewards>;
  photo(id: number): Promise<Blob>;
}
