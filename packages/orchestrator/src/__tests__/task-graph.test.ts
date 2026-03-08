import { describe, it, expect } from 'vitest';
import { TaskGraph } from '../graph/task-graph.js';

describe('TaskGraph', () => {
  it('returns tasks with no dependencies as ready', () => {
    const graph = new TaskGraph();
    graph.addTask({ id: 't1', title: 'Create theme context' });
    graph.addTask({ id: 't2', title: 'Add toggle', dependsOn: ['t1'] });
    graph.addTask({ id: 't3', title: 'Persist theme' }); // independent
    const ready = graph.getReady();
    expect(ready.map((t) => t.id)).toEqual(['t1', 't3']);
  });

  it('unblocks tasks when dependencies complete', () => {
    const graph = new TaskGraph();
    graph.addTask({ id: 't1', title: 'Create theme context' });
    graph.addTask({ id: 't2', title: 'Add toggle', dependsOn: ['t1'] });
    expect(graph.getReady().map((t) => t.id)).toEqual(['t1']);
    const unblocked = graph.markComplete('t1');
    expect(unblocked.map((t) => t.id)).toEqual(['t2']);
    expect(graph.getReady().map((t) => t.id)).toEqual(['t2']);
  });

  it('detects circular dependencies', () => {
    const graph = new TaskGraph();
    graph.addTask({ id: 't1', title: 'A', dependsOn: ['t2'] });
    graph.addTask({ id: 't2', title: 'B', dependsOn: ['t1'] });
    expect(() => graph.validate()).toThrow(/circular/i);
  });

  it('returns empty when all tasks are complete', () => {
    const graph = new TaskGraph();
    graph.addTask({ id: 't1', title: 'Only task' });
    graph.markComplete('t1');
    expect(graph.getReady()).toEqual([]);
    expect(graph.isComplete()).toBe(true);
  });

  it('handles multiple dependencies', () => {
    const graph = new TaskGraph();
    graph.addTask({ id: 't1', title: 'A' });
    graph.addTask({ id: 't2', title: 'B' });
    graph.addTask({ id: 't3', title: 'C', dependsOn: ['t1', 't2'] });
    expect(graph.getReady().map((t) => t.id)).toEqual(['t1', 't2']);
    graph.markComplete('t1');
    expect(graph.getReady().map((t) => t.id)).toEqual(['t2']); // t3 still blocked by t2
    graph.markComplete('t2');
    expect(graph.getReady().map((t) => t.id)).toEqual(['t3']); // now unblocked
  });

  it('validates missing dependency references', () => {
    const graph = new TaskGraph();
    graph.addTask({ id: 't1', title: 'A', dependsOn: ['nonexistent'] });
    expect(() => graph.validate()).toThrow();
  });
});
