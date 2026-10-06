import { describe, expect, it } from 'vitest';
import { pluralRu } from './plural';

const FORMS = ['задачу', 'задачи', 'задач'] as const;

describe('pluralRu', () => {
  it.each([
    [1, 'задачу'], [2, 'задачи'], [4, 'задачи'], [5, 'задач'], [11, 'задач'],
    [12, 'задач'], [14, 'задач'], [21, 'задачу'], [22, 'задачи'], [0, 'задач'],
  ])('%i → %s', (n, form) => {
    expect(pluralRu(n, FORMS)).toBe(form);
  });
});
