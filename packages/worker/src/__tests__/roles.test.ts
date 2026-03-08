import { describe, it, expect } from 'vitest';
import type { TeamMember, Role } from '@devteam/shared';
import { buildSystemPrompt, ROLE_TEMPLATES } from '../roles/index.js';
import type { PromptContext } from '../roles/index.js';

const ALL_ROLES: Role[] = [
  'team_lead',
  'product_owner',
  'architect',
  'ux_designer',
  'developer',
  'reviewer',
  'qa_engineer',
  'devops',
];

function makeMember(overrides: Partial<TeamMember> & { role: Role }): TeamMember {
  return {
    name: 'Test User',
    handle: '@test-user',
    personality: 'Friendly and helpful.',
    ...overrides,
  };
}

const defaultContext: PromptContext = {
  projectName: 'Acme App',
  repository: 'acme-corp/acme-app',
};

describe('buildSystemPrompt', () => {
  it('generates a system prompt for a developer role', () => {
    const member = makeMember({
      role: 'developer',
      name: 'Alice Coder',
      handle: '@alice',
      personality: 'Loves clean code and TDD.',
    });

    const prompt = buildSystemPrompt(member, defaultContext);

    expect(prompt).toContain('Alice Coder');
    expect(prompt).toContain('@alice');
    expect(prompt).toContain('Software Developer');
    expect(prompt).toContain('Loves clean code and TDD.');
    expect(prompt).toContain('Acme App');
    expect(prompt).toContain('acme-corp/acme-app');
  });

  it('generates different prompts for different roles', () => {
    const devMember = makeMember({ role: 'developer', name: 'Dev Person' });
    const reviewerMember = makeMember({ role: 'reviewer', name: 'Rev Person' });

    const devPrompt = buildSystemPrompt(devMember, defaultContext);
    const reviewerPrompt = buildSystemPrompt(reviewerMember, defaultContext);

    // They should be different prompts
    expect(devPrompt).not.toBe(reviewerPrompt);

    // Developer prompt should mention developer-specific content
    expect(devPrompt).toContain('Software Developer');
    expect(devPrompt).toContain('write production code');

    // Reviewer prompt should mention reviewer-specific content
    expect(reviewerPrompt).toContain('Code Reviewer');
    expect(reviewerPrompt).toContain('review pull requests');
  });

  it('includes all 8 roles', () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_TEMPLATES[role]).toBeDefined();

      const member = makeMember({ role, name: `${role} user`, handle: `@${role}` });
      const prompt = buildSystemPrompt(member, defaultContext);

      expect(prompt.length).toBeGreaterThan(100);
      expect(prompt).toContain(`${role} user`);
      expect(prompt).toContain(`@${role}`);
      expect(prompt).toContain('Acme App');
    }
  });

  it('includes coding standards when provided', () => {
    const member = makeMember({ role: 'developer' });
    const context: PromptContext = {
      ...defaultContext,
      codingStandards: 'Use ESLint with Airbnb config.',
    };

    const prompt = buildSystemPrompt(member, context);
    expect(prompt).toContain('Use ESLint with Airbnb config.');
  });

  it('omits personality section when not provided', () => {
    const member: TeamMember = {
      role: 'developer',
      name: 'No Personality',
      handle: '@nop',
    };

    const prompt = buildSystemPrompt(member, defaultContext);
    expect(prompt).not.toContain('# Personality');
  });
});
