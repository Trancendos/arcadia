import pino from 'pino';

export const logger = pino({
  name: 'arcadia',
  level: process.env.LOG_LEVEL ?? 'info',
});