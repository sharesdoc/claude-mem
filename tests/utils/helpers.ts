import { expect } from 'bun:test';

export function expectSafeProjectId(project: string): void {
  expect(project).toMatch(/^[A-Za-z0-9._-]+-[a-f0-9]{12}$/);
  expect(project).not.toContain('/');
  expect(project).not.toContain('\\');
  expect(project).not.toContain(',');
  expect(project).not.toContain(' ');
}
