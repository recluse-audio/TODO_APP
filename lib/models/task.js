const fs = require('fs');
const { TASKS_DIR } = require('../config.js');
const { quoteYaml, removeFromInlineList, readLines } = require('../util.js');
const TodoItem = require('./base.js');

class Task extends TodoItem {
  static type = 'task';
  static dir = TASKS_DIR;
  static prefix = 'T-';
  static statuses = ['todo', 'in_progress', 'blocked', 'done', 'abandoned'];

  static serializeNew({ id, title, priority, created, target_date, goals, decisions, contribution_summary, groups, estimated_effort, steps, body }) {
    let fm = `---\nid: ${id}\ntype: task\ntitle: ${quoteYaml(title)}\npriority: ${priority}\ncreated: ${created}\n`;
    if (target_date) fm += `target_date: ${target_date}\n`;
    fm += `status: todo\ngoals: [${(goals || []).join(', ')}]\ndecisions: [${(decisions || []).join(', ')}]\ncontribution_summary: ${quoteYaml(contribution_summary)}\ngroups: [${(groups || []).join(', ')}]\n`;
    if (estimated_effort) fm += `estimated_effort: ${quoteYaml(estimated_effort)}\n`;
    if (steps && steps.length) {
      fm += `steps:\n`;
      for (const s of steps) fm += `  - ${quoteYaml(s)}\n`;
    }
    fm += `blocked_by: []\nrelated_tasks: []\n---\n`;
    if (body && body.trim()) fm += `\n${body.trim()}\n`;
    return fm;
  }

  addStep(text) {
    const newLine = `  - ${quoteYaml(text)}`;
    const { eol, lines } = readLines(this._file);
    let stepsStart = -1, insertAt = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^steps:\s*$/.test(lines[i])) { stepsStart = i; continue; }
      if (stepsStart !== -1 && insertAt === -1) {
        if (/^[A-Za-z_]/.test(lines[i]) || lines[i] === '---') { insertAt = i; break; }
      }
    }
    if (stepsStart !== -1) {
      if (insertAt === -1) insertAt = lines.length;
      lines.splice(insertAt, 0, newLine);
    } else {
      let anchor = lines.findIndex(l => /^blocked_by:/.test(l));
      if (anchor === -1) anchor = lines.findIndex((l, i) => i > 0 && l === '---');
      if (anchor === -1) throw new Error(`Cannot locate insertion point in ${this.id}`);
      lines.splice(anchor, 0, 'steps:', newLine);
    }
    fs.writeFileSync(this._file, lines.join(eol));
  }

  editStep(idx, text) {
    const { eol, lines } = readLines(this._file);
    let inSteps = false, count = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^steps:\s*$/.test(line)) { inSteps = true; continue; }
      if (inSteps) {
        if (/^[A-Za-z_]/.test(line) || line === '---') { inSteps = false; continue; }
        if (/^\s+-\s+/.test(line)) {
          if (count === idx) {
            lines[i] = `  - ${quoteYaml(text)}`;
            fs.writeFileSync(this._file, lines.join(eol));
            return;
          }
          count++;
        }
      }
    }
    throw new Error(`Step idx ${idx} not found on ${this.id}`);
  }

  toggleStep(idx) {
    const { eol, lines } = readLines(this._file);
    let inSteps = false, count = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^steps:\s*$/.test(line)) { inSteps = true; continue; }
      if (inSteps) {
        if (/^[A-Za-z_]/.test(line) || line === '---') { inSteps = false; continue; }
        if (/^\s+-\s+/.test(line)) {
          if (count === idx) {
            const m = line.match(/^(\s+-\s+)(.*)$/);
            const indent = m[1];
            let text = m[2];
            let quote = '';
            if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
              quote = text[0];
              text = text.slice(1, -1);
            }
            if (text.startsWith('[x] ')) text = '[ ] ' + text.slice(4);
            else if (text.startsWith('[ ] ')) text = '[x] ' + text.slice(4);
            else text = '[x] ' + text;
            lines[i] = indent + (quote ? quote + text + quote : quoteYaml(text));
            fs.writeFileSync(this._file, lines.join(eol));
            return;
          }
          count++;
        }
      }
    }
    throw new Error(`Step idx ${idx} not found on ${this.id}`);
  }

  deleteStep(idx) {
    const { eol, lines } = readLines(this._file);
    let inSteps = false, count = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^steps:\s*$/.test(line)) { inSteps = true; continue; }
      if (inSteps) {
        if (/^[A-Za-z_]/.test(line) || line === '---') { inSteps = false; continue; }
        if (/^\s+-\s+/.test(line)) {
          if (count === idx) { lines.splice(i, 1); fs.writeFileSync(this._file, lines.join(eol)); return; }
          count++;
        }
      }
    }
    throw new Error(`Step idx ${idx} not found on ${this.id}`);
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
