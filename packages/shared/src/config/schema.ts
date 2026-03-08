import { z } from 'zod';

// ── Role Enum ──────────────────────────────────────────────────────────

export const RoleEnum = z.enum([
  'team_lead',
  'product_owner',
  'architect',
  'ux_designer',
  'developer',
  'reviewer',
  'qa_engineer',
  'devops',
]);
export type Role = z.infer<typeof RoleEnum>;

// ── Team Member ────────────────────────────────────────────────────────

export const TeamMemberSchema = z.object({
  role: RoleEnum,
  name: z.string().min(1),
  handle: z.string().min(1),
  personality: z.string().optional(),
  avatar: z.string().url().optional(),
});
export type TeamMember = z.infer<typeof TeamMemberSchema>;

// ── Slack ──────────────────────────────────────────────────────────────

export const SlackConfigSchema = z.object({
  workspace: z.string().min(1),
  channels: z.object({
    main: z.string().min(1),
    dev: z.string().min(1),
    design: z.string().min(1),
    alerts: z.string().min(1),
  }),
});
export type SlackConfig = z.infer<typeof SlackConfigSchema>;

// ── Integrations ───────────────────────────────────────────────────────

export const JiraConfigSchema = z.object({
  baseUrl: z.string().url(),
  project: z.string().min(1),
});
export type JiraConfig = z.infer<typeof JiraConfigSchema>;

export const GitHubConfigSchema = z.object({
  repo: z.string().min(1),
});
export type GitHubConfig = z.infer<typeof GitHubConfigSchema>;

export const CICDConfigSchema = z.object({
  type: z.enum(['github_actions', 'gitlab_ci', 'jenkins', 'circleci']),
});
export type CICDConfig = z.infer<typeof CICDConfigSchema>;

export const IntegrationsSchema = z.object({
  jira: JiraConfigSchema.optional(),
  github: GitHubConfigSchema.optional(),
  cicd: CICDConfigSchema.optional(),
});
export type Integrations = z.infer<typeof IntegrationsSchema>;

// ── Guardrails ─────────────────────────────────────────────────────────

export const AutoMergeSchema = z.object({
  maxFilesChanged: z.number().int().positive(),
  excludePaths: z.array(z.string()).default([]),
  requireTests: z.boolean().default(true),
});
export type AutoMerge = z.infer<typeof AutoMergeSchema>;

export const GuardrailActionSchema = z.object({
  action: z.string().min(1),
});
export type GuardrailAction = z.infer<typeof GuardrailActionSchema>;

export const GuardrailsSchema = z.object({
  autoMerge: AutoMergeSchema.optional(),
  humanApproval: z.array(GuardrailActionSchema).default([]),
  blocked: z.array(GuardrailActionSchema).default([]),
});
export type Guardrails = z.infer<typeof GuardrailsSchema>;

// ── Knowledge ──────────────────────────────────────────────────────────

export const KnowledgeConfigSchema = z.object({
  embeddingModel: z.string().min(1).default('text-embedding-3-small'),
  maxContextTokens: z.number().int().positive().default(50000),
});
export type KnowledgeConfig = z.infer<typeof KnowledgeConfigSchema>;

// ── Team (top-level project info) ──────────────────────────────────────

export const TeamInfoSchema = z.object({
  name: z.string().min(1),
  project: z.string().min(1),
  repository: z.string().min(1),
});
export type TeamInfo = z.infer<typeof TeamInfoSchema>;

// ── Top-level Config ───────────────────────────────────────────────────

export const TeamConfigSchema = z
  .object({
    team: TeamInfoSchema,
    members: z.array(TeamMemberSchema).min(1),
    slack: SlackConfigSchema,
    integrations: IntegrationsSchema.default({}),
    guardrails: GuardrailsSchema.default({}),
    knowledge: KnowledgeConfigSchema.default({}),
  })
  .refine(
    (config) => config.members.some((m) => m.role === 'team_lead'),
    { message: 'Team must have at least one member with the team_lead role' },
  );
export type TeamConfig = z.infer<typeof TeamConfigSchema>;
