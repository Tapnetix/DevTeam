import YAML from 'yaml';
import { readFileSync } from 'node:fs';
import { TeamConfigSchema, type TeamConfig } from './schema.js';

/**
 * Parse a YAML string and validate it against the TeamConfig schema.
 */
export function loadConfig(yamlContent: string): TeamConfig {
  const raw: unknown = YAML.parse(yamlContent);
  return TeamConfigSchema.parse(raw);
}

/**
 * Read a YAML file from disk and validate it against the TeamConfig schema.
 */
export function loadConfigFromFile(filePath: string): TeamConfig {
  const content = readFileSync(filePath, 'utf-8');
  return loadConfig(content);
}
