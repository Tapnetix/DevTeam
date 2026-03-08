import type { EventBus, TeamMember } from '@devteam/shared';
import { TaskGraph, type GraphTask } from './graph/index.js';
import {
  PipelineStateMachine,
  type PipelineStage,
  type WorkItemType,
} from './pipeline/index.js';
import { ContextBuilder, type TaskContext } from './context-builder.js';

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  type: WorkItemType;
  status: PipelineStage;
  priority: 'critical' | 'high' | 'normal' | 'low';
  assigneeHandle?: string;
  externalId?: string;
}

export interface OrchestratorConfig {
  teamMembers: TeamMember[];
  eventBus: EventBus;
  projectName: string;
}

let idCounter = 0;
function generateId(prefix: string): string {
  idCounter++;
  return `${prefix}-${idCounter}`;
}

/** Reset the ID counter (for testing) */
export function resetIdCounter(): void {
  idCounter = 0;
}

export class Orchestrator {
  private pipeline: PipelineStateMachine;
  private contextBuilder: ContextBuilder;
  private taskGraphs: Map<string, TaskGraph>;
  private workItems: Map<string, WorkItem>;
  private membersByRole: Map<string, TeamMember[]>;

  constructor(private config: OrchestratorConfig) {
    this.pipeline = new PipelineStateMachine();
    this.contextBuilder = new ContextBuilder();
    this.taskGraphs = new Map();
    this.workItems = new Map();

    // Index team members by role for quick lookup
    this.membersByRole = new Map();
    for (const member of config.teamMembers) {
      const existing = this.membersByRole.get(member.role) ?? [];
      existing.push(member);
      this.membersByRole.set(member.role, existing);
    }
  }

  async triageIncoming(item: {
    title: string;
    description: string;
    type: WorkItemType;
    priority?: 'critical' | 'high' | 'normal' | 'low';
    externalId?: string;
  }): Promise<WorkItem> {
    const workItem: WorkItem = {
      id: generateId('wi'),
      title: item.title,
      description: item.description,
      type: item.type,
      status: 'intake',
      priority: item.priority ?? 'normal',
      externalId: item.externalId,
    };

    this.workItems.set(workItem.id, workItem);

    await this.config.eventBus.publish({
      type: 'work_item.created',
      actor: 'orchestrator',
      workItemId: workItem.id,
      payload: {
        title: workItem.title,
        type: workItem.type,
        priority: workItem.priority,
        status: workItem.status,
      },
    });

    return workItem;
  }

  async advancePipeline(
    workItemId: string,
    targetStage?: PipelineStage,
  ): Promise<WorkItem> {
    const workItem = this.workItems.get(workItemId);
    if (!workItem) {
      throw new Error(`Work item "${workItemId}" not found`);
    }

    let nextStage: PipelineStage;

    if (targetStage) {
      nextStage = targetStage;
    } else {
      // Determine next stage from standard flow
      const flow = this.pipeline.getStandardFlow(workItem.type);
      const currentIndex = flow.indexOf(workItem.status);
      if (currentIndex === -1 || currentIndex === flow.length - 1) {
        throw new Error(
          `Cannot advance work item "${workItemId}" from stage "${workItem.status}"`,
        );
      }
      nextStage = flow[currentIndex + 1];
    }

    // Validate transition
    if (!this.pipeline.canTransition(workItem.status, nextStage, workItem.type)) {
      throw new Error(
        `Invalid transition from "${workItem.status}" to "${nextStage}" for type "${workItem.type}"`,
      );
    }

    const previousStage = workItem.status;
    workItem.status = nextStage;

    // Assign to appropriate role for the new stage
    const roles = this.pipeline.getRolesForStage(nextStage);
    if (roles.length > 0) {
      const member = this.findAvailableMember(roles[0]);
      if (member) {
        workItem.assigneeHandle = member.handle;
      }
    }

    await this.config.eventBus.publish({
      type: 'pipeline.advanced',
      actor: 'orchestrator',
      workItemId: workItem.id,
      payload: {
        from: previousStage,
        to: nextStage,
        assignee: workItem.assigneeHandle,
      },
    });

    return workItem;
  }

  async assignToRole(workItemId: string, role: string): Promise<WorkItem> {
    const workItem = this.workItems.get(workItemId);
    if (!workItem) {
      throw new Error(`Work item "${workItemId}" not found`);
    }

    const member = this.findAvailableMember(role);
    if (!member) {
      throw new Error(`No available member for role "${role}"`);
    }

    workItem.assigneeHandle = member.handle;

    await this.config.eventBus.publish({
      type: 'work_item.assigned',
      actor: 'orchestrator',
      workItemId: workItem.id,
      payload: {
        assignee: member.handle,
        role,
      },
    });

    return workItem;
  }

  findAvailableMember(role: string): TeamMember | undefined {
    const members = this.membersByRole.get(role);
    if (!members || members.length === 0) {
      return undefined;
    }
    // Return first available (simple for now, can be enhanced later)
    return members[0];
  }

  async breakIntoTasks(
    workItemId: string,
    tasks: Array<{ title: string; description: string; dependsOn?: string[] }>,
  ): Promise<GraphTask[]> {
    const workItem = this.workItems.get(workItemId);
    if (!workItem) {
      throw new Error(`Work item "${workItemId}" not found`);
    }

    const graph = new TaskGraph();

    const graphTasks: GraphTask[] = tasks.map((t, i) => ({
      id: `${workItemId}-task-${i + 1}`,
      title: t.title,
      dependsOn: t.dependsOn,
    }));

    for (const gt of graphTasks) {
      graph.addTask(gt);
    }

    // Validate (check for cycles and missing deps)
    graph.validate();

    this.taskGraphs.set(workItemId, graph);

    return graphTasks;
  }

  async handleWorkerComplete(
    workItemId: string,
    taskId: string,
  ): Promise<void> {
    const graph = this.taskGraphs.get(workItemId);
    if (!graph) {
      throw new Error(`No task graph found for work item "${workItemId}"`);
    }

    // Mark task complete in graph
    const unblocked = graph.markComplete(taskId);

    // Publish task.completed event
    await this.config.eventBus.publish({
      type: 'task.completed',
      actor: 'orchestrator',
      workItemId,
      taskId,
      payload: {
        unblockedTasks: unblocked.map((t) => t.id),
      },
    });

    // If all tasks complete, advance the pipeline
    if (graph.isComplete()) {
      await this.advancePipeline(workItemId);
    }
  }

  getWorkItem(id: string): WorkItem | undefined {
    return this.workItems.get(id);
  }

  getAllWorkItems(): WorkItem[] {
    return Array.from(this.workItems.values());
  }

  getWorkItemsByStatus(status: PipelineStage): WorkItem[] {
    return Array.from(this.workItems.values()).filter(
      (wi) => wi.status === status,
    );
  }
}
