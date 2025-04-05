export function createLogger(context: string) {
  return {
    info: (message: string, data?: unknown) => {
      console.log(`[${context}] ${message}`, data ? data : '');
    },
    error: (message: string, error?: unknown) => {
      console.error(`[${context}] ${message}`, error ? error : '');
    },
    warn: (message: string, data?: unknown) => {
      console.warn(`[${context}] ${message}`, data ? data : '');
    },
    debug: (message: string, data?: unknown) => {
      console.debug(`[${context}] ${message}`, data ? data : '');
    },
  };
} 
