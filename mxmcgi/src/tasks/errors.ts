export class ConfigurationError extends Error {
  readonly code = 'TASK_CONFIG_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class ValidationError extends Error {
  readonly code = 'TASK_VALIDATION_ERROR' as const;
  details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

