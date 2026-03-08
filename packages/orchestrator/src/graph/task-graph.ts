export interface GraphTask {
  id: string;
  title: string;
  dependsOn?: string[];
  assignedTo?: string; // team member handle
  status?: 'pending' | 'in_progress' | 'completed';
}

export class TaskGraph {
  private tasks = new Map<string, GraphTask>();
  private completed = new Set<string>();

  addTask(task: GraphTask): void {
    this.tasks.set(task.id, { ...task, status: task.status ?? 'pending' });
  }

  getReady(): GraphTask[] {
    const ready: GraphTask[] = [];
    for (const task of this.tasks.values()) {
      if (this.completed.has(task.id)) {
        continue;
      }
      const deps = task.dependsOn ?? [];
      const allDepsComplete = deps.every((dep) => this.completed.has(dep));
      if (allDepsComplete) {
        ready.push(task);
      }
    }
    return ready;
  }

  markComplete(taskId: string): GraphTask[] {
    this.completed.add(taskId);
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'completed';
    }

    // Return newly unblocked tasks: tasks that depend on taskId
    // and now have all dependencies completed
    const unblocked: GraphTask[] = [];
    for (const t of this.tasks.values()) {
      if (this.completed.has(t.id)) {
        continue;
      }
      const deps = t.dependsOn ?? [];
      if (!deps.includes(taskId)) {
        continue;
      }
      // This task depends on the one we just completed.
      // Check if ALL its dependencies are now complete.
      const allDepsComplete = deps.every((dep) => this.completed.has(dep));
      if (allDepsComplete) {
        unblocked.push(t);
      }
    }
    return unblocked;
  }

  isComplete(): boolean {
    for (const task of this.tasks.values()) {
      if (!this.completed.has(task.id)) {
        return false;
      }
    }
    return true;
  }

  validate(): void {
    // Check for references to non-existent tasks
    for (const task of this.tasks.values()) {
      for (const dep of task.dependsOn ?? []) {
        if (!this.tasks.has(dep)) {
          throw new Error(
            `Task "${task.id}" depends on non-existent task "${dep}"`,
          );
        }
      }
    }

    // Topological sort to detect cycles using Kahn's algorithm
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const task of this.tasks.values()) {
      if (!inDegree.has(task.id)) {
        inDegree.set(task.id, 0);
      }
      if (!adjacency.has(task.id)) {
        adjacency.set(task.id, []);
      }
      for (const dep of task.dependsOn ?? []) {
        // dep -> task.id (dep must come before task)
        if (!adjacency.has(dep)) {
          adjacency.set(dep, []);
        }
        adjacency.get(dep)!.push(task.id);
        inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    let visited = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      visited++;
      for (const neighbor of adjacency.get(current) ?? []) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (visited < this.tasks.size) {
      throw new Error('Circular dependency detected in task graph');
    }
  }

  getTask(id: string): GraphTask | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): GraphTask[] {
    return Array.from(this.tasks.values());
  }

  getCompletedCount(): number {
    return this.completed.size;
  }

  getTotalCount(): number {
    return this.tasks.size;
  }
}
