import express, { Request, Response } from 'express';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import type { DatabaseManager } from '../../DatabaseManager.js';

interface UserRow {
  user_label: string;
  sessions: number;
  last_active: number | null;
}

/**
 * /api/users — TODO T-19 / S-doc §11.
 *
 * Server-mode-only endpoint that aggregates sdk_sessions by user_label
 * so the viewer can render the employee selector + per-user activity.
 *
 * Why client mode doesn't expose this:
 *  - A client install only has one user_label (its own); the viewer can
 *    hide the selector entirely based on /api/admin/role.
 *  - Returning 404 from the server side makes the role mismatch obvious
 *    when an operator points a server-viewer at a client worker.
 *
 * Registration is conditional in worker-service.ts (only when
 * CLAUDE_MEM_NODE_ROLE=server). Routes are still defined here as a
 * standalone class so the registration site stays declarative.
 */
export class UsersRoutes extends BaseRouteHandler {
  constructor(private readonly dbManager: DatabaseManager) {
    super();
  }

  setupRoutes(app: express.Application): void {
    app.get('/api/users', this.handleGetUsers.bind(this));
  }

  private handleGetUsers = this.wrapHandler(async (_req: Request, res: Response): Promise<void> => {
    const db = this.dbManager.getConnection();
    const rows = db.query<UserRow, []>(`
      SELECT user_label,
             COUNT(*)              AS sessions,
             MAX(started_at_epoch) AS last_active
      FROM sdk_sessions
      WHERE user_label IS NOT NULL
        AND TRIM(user_label) <> ''
      GROUP BY user_label
      ORDER BY last_active DESC NULLS LAST, user_label ASC
    `).all();

    res.json({ users: rows });
  });
}
