#!/usr/bin/env node

import { runInit } from './commands/init.js';
import { runStart } from './commands/start.js';
import { runStatus } from './commands/status.js';

// ── Argument parser ─────────────────────────────────────────────────────

export interface ParsedArgs {
  command: string;
  flags: Record<string, string>;
  positional: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  // argv[0] = node, argv[1] = script path, argv[2..] = user args
  const args = argv.slice(2);
  const command = args[0] || 'help';
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  let i = 1;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = 'true';
        i += 1;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }

  return { command, flags, positional };
}

// ── Help text ───────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
  DevTeam CLI — AI-powered Agile development team

  Usage:
    devteam <command> [options]

  Commands:
    init     Interactive team setup — generates devteam.yaml
    start    Boot all services (validates config, checks dependencies)
    status   Show team state, active work items, sprint progress
    help     Show this help message

  Options:
    --config <path>   Path to devteam.yaml (default: ./devteam.yaml)
    --dir <path>      Output directory for init (default: current directory)
    --overwrite       Overwrite existing devteam.yaml during init

  Examples:
    devteam init
    devteam init --dir /path/to/project
    devteam start --config ./devteam.yaml
    devteam status
`);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv);

  switch (command) {
    case 'init': {
      const outputDir = flags.dir || process.cwd();
      const overwrite = flags.overwrite === 'true' ? true : undefined;
      await runInit({ outputDir, overwrite });
      break;
    }

    case 'start': {
      const configPath = flags.config || './devteam.yaml';
      await runStart({ configPath });
      break;
    }

    case 'status': {
      const configPath = flags.config || './devteam.yaml';
      await runStatus({ configPath });
      break;
    }

    case 'help':
    default:
      printHelp();
      break;
  }
}

// Only run main when executed directly (not when imported for testing)
const isDirectExecution =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('/dist/index.js') ||
    process.argv[1].endsWith('\\dist\\index.js'));

if (isDirectExecution) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
