const fs = require('fs');
const { TASKS_DIR } = require('../config.js');
const { quoteYaml, removeFromInlineList, readLines } = require('../util.js');
const TodoItem = require('./base.js');

class Task extends TodoItem {
  static type = 'task';
  static dir = TASKS_DIR;
  static prefix = 'T-';
  static statuses = ['todo', 'in_progress', 'blocked', 'done', 'abandoned'];

  static serializeNew({ id, title, priority, created, target_date, goals, decisions, contribution_summary, groups, estimated_effort, body }) {
    let fm = `---\nid: ${id}\ntype: task\ntitle: ${quoteYaml(title)}\npriority: ${priority}\ncreated: ${created}\n`;
    if (target_date) fm += `target_date: ${target_date}\n`;
    fm += `status: todo\ngoals: [${(goals || []).join(', ')}]\ndecisions: [${(decisions || []).join(', ')}]\ncontribution_summary: ${quoteYaml(contribution_summary)}\ngroups: [${(groups || []).join(', ')}]\n`;
    if (estimated_effort) fm += `estimated_effort: ${quoteYaml(estimated_effort)}\n`;
    fm += `blocked_by: []\nrelated_tasks: []\n---\n`;
    if (body && body.trim()) fm += `\n${body.trim()}\n`;
    return fm;
  }

  static afterCreate(id, data) {
    const Goal = require('./goal.js');
    for (const gid of (data.goals || [])) {
      if (Goal.exists(gid)) Goal.load(gid).addTaskId(id);
    }
    for (const s of (data.satisfies || [])) {
      if (Goal.exists(s.goal)) Goal.load(s.goal).addTaskToCriterion(s.criterion, id);
    }
  }

  removeGoalId(goalId) {
    const raw = fs.readFileSync(this._file, 'utf8');
    fs.writeFileSync(this._file, removeFromInlineList(raw, 'goals', goalId));
  }

  removeSatisfiesForGoal(goalId) {
    const { eol, lines } = readLines(this._file);
    let inSatisfies = false;
    const out = [];
    for (const line of lines) {
      if (/^satisfies:\s*$/.test(line)) { inSatisfies = true; out.push(line); continue; }
      if (inSatisfies) {
        if (/^[A-Za-z_]/.test(line) || line === '---') { inSatisfies = false; out.push(line); continue; }
        if (/^\s+-\s*\{/.test(line) && line.includes(`goal: ${goalId}`)) continue;
      }
      out.push(line);
    }
    fs.writeFileSync(this._file, out.join(eol));
  }

  removeSatisfiesEntry(goalId, criterionIdx) {
    const { eol, lines } = readLines(this._file);
    let inSatisfies = false;
    const out = [];
    for (const line of lines) {
      if (/^satisfies:\s*$/.test(line)) { inSatisfies = true; out.push(line); continue; }
      if (inSatisfies) {
        if (/^[A-Za-z_]/.test(line) || line === '---') { inSatisfies = false; out.push(line); continue; }
        if (/^\s+-\s*\{/.test(line) &&
            line.includes(`goal: ${goalId}`) &&
            line.includes(`criterion: ${criterionIdx}`)) continue;
      }
      out.push(line);
    }
    fs.writeFileSync(this._file, out.join(eol));
  }

  delete() {
    const Goal = require('./goal.js');
    for (const goal of Goal.list()) {
      if (Array.isArray(goal.tasks) && goal.tasks.includes(this.id)) {
        goal.removeTaskId(this.id);
      }
      goal.removeTaskFromAllCriteria(this.id);
    }
    super.delete();
  }
}

module.exports = Task;
