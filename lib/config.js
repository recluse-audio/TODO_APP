const path = require('path');

const CONTENT_DIR = process.env.CONTENT_DIR
  ? path.resolve(process.env.CONTENT_DIR)
  : path.resolve(__dirname, '..', '..', 'TODO');

module.exports = {
  PORT: 3737,
  ROOT: CONTENT_DIR,
  GOALS_DIR: path.join(CONTENT_DIR, 'GOALS'),
  TASKS_DIR: path.join(CONTENT_DIR, 'TASKS'),
  DECISIONS_DIR: path.join(CONTENT_DIR, 'DECISIONS'),
  WEB_DIR: path.join(__dirname, '..', 'web'),
};
