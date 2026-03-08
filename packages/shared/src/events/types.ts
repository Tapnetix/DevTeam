export interface DevTeamEvent {
  type: string;
  actor: string;
  workItemId?: string;
  taskId?: string;
  payload: Record<string, unknown>;
  timestamp?: Date;
}

export type EventHandler = (event: DevTeamEvent) => void | Promise<void>;

export interface EventBus {
  publish(event: DevTeamEvent): Promise<void>;
  subscribe(pattern: string, handler: EventHandler): () => void;
  close(): Promise<void>;
}
