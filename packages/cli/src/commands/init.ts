import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import YAML from 'yaml';
import type { Role } from '@devteam/shared';

// ── Types ───────────────────────────────────────────────────────────────

export interface MemberInput {
  role: Role;
  name: string;
  handle: string;
  personality?: string;
}

export interface InitAnswers {
  teamName: string;
  projectName: string;
  repository: string;
  slackWorkspace: string;
  slackMainChannel: string;
  slackDevChannel: string;
  slackDesignChannel: string;
  slackAlertsChannel: string;
  members: MemberInput[];
}

export interface InitOptions {
  /** Pre-filled answers (skips interactive prompts). */
  answers?: InitAnswers;
  /** Directory to write devteam.yaml into. Defaults to cwd. */
  outputDir?: string;
  /** Whether to overwrite an existing file. Defaults to true. */
  overwrite?: boolean;
}

export interface InitResult {
  filePath: string;
  skipped?: boolean;
}

// ── Interactive prompting ───────────────────────────────────────────────

async function prompt(
  rl: readline.Interface,
  question: string,
  defaultValue?: string,
): Promise<string> {
  return new Promise((resolve) => {
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

async function collectAnswersInteractively(): Promise<InitAnswers> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log('\n🏗️  DevTeam Init — Interactive Setup\n');

    const teamName = await prompt(rl, 'Team name', 'DevTeam AI');
    const projectName = await prompt(rl, 'Project name', 'devteam');
    const repository = await prompt(
      rl,
      'Repository URL',
      'git@github.com:org/repo.git',
    );
    const slackWorkspace = await prompt(rl, 'Slack workspace', 'your-org');
    const slackMainChannel = await prompt(
      rl,
      'Slack main channel',
      'devteam-main',
    );
    const slackDevChannel = await prompt(
      rl,
      'Slack dev channel',
      'devteam-dev',
    );
    const slackDesignChannel = await prompt(
      rl,
      'Slack design channel',
      'devteam-design',
    );
    const slackAlertsChannel = await prompt(
      rl,
      'Slack alerts channel',
      'devteam-alerts',
    );

    // Collect team members
    const members: MemberInput[] = [];
    console.log('\nAdd team members (at least one team_lead required).');
    console.log(
      'Roles: team_lead, product_owner, architect, ux_designer, developer, reviewer, qa_engineer, devops\n',
    );

    let addMore = true;
    while (addMore) {
      const role = (await prompt(
        rl,
        'Member role',
        members.length === 0 ? 'team_lead' : 'developer',
      )) as Role;
      const name = await prompt(rl, 'Member name');
      const handle = await prompt(rl, 'Member handle');
      const personality = await prompt(
        rl,
        'Personality (optional, press Enter to skip)',
      );

      members.push({
        role,
        name,
        handle,
        ...(personality ? { personality } : {}),
      });

      const more = await prompt(rl, 'Add another member? (y/n)', 'n');
      addMore = more.toLowerCase() === 'y';
    }

    return {
      teamName,
      projectName,
      repository,
      slackWorkspace,
      slackMainChannel,
      slackDevChannel,
      slackDesignChannel,
      slackAlertsChannel,
      members,
    };
  } finally {
    rl.close();
  }
}

// ── Core logic ──────────────────────────────────────────────────────────

function buildYamlContent(answers: InitAnswers): string {
  const config = {
    team: {
      name: answers.teamName,
      project: answers.projectName,
      repository: answers.repository,
    },
    members: answers.members.map((m) => {
      const entry: Record<string, string> = {
        role: m.role,
        name: m.name,
        handle: m.handle,
      };
      if (m.personality) {
        entry.personality = m.personality;
      }
      return entry;
    }),
    slack: {
      workspace: answers.slackWorkspace,
      channels: {
        main: answers.slackMainChannel,
        dev: answers.slackDevChannel,
        design: answers.slackDesignChannel,
        alerts: answers.slackAlertsChannel,
      },
    },
  };

  return YAML.stringify(config);
}

// ── Public API ──────────────────────────────────────────────────────────

export async function runInit(options: InitOptions = {}): Promise<InitResult> {
  const answers = options.answers ?? (await collectAnswersInteractively());
  const outputDir = options.outputDir ?? process.cwd();
  const overwrite = options.overwrite ?? true;

  const filePath = path.join(outputDir, 'devteam.yaml');

  // Check for existing file
  if (fs.existsSync(filePath) && !overwrite) {
    console.log(`File already exists: ${filePath} (skipping)`);
    return { filePath, skipped: true };
  }

  const yamlContent = buildYamlContent(answers);
  fs.writeFileSync(filePath, yamlContent, 'utf-8');

  console.log(`\nCreated ${filePath}`);

  return { filePath };
}
