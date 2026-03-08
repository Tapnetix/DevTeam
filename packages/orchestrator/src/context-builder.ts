export interface TaskContext {
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  designDoc?: string;
  relatedRequirements?: string;
  codingStandards?: string;
  relevantFiles?: string[];
  recentChanges?: string;
  inProgressWork?: Array<{ id: string; title: string; assignee: string }>;
  blockers?: string[];
}

export class ContextBuilder {
  buildTaskContext(params: {
    taskId: string;
    taskTitle: string;
    taskDescription: string;
    designDoc?: string;
    relatedRequirements?: string;
    codingStandards?: string;
  }): TaskContext {
    // Assemble context package
    // Will be enhanced in Phase 6 with semantic knowledge retrieval
    return {
      taskId: params.taskId,
      taskTitle: params.taskTitle,
      taskDescription: params.taskDescription,
      designDoc: params.designDoc,
      relatedRequirements: params.relatedRequirements,
      codingStandards: params.codingStandards,
    };
  }
}
