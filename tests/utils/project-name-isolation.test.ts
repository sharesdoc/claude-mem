import { describe, it, expect } from 'bun:test';
import { getProjectName } from '../../src/utils/project-name.js';
import { expectSafeProjectId } from './helpers.js';

describe('getProjectName mock isolation (#1299)', () => {
  it('returns real safe project ID, not the leaked test-project mock', () => {
    const project = getProjectName('/real/path/to/my-project');
    expect(project).not.toBe('test-project');
    expect(project).toContain('real-path-to-my-project');
    expectSafeProjectId(project);
  });

  it('returns unknown-project for empty string (real implementation)', () => {
    expect(getProjectName('')).toBe('unknown-project');
  });

  it('returns real safe project ID from nested path', () => {
    const project = getProjectName('/home/user/code/awesome-app');
    expect(project).toContain('home-user-code-awesome-app');
    expectSafeProjectId(project);
  });
});
