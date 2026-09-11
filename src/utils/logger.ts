/**
 * Centralized logger utility.
 * In production, debug/info logs are suppressed.
 * Always use logger instead of raw console.log/warn/error.
 */

const isDev = __DEV__;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const prefix = '[Voxen]';

function format(level: LogLevel, tag: string, ...args: unknown[]): string {
  return `${prefix} [${level.toUpperCase()}] [${tag}]`;
}

export const logger = {
  debug: (tag: string, ...args: unknown[]) => {
    if (isDev) console.log(format('debug', tag), ...args);
  },
  info: (tag: string, ...args: unknown[]) => {
    if (isDev) console.info(format('info', tag), ...args);
  },
  warn: (tag: string, ...args: unknown[]) => {
    console.warn(format('warn', tag), ...args);
  },
  error: (tag: string, ...args: unknown[]) => {
    console.error(format('error', tag), ...args);
  },
};
