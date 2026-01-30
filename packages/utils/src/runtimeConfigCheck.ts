export type RuntimeConfigRequirement = {
  key: string;
  description: string;
};

export function assertRuntimeConfig(
  config: Record<string, unknown>,
  required: RuntimeConfigRequirement[],
): void {
  const missing: string[] = [];

  for (const item of required) {
    const value = config[item.key];
    if (value === undefined || value === null || value === '') {
      missing.push(`${item.key} (${item.description})`);
    }
  }

  if (missing.length > 0) {
    const message =
      'Missing required runtime configuration values:\n' +
      missing.map((m) => `- ${m}`).join('\n');

    throw new Error(message);
  }
}
