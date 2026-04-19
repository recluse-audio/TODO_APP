import { GoalView } from './goal.js';
import { TaskView } from './task.js';
import { DecisionView } from './decision.js';

export { GoalView, TaskView, DecisionView };

export const VIEW_CLASSES = { goal: GoalView, task: TaskView, decision: DecisionView };

export function wrapSnapshot(raw) {
  return {
    goals: (raw.goals || []).map(g => new GoalView(g)),
    tasks: (raw.tasks || []).map(t => new TaskView(t)),
    decisions: (raw.decisions || []).map(d => new DecisionView(d)),
  };
}
