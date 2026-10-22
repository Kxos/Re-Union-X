'use strict';
// Local reference data folders: material of the user's own, not provided by this project and never versioned.
// Same settings as recon/tools/private_tools.py: an environment variable wins, then "local_paths" in khux_local.json
// (in KHUX_PRIVATE_TOOLS, or <repo>/../../private). Keys:
//   jp_data   KHUX_JP_DATA   a local reference data folder with the JP 4.3.1 game data (cocostudio/, json/, img/ ...)
//   ref_work  KHUX_REF_WORK  a local work folder derived from that reference data
// When a folder is not configured the result is a path that does not exist (callers already skip missing data).
const fs = require('fs');
const path = require('path');

const ENV = { jp_data: 'KHUX_JP_DATA', ref_work: 'KHUX_REF_WORK' };

function privateRoot() {
  return path.resolve(process.env.KHUX_PRIVATE_TOOLS || path.join(__dirname, '..', '..', '..', 'private'));
}

function config() {
  const p = path.join(privateRoot(), 'khux_local.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; }
}

function localPath(key, ...parts) {
  if (!ENV[key]) throw new Error(`local-paths: unknown key ${key}`);
  const base = process.env[ENV[key]] || (config().local_paths || {})[key]
    || path.join(privateRoot(), `<not configured: ${ENV[key]}>`);
  return path.join(base, ...parts);
}

module.exports = { localPath, privateRoot };
