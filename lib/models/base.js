const fs = require('fs');
const path = require('path');
const { parseFile } = require('../yaml.js');
const { slugify, removeFromInlineList } = require('../util.js');

class TodoItem {
  // subclass static fields: type, dir, prefix, statuses, defaultStatus

  constructor(fm, body, filepath) {
    Object.assign(this, fm);
    this.body = (body || '').trim();
    this._file = filepath;
  }

  static list() {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter(f => f.startsWith(this.prefix) && f.endsWith('.md'))
      .map(f => {
        const fp = path.join(this.dir, f);
        const { frontmatter, body } = parseFile(fp);
        return new this(frontmatter, body, fp);
      });
  }

  static load(id) {
    const fp = path.join(this.dir, `${id}.md`);
    if (!fs.existsSync(fp)) throw new Error(`${this.type} ${id} not found`);
    const { frontmatter, body } = parseFile(fp);
    return new this(frontmatter, body, fp);
  }

  static exists(id) {
    return fs.existsSync(path.join(this.dir, `${id}.md`));
  }

  static create(data) {
    const today = new Date().toISOString().slice(0, 10);
    const slug = slugify(data.title);
    const id = `${this.prefix}${slug}`;
    const fp = path.join(this.dir, `${id}.md`);
    if (fs.existsSync(fp)) throw new Error(`${this.type} ${id} already exists — choose a different title`);
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(fp, this.serializeNew({ ...data, id, created: today }));
    this.afterCreate(id, data);
    return id;
  }

  static afterCreate(id, data) {}
  static serializeNew(data) { throw new Error(`${this.type}: subclass must implement serializeNew`); }

  setStatus(newStatus) {
    if (!this.constructor.statuses.includes(newStatus)) {
      throw new Error(`Invalid ${this.constructor.type} status: ${newStatus}`);
    }
    const raw = fs.readFileSync(this._file, 'utf8');
    fs.writeFileSync(this._file, raw.replace(/^status:\s*\w+/m, `status: ${newStatus}`));
    this.status = newStatus;
  }

  addGroup(group) {
    const g = String(group || '').trim().toLowerCase();
    if (!g) return;
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(g)) throw new Error(`Invalid group name: ${group}`);
    const raw = fs.readFileSync(this._file, 'utf8');
    if (!/^groups:\s*\[/m.test(raw)) throw new Error(`No groups field on ${this.id}`);
    const updated = raw.replace(/^groups:\s*\[([^\]]*)\]/m, (_, inner) => {
      const existing = inner.trim() ? inner.split(',').map(s => s.trim()).filter(Boolean) : [];
      if (existing.includes(g)) return `groups: [${existing.join(', ')}]`;
      existing.push(g);
      return `groups: [${existing.join(', ')}]`;
    });
    fs.writeFileSync(this._file, updated);
  }

  removeGroup(group) {
    const raw = fs.readFileSync(this._file, 'utf8');
    fs.writeFileSync(this._file, removeFromInlineList(raw, 'groups', String(group)));
  }

  delete() {
    fs.unlinkSync(this._file);
  }
}

module.exports = TodoItem;
