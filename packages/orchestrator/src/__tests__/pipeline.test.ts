import { describe, it, expect } from 'vitest';
import { PipelineStateMachine } from '../pipeline/state-machine.js';

describe('PipelineStateMachine', () => {
  const sm = new PipelineStateMachine();

  it('allows standard feature flow transitions', () => {
    // intake -> requirements -> design -> implement -> review -> qa -> done
    expect(sm.canTransition('backlog', 'intake', 'feature')).toBe(true);
    expect(sm.canTransition('intake', 'requirements', 'feature')).toBe(true);
    expect(sm.canTransition('requirements', 'design', 'feature')).toBe(true);
    expect(sm.canTransition('design', 'implement', 'feature')).toBe(true);
    expect(sm.canTransition('implement', 'review', 'feature')).toBe(true);
    expect(sm.canTransition('review', 'qa', 'feature')).toBe(true);
    expect(sm.canTransition('qa', 'done', 'feature')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    // intake -> qa should return false
    expect(sm.canTransition('intake', 'qa', 'feature')).toBe(false);
    // implement -> done should return false
    expect(sm.canTransition('implement', 'done', 'feature')).toBe(false);
    // backlog -> design should return false
    expect(sm.canTransition('backlog', 'design', 'feature')).toBe(false);
  });

  it('supports bug fast path (skip requirements/design)', () => {
    // intake -> implement for bugs
    expect(sm.canTransition('intake', 'implement', 'bug')).toBe(true);
    // bugs should NOT be able to go intake -> requirements
    expect(sm.canTransition('intake', 'requirements', 'bug')).toBe(false);
  });

  it('allows feedback loops', () => {
    // review -> implement
    expect(sm.canTransition('review', 'implement', 'feature')).toBe(true);
    // qa -> intake
    expect(sm.canTransition('qa', 'intake', 'feature')).toBe(true);
  });

  it('allows cancellation from any stage', () => {
    const stages = [
      'backlog',
      'intake',
      'requirements',
      'design',
      'implement',
      'review',
      'qa',
    ] as const;
    for (const stage of stages) {
      expect(sm.canTransition(stage, 'cancelled', 'feature')).toBe(true);
    }
    // done cannot transition to cancelled
    expect(sm.canTransition('done', 'cancelled', 'feature')).toBe(false);
  });

  it('returns correct roles for each stage', () => {
    expect(sm.getRolesForStage('implement')).toEqual(['developer', 'devops']);
    expect(sm.getRolesForStage('requirements')).toEqual(['product_owner']);
    expect(sm.getRolesForStage('review')).toEqual(['reviewer']);
    expect(sm.getRolesForStage('qa')).toEqual(['qa_engineer']);
    expect(sm.getRolesForStage('design')).toEqual(['architect', 'ux_designer']);
    expect(sm.getRolesForStage('done')).toEqual([]);
  });

  it('returns next possible stages', () => {
    // from implement: [review, cancelled]
    const next = sm.getNextStages('implement', 'feature');
    expect(next).toContain('review');
    expect(next).toContain('cancelled');
    expect(next).not.toContain('design');
  });

  it('returns standard flow for features vs bugs', () => {
    const featureFlow = sm.getStandardFlow('feature');
    expect(featureFlow).toEqual([
      'backlog',
      'intake',
      'requirements',
      'design',
      'implement',
      'review',
      'qa',
      'done',
    ]);

    const bugFlow = sm.getStandardFlow('bug');
    expect(bugFlow).toEqual([
      'backlog',
      'intake',
      'implement',
      'review',
      'qa',
      'done',
    ]);
  });
});
