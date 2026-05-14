
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { homedir } from 'os';
import { getProjectName, getProjectContext } from '../../src/utils/project-name.js';
import { expectSafeProjectId } from './helpers.js';

describe('getProjectName', () => {
  describe('tilde expansion', () => {
    it('resolves bare ~ to the same safe project ID as the home directory', () => {
      const home = homedir();
      const project = getProjectName('~');
      expect(project).toBe(getProjectName(home));
      expectSafeProjectId(project);
    });

    it('resolves ~/subpath to the same safe project ID as the absolute subpath', () => {
      const project = getProjectName('~/projects/my-app');
      expect(project).toBe(getProjectName(`${homedir()}/projects/my-app`));
      expectSafeProjectId(project);
    });

    it('resolves ~/ to the same safe project ID as the home directory', () => {
      const home = homedir();
      const project = getProjectName('~/');
      expect(project).toBe(getProjectName(home));
      expectSafeProjectId(project);
    });
  });

  describe('normal paths', () => {
    it('uses a safe project ID derived from the absolute path', () => {
      const project = getProjectName('/home/user/my-project');
      expectSafeProjectId(project);
      expect(project).toContain('home-user-my-project');
    });

    it('uses a safe project ID for nested absolute paths', () => {
      const project = getProjectName('/Users/test/work/deep/nested/project');
      expectSafeProjectId(project);
      expect(project).toContain('Users-test-work-deep-nested-project');
    });

    it('normalizes trailing slash', () => {
      expect(getProjectName('/home/user/my-project/')).toBe(getProjectName('/home/user/my-project'));
    });

    it('keeps same-basename projects isolated with path hash', () => {
      const a = getProjectName('/a/foo');
      const b = getProjectName('/b/foo');
      expectSafeProjectId(a);
      expectSafeProjectId(b);
      expect(a).not.toBe(b);
    });

    it('replaces path symbols and whitespace with safe separators', () => {
      const project = getProjectName('/tmp/a,b/My Project/(draft)#1');
      expectSafeProjectId(project);
      expect(project).toContain('tmp-a-b-My-Project-draft-1');
    });

    it('uses the hash suffix to avoid collisions after sanitizing', () => {
      expect(getProjectName('/tmp/a b/app')).not.toBe(getProjectName('/tmp/a,b/app'));
    });
  });

  describe('edge cases', () => {
    it('returns unknown-project for null', () => {
      expect(getProjectName(null)).toBe('unknown-project');
    });

    it('returns unknown-project for undefined', () => {
      expect(getProjectName(undefined)).toBe('unknown-project');
    });

    it('returns unknown-project for empty string', () => {
      expect(getProjectName('')).toBe('unknown-project');
    });

    it('returns unknown-project for whitespace', () => {
      expect(getProjectName('   ')).toBe('unknown-project');
    });
  });

  describe('realistic scenarios from #1478', () => {
    it('handles ~ the same as full home path', () => {
      const home = homedir();
      expect(getProjectName('~')).toBe(getProjectName(home));
    });

    it('handles ~/projects/app the same as /full/path/projects/app', () => {
      const home = homedir();
      expect(getProjectName('~/projects/app')).toBe(
        getProjectName(`${home}/projects/app`)
      );
    });
  });
});

describe('getProjectContext', () => {
  it('returns primary project name for normal path', () => {
    const ctx = getProjectContext('/home/user/my-project');
    const project = getProjectName('/home/user/my-project');
    expect(ctx.primary).toBe(project);
    expectSafeProjectId(ctx.primary);
    expect(ctx.parent).toBeNull();
    expect(ctx.isWorktree).toBe(false);
    expect(ctx.allProjects).toEqual([project]);
  });

  it('resolves ~ path correctly', () => {
    const home = homedir();
    const ctx = getProjectContext('~');
    const ctxHome = getProjectContext(home);
    expect(ctx.primary).toBe(ctxHome.primary);
  });

  it('returns unknown-project context for null', () => {
    const ctx = getProjectContext(null);
    expect(ctx.primary).toBe('unknown-project');
    expect(ctx.parent).toBeNull();
  });

  describe('worktree isolation', () => {
    let tmp: string;
    let mainRepo: string;
    let worktreeCheckout: string;
    let relativeWorktreeCheckout: string;

    beforeAll(async () => {
      const { mkdtempSync, mkdirSync, writeFileSync } = await import('fs');
      const { join, relative } = await import('path');
      const { tmpdir } = await import('os');

      tmp = mkdtempSync(join(tmpdir(), 'cm-wt-'));
      mainRepo = join(tmp, 'main-repo');
      const worktreeGitDir = join(mainRepo, '.git', 'worktrees', 'my-worktree');
      worktreeCheckout = join(tmp, 'my-worktree');
      const relativeWorktreeGitDir = join(mainRepo, '.git', 'worktrees', 'relative-worktree');
      relativeWorktreeCheckout = join(tmp, 'relative-worktree');

      mkdirSync(worktreeGitDir, { recursive: true });
      mkdirSync(worktreeCheckout, { recursive: true });
      writeFileSync(
        join(worktreeCheckout, '.git'),
        `gitdir: ${worktreeGitDir}\n`
      );

      mkdirSync(relativeWorktreeGitDir, { recursive: true });
      mkdirSync(relativeWorktreeCheckout, { recursive: true });
      writeFileSync(
        join(relativeWorktreeCheckout, '.git'),
        `gitdir: ${relative(relativeWorktreeCheckout, relativeWorktreeGitDir)}\n`
      );
    });

    afterAll(async () => {
      const { rmSync } = await import('fs');
      rmSync(tmp, { recursive: true, force: true });
    });

    it('uses safe IDs for parent and worktree identities', () => {
      const ctx = getProjectContext(worktreeCheckout);
      const worktreeProject = getProjectName(worktreeCheckout);
      const parentProject = getProjectName(mainRepo);
      expect(ctx.isWorktree).toBe(true);
      expect(ctx.primary).toBe(worktreeProject);
      expect(ctx.parent).toBe(parentProject);
      expect(ctx.allProjects).toEqual([parentProject, worktreeProject]);
    });

    it('write-path call sites resolve to the worktree project ID', () => {
      const project = getProjectContext(worktreeCheckout).primary;
      expect(project).toBe(getProjectName(worktreeCheckout));
      expect(project).not.toBe(getProjectName(mainRepo));
      expect(project).not.toBe('my-worktree');
      expectSafeProjectId(project);
    });

    it('resolves relative worktree gitdir paths from the worktree directory', () => {
      const ctx = getProjectContext(relativeWorktreeCheckout);
      const worktreeProject = getProjectName(relativeWorktreeCheckout);
      const parentProject = getProjectName(mainRepo);
      expect(ctx.isWorktree).toBe(true);
      expect(ctx.primary).toBe(worktreeProject);
      expect(ctx.parent).toBe(parentProject);
      expect(ctx.allProjects).toEqual([parentProject, worktreeProject]);
    });
  });
});
