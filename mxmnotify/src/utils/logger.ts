/**
 * 日志工具
 */

export const logger = {
  info: (message: string, ...args: any[]) => {
    console.log(`[mxmnotify] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[mxmnotify] ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`[mxmnotify] ${message}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    if (process.env.DEBUG) {
      console.debug(`[mxmnotify] ${message}`, ...args);
    }
  },
};
