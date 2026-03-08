export type PipelineStage =
  | 'backlog'
  | 'intake'
  | 'requirements'
  | 'design'
  | 'implement'
  | 'review'
  | 'qa'
  | 'done'
  | 'cancelled';

export type WorkItemType = 'feature' | 'bug' | 'tech_debt' | 'task';

export interface StageTransition {
  from: PipelineStage;
  to: PipelineStage;
}

/** Define which roles handle which stages */
export const STAGE_ROLES: Record<PipelineStage, string[]> = {
  backlog: ['team_lead'],
  intake: ['team_lead'],
  requirements: ['product_owner'],
  design: ['architect', 'ux_designer'],
  implement: ['developer', 'devops'],
  review: ['reviewer'],
  qa: ['qa_engineer'],
  done: [],
  cancelled: [],
};

/** All stages that can be cancelled (everything except done and cancelled itself) */
const CANCELLABLE_STAGES: PipelineStage[] = [
  'backlog',
  'intake',
  'requirements',
  'design',
  'implement',
  'review',
  'qa',
];

export class PipelineStateMachine {
  /** Standard feature flow */
  private static FEATURE_TRANSITIONS: StageTransition[] = [
    { from: 'backlog', to: 'intake' },
    { from: 'intake', to: 'requirements' },
    { from: 'requirements', to: 'design' },
    { from: 'design', to: 'implement' },
    { from: 'implement', to: 'review' },
    { from: 'review', to: 'qa' },
    { from: 'qa', to: 'done' },
    // Feedback loops
    { from: 'review', to: 'implement' }, // Review requests changes
    { from: 'qa', to: 'intake' }, // QA finds bug -> new intake
    // Cancellation from any cancellable stage
    ...CANCELLABLE_STAGES.map((stage) => ({ from: stage, to: 'cancelled' as PipelineStage })),
  ];

  /** Bug fast path: skip requirements and design */
  private static BUG_TRANSITIONS: StageTransition[] = [
    { from: 'backlog', to: 'intake' },
    { from: 'intake', to: 'implement' }, // Skip requirements and design
    { from: 'implement', to: 'review' },
    { from: 'review', to: 'qa' },
    { from: 'qa', to: 'done' },
    // Feedback loops
    { from: 'review', to: 'implement' },
    // Cancellation from any cancellable stage
    ...CANCELLABLE_STAGES.map((stage) => ({ from: stage, to: 'cancelled' as PipelineStage })),
  ];

  private getTransitions(type: WorkItemType): StageTransition[] {
    if (type === 'bug') {
      return PipelineStateMachine.BUG_TRANSITIONS;
    }
    // feature, tech_debt, and task all use the standard flow
    return PipelineStateMachine.FEATURE_TRANSITIONS;
  }

  canTransition(
    from: PipelineStage,
    to: PipelineStage,
    type: WorkItemType,
  ): boolean {
    const transitions = this.getTransitions(type);
    return transitions.some((t) => t.from === from && t.to === to);
  }

  getNextStages(current: PipelineStage, type: WorkItemType): PipelineStage[] {
    const transitions = this.getTransitions(type);
    const nextStages: PipelineStage[] = [];
    for (const t of transitions) {
      if (t.from === current && !nextStages.includes(t.to)) {
        nextStages.push(t.to);
      }
    }
    return nextStages;
  }

  getRolesForStage(stage: PipelineStage): string[] {
    return STAGE_ROLES[stage];
  }

  getStandardFlow(type: WorkItemType): PipelineStage[] {
    if (type === 'bug') {
      return [
        'backlog',
        'intake',
        'implement',
        'review',
        'qa',
        'done',
      ];
    }
    // feature, tech_debt, task
    return [
      'backlog',
      'intake',
      'requirements',
      'design',
      'implement',
      'review',
      'qa',
      'done',
    ];
  }
}
