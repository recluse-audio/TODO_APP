const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

module.exports = {
  PORT: 3737,
  ROOT,
  GOALS_DIR: path.join(ROOT, 'GOALS'),
  TASKS_DIR: path.join(ROOT, 'TASKS'),
  DECISIONS_DIR: path.join(ROOT, 'DECISIONS'),
  WEB_DIR: path.join(__dirname, '..', 'web'),
};
