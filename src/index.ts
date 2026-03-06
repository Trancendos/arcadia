/**
 * Arcadia — Entry Point
 *
 * Community platform and marketplace for the Trancendos ecosystem.
 * Connects members, listings, orders, posts, and events.
 * Zero-cost compliant — no LLM calls.
 *
 * Port: 3026
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { app, marketplace, community } from './api/server';
import { logger } from './utils/logger';

const PORT = Number(process.env.PORT ?? 3026);
const HOST = process.env.HOST ?? '0.0.0.0';

// ── Startup ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  logger.info('Arcadia starting up...');

  const server = app.listen(PORT, HOST, () => {
    logger.info(
      { port: PORT, host: HOST, env: process.env.NODE_ENV ?? 'development' },
      '🏛️  Arcadia is online — Community platform & marketplace ready',
    );
  });

  // ── Periodic Platform Summary (every 30 minutes) ─────────────────────────
  const SUMMARY_INTERVAL = Number(process.env.SUMMARY_INTERVAL_MS ?? 30 * 60 * 1000);
  const summaryTimer = setInterval(() => {
    try {
      const mStats = marketplace.getStats();
      const cStats = community.getStats();
      logger.info(
        {
          marketplace: {
            activeListings: mStats.activeListings,
            totalOrders: mStats.totalOrders,
            completedOrders: mStats.completedOrders,
            totalRevenue: mStats.totalRevenue,
          },
          community: {
            activeMembers: cStats.activeMembers,
            publishedPosts: cStats.publishedPosts,
            totalComments: cStats.totalComments,
            upcomingEvents: cStats.upcomingEvents,
          },
        },
        '🏛️  Arcadia periodic platform summary',
      );
    } catch (err) {
      logger.error({ err }, 'Periodic platform summary failed');
    }
  }, SUMMARY_INTERVAL);

  // ── Graceful Shutdown ────────────────────────────────────────────────────
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    clearInterval(summaryTimer);
    server.close(() => {
      logger.info('Arcadia shut down cleanly');
      process.exit(0);
    });
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Bootstrap failed');
  process.exit(1);
});