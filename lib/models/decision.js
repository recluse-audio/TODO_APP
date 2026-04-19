const fs = require('fs');
const { DECISIONS_DIR } = require('../config.js');
const { quoteYaml, readLines } = require('../util.js');
const TodoItem = require('./base.js');

class Decision extends TodoItem {
  static type = 'decision';
  static dir = DECISIONS_DIR;
  static prefix = 'D-';
  static statuses = ['open', 'decided', 'abandoned'];

  static serializeNew({ id, title, priority, created, choices, considerations, summary, why, data, groups, body }) {
    let fm = `---\nid: ${id}\ntype: decision\ntitle: ${quoteYaml(title)}\npriority: ${priority}\ncreated: ${created}\nstatus: open\n`;
    if (choices && choices.length) {
      fm += `choices:\n`;
      for (const c of choices) fm += `  - { text: ${quoteYaml(c)}, chosen: false }\n`;
    }
    if (considerations && considerations.length) {
      fm += `considerations:\n`;
      for (const c of considerations) fm += `  - ${quoteYaml(c)}\n`;
    }
    fm += `groups: [${(groups || []).join(', ')}]\n`;
    if (summary) fm += `summary: ${quoteYaml(summary)}\n`;
    if (why) fm += `why: ${quoteYaml(why)}\n`;
    if (data) fm += `data: ${quoteYaml(data)}\n`;
    fm += `---\n`;
    if (body && body.trim()) fm += `\n${body.trim()}\n`;
    return fm;
  }

  selectChoice(idx) {
    const { eol, lines } = readLines(this._file);
    let inChoices = false, count = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^choices:\s*$/.test(line)) { inChoices = true; continue; }
      if (inChoices) {
        if (/^[A-Za-z_]/.test(line) || line === '---') { inChoices = false; continue; }
        if (/^\s+-\s*\{/.test(line)) {
          const shouldBeChosen = (count === idx);
          lines[i] = line.replace(/chosen:\s*(true|false)/, `chosen: ${shouldBeChosen}`);
          count++;
        }
      }
    }
    fs.writeFileSync(this._file, lines.join(eol));
  }

  deleteChoice(idx) {
    const { eol, lines } = readLines(this._file);
    let inChoices = false, count = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^choices:\s*$/.test(line)) { inChoices = true; continue; }
      if (inChoices) {
        if (/^[A-Za-z_]/.test(line) || line === '---') { inChoices = false; continue; }
        if (/^\s+-\s*\{/.test(line)) {
          if (count === idx) { lines.splice(i, 1); fs.writeFileSync(this._file, lines.join(eol)); return; }
          count++;
        }
      }
    }
  }
}

module.exports = Decision;
