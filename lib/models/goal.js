const fs = require('fs');
const { GOALS_DIR } = require('../config.js');
const { quoteYaml, removeFromInlineList, readLines } = require('../util.js');
const TodoItem = require('./base.js');

class Goal extends TodoItem {
  static type = 'goal';
  static dir = GOALS_DIR;
  static prefix = 'G-';
  static statuses = ['active', 'todo', 'completed', 'abandoned'];

  static serializeNew({ id, title, priority, created, target_date, measurable_outcome, criteria, why, conclusion, groups, body, data }) {
    let fm = `---\nid: ${id}\ntype: goal\ntitle: ${quoteYaml(title)}\npriority: ${priority}\ncreated: ${created}\n`;
    if (target_date) fm += `target_date: ${target_date}\n`;
    fm += `status: active\nmeasurable_outcome: ${quoteYaml(measurable_outcome)}\n`;
    if (criteria && criteria.length) {
      fm += `criteria:\n`;
      for (const c of criteria) fm += `  - { text: ${quoteYaml(c)}, done: false }\n`;
    }
    fm += `sub_goals: []\ngroups: [${(groups || []).join(', ')}]\nrelated_goals: []\ntasks: []\n`;
    if (data) fm += `data: ${quoteYaml(data)}\n`;
    if (conclusion) fm += `conclusion: ${quoteYaml(conclusion)}\n`;
    if (why && why.length) {
      fm += `why:\n`;
      for (const w of why) fm += `  - ${quoteYaml(w)}\n`;
    }
    fm += `---\n`;
    if (body && body.trim()) fm += `\n${body.trim()}\n`;
    return fm;
  }

  toggleCriterion(idx) {
    const { eol, lines } = readLines(this._file);
    let inCriteria = false, count = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^criteria:\s*$/.test(line)) { inCriteria = true; continue; }
      if (inCriteria) {
        if (/^[A-Za-z_]/.test(line) || line === '---') { inCriteria = false; continue; }
        if (/^\s+-\s*\{/.test(line)) {
          if (count === idx) {
            lines[i] = line.replace(/done:\s*(true|false)/, (_, v) => `done: ${v === 'true' ? 'false' : 'true'}`);
            fs.writeFileSync(this._file, lines.join(eol));
            return;
          }
          count++;
        }
      }
    }
    throw new Error(`Criterion idx ${idx} not found on ${this.id}`);
  }

  deleteCriterion(idx) {
    const Task = require('./task.js');
    const criterion = Array.isArray(this.criteria) && this.criteria[idx];
    if (criterion && Array.isArray(criterion.tasks)) {
      for (const taskId of criterion.tasks) {
        if (Task.exists(taskId)) Task.load(taskId).removeSatisfiesEntry(this.id, idx);
      }
    }
    const { eol, lines } = readLines(this._file);
    let inCriteria = false, count = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^criteria:\s*$/.test(line)) { inCriteria = true; continue; }
      if (inCriteria) {
        if (/^[A-Za-z_]/.test(line) || line === '---') { inCriteria = false; continue; }
        if (/^\s+-\s*\{/.test(line)) {
          if (count === idx) { lines.splice(i, 1); fs.writeFileSync(this._file, lines.join(eol)); return; }
          count++;
        }
      }
    }
  }

  addTaskToCriterion(idx, taskId) {
    const { eol, lines } = readLines(this._file);
    let inCriteria = false, count = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^criteria:\s*$/.test(line)) { inCriteria = true; continue; }
      if (inCriteria) {
        if (/^[A-Za-z_]/.test(line) || line === '---') break;
        if (/^\s+-\s*\{/.test(line)) {
          if (count === idx) {
            if (/tasks:\s*\[([^\]]*)\]/.test(line)) {
              lines[i] = line.replace(/tasks:\s*\[([^\]]*)\]/, (_, inner) => {
                const existing = inner.trim() ? inner.split(',').map(s => s.trim()).filter(Boolean) : [];
                if (!existing.includes(taskId)) existing.push(taskId);
                return `tasks: [${existing.join(', ')}]`;
              });
            } else {
              lines[i] = line.replace(/\s*\}\s*$/, `, tasks: [${taskId}]}`);
            }
            fs.writeFileSync(this._file, lines.join(eol));
            return;
          }
          count++;
        }
      }
    }
  }

  addTaskId(taskId) {
    const raw = fs.readFileSync(this._file, 'utf8');
    const updated = raw.replace(/^tasks:\s*\[([^\]]*)\]/m, (_, inner) => {
      const existing = inner.trim() ? inner.split(',').map(s => s.trim()).filter(Boolean) : [];
      existing.push(taskId);
      return `tasks: [${existing.join(', ')}]`;
    });
    fs.writeFileSync(this._file, updated);
  }

  removeTaskId(taskId) {
    const raw = fs.readFileSync(this._file, 'utf8');
    fs.writeFileSync(this._file, removeFromInlineList(raw, 'tasks', taskId));
  }

  removeTaskFromAllCriteria(taskId) {
    const { eol, lines } = readLines(this._file);
    let inCriteria = false, modified = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^criteria:\s*$/.test(line)) { inCriteria = true; continue; }
      if (inCriteria) {
        if (/^[A-Za-z_]/.test(line) || line === '---') { inCriteria = false; continue; }
        if (/^\s+-\s*\{/.test(line) && line.includes(taskId)) {
          lines[i] = line.replace(/tasks:\s*\[([^\]]*)\]/, (_, inner) => {
            const kept = inner.split(',').map(s => s.trim()).filter(s => s && s !== taskId);
            return `tasks: [${kept.join(', ')}]`;
          });
          modified = true;
        }
      }
    }
    if (modified) fs.writeFileSync(this._file, lines.join(eol));
  }

  delete() {
    const Task = require('./task.js');
    for (const task of Task.list()) {
      if (Array.isArray(task.goals) && task.goals.includes(this.id)) {
        task.removeGoalId(this.id);
      }
      if (Array.isArray(task.satisfies) && task.satisfies.some(s => s.goal === this.id)) {
        task.removeSatisfiesForGoal(this.id);
      }
    }
    super.delete();
  }
}

module.exports = Goal;
