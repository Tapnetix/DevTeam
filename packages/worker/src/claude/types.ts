export interface SpawnerConfig {
  workingDirectory: string;
  systemPrompt: string;
  maxTurns?: number;
  model?: string;
  allowedTools?: string[];
}

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
