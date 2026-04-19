const Goal = require('./goal.js');
const Task = require('./task.js');
const Decision = require('./decision.js');

const KINDS = { goal: Goal, task: Task, decision: Decision };

function snapshot() {
  return { goals: Goal.list(), tasks: Task.list(), decisions: Decision.list() };
}

function kindOrThrow(kind) {
  const cls = KINDS[kind];
  if (!cls) throw new Error(`Unknown kind: ${kind}`);
  return cls;
}

module.exports = { Goal, Task, Decision, KINDS, snapshot, kindOrThrow };
