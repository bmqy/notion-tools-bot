export function createLogger(context: string) {
  return {
    info: (message: string) => console.log(`[${context}] ${message}`),
    warn: (message: string) => console.warn(`[${context}] ${message}`),
    error: (message: string) => console.error(`[${context}] ${message}`),
    debug: (message: string) => console.debug(`[${context}] ${message}`)
  };
} 
