
import http from 'http';
import { logger } from '../../utils/logger.js';
import { getSupervisor } from '../../supervisor/index.js';

export interface ShutdownableService {
  shutdownAll(): Promise<void>;
}

export interface CloseableClient {
  close(): Promise<void>;
}

export interface CloseableDatabase {
  close(): Promise<void>;
}

export interface StoppableService {
  stop(): Promise<void>;
}

export interface GracefulShutdownConfig {
  server: http.Server | null;
  sessionManager: ShutdownableService;
  mcpClient?: CloseableClient;
  dbManager?: CloseableDatabase;
  chromaMcpManager?: StoppableService;
}

export async function performGracefulShutdown(config: GracefulShutdownConfig): Promise<void> {
  logger.info('SYSTEM', 'Shutdown initiated');

  // Each teardown step is isolated (X-004): a throw in any earlier step used
  // to abort the whole chain, skipping ChromaMcpManager.stop() — which
  // orphaned the uvx/python chroma subprocess tree on every restart because
  // chroma-mcp does not exit on stdin EOF.
  const step = async (name: string, action: () => unknown): Promise<void> => {
    try {
      await action();
      logger.info('SHUTDOWN', `${name}: done`);
    } catch (error) {
      logger.error('SHUTDOWN', `${name}: failed (continuing teardown)`, {},
        error instanceof Error ? error : new Error(String(error)));
    }
  };

  if (config.server) {
    await step('HTTP server close', () => closeHttpServer(config.server!));
  }

  await step('Session manager shutdown', () => config.sessionManager.shutdownAll());

  if (config.mcpClient) {
    await step('MCP client close', () => config.mcpClient!.close());
  }

  if (config.chromaMcpManager) {
    await step('Chroma MCP stop', () => config.chromaMcpManager!.stop());
  }

  if (config.dbManager) {
    await step('Database close', () => config.dbManager!.close());
  }

  await step('Supervisor stop', () => getSupervisor().stop());

  logger.info('SYSTEM', 'Worker shutdown complete');
}

async function closeHttpServer(server: http.Server): Promise<void> {
  server.closeAllConnections();

  if (process.platform === 'win32') {
    await new Promise(r => setTimeout(r, 500));
  }

  await new Promise<void>((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
  });

  if (process.platform === 'win32') {
    await new Promise(r => setTimeout(r, 500));
    logger.info('SYSTEM', 'Waited for Windows port cleanup');
  }
}
