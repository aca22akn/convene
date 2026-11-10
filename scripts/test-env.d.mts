export function createIsolatedTestEnv(
  sourceEnv: Record<string, string | undefined>,
  homeDirectory: string,
  overrides?: Record<string, string | undefined>,
): Record<string, string | undefined>;

export function sanitizeTestDiagnostic(value: string): string;
