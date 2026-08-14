/*
 * PATGo Scan — harness/load.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * Loads the real app files into a vm context, in the order index.html declares,
 * and hands back a handle for reaching into them.
 *
 * ⚠ THE LOAD ORDER IS DERIVED FROM index.html, NEVER HARD-CODED HERE. If it
 * were listed twice, the harness could go green against an order the browser
 * never uses — which is the exact failure the order tests exist to catch.
 *
 * ⚠ TOP-LEVEL const/let DO NOT ATTACH TO THE VM GLOBAL. Functions do. So
 * `app.fn('render')` works directly, but constants have to be bridged: the
 * loader scans the sources for top-level declarations and appends an export
 * block that copies them out. `app.val('APP_VERSION')` reads that bridge.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeContext, makeEl, DOC, LOCAL_STORAGE } = require('./stubs');

const ROOT = path.resolve(__dirname, '..');

function scriptOrderFromIndex() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const out = [];
  const re = /<script\s+src="([^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

function assetsFromSW() {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const block = sw.slice(sw.indexOf('const ASSETS'), sw.indexOf('];', sw.indexOf('const ASSETS')));
  const out = [];
  const re = /'\.\/([^']*)'/g;
  let m;
  while ((m = re.exec(block)) !== null) out.push(m[1]);
  return out;
}

function cacheVersion() {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const m = sw.match(/const CACHE_VERSION\s*=\s*'([^']+)'/);
  return m ? m[1] : '';
}

function readFile(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

// ⚠ SOURCE-SHAPE ASSERTIONS MUST READ CODE, NOT THE PROSE ABOUT IT. Every rule
// worth asserting is also explained in a comment right beside the code, and
// those comments necessarily contain the very strings the assertion greps for
// ("never render() on a keystroke", "window.APP_VERSION is undefined"). Without
// this, a well-documented file fails its own tests.
function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

// Top-level declarations only — a line that starts at column zero. Anything
// indented is inside a function and is not part of the shared global scope, so
// it cannot collide and must not be reported as a duplicate.
function topLevelDecls(src) {
  const out = [];
  const re = /^(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm;
  let m;
  while ((m = re.exec(src)) !== null) out.push({ kind: m[1], name: m[2] });
  return out;
}

function topLevelFns(src) {
  const out = [];
  const re = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

function loadApp(opts) {
  const options = opts || {};
  const files = scriptOrderFromIndex();
  const ctx = makeContext();

  // render.js reads #app at parse time, so it has to exist before the sources
  // run — exactly as it does in the browser, where the div precedes the scripts.
  const appEl = makeEl('div', 'app');
  DOC._byId['app'] = appEl;

  vm.createContext(ctx);

  const sources = {};
  const declNames = [];
  files.forEach((f) => {
    if (options.skipBoot && f === 'boot.js') return;
    sources[f] = readFile(f);
    topLevelDecls(sources[f]).forEach(d => declNames.push(d.name));
  });

  const combined = files
    .filter(f => sources[f] !== undefined)
    .map(f => '/* ===== ' + f + ' ===== */\n' + sources[f])
    .join('\n;\n');

  // The bridge. Wrapped per-name so a single missing declaration cannot take
  // the whole export block down with it.
  const bridge = '\n;var __vals = {};\n' + declNames.map(n =>
    `try { __vals[${JSON.stringify(n)}] = ${n}; } catch (e) {}`).join('\n');

  vm.runInContext(combined + bridge, ctx, { filename: 'patgoscan-combined.js' });

  return {
    ctx: ctx,
    files: files,
    sources: sources,
    appEl: appEl,
    doc: DOC,
    storage: LOCAL_STORAGE,
    fn(name) { return ctx[name]; },
    val(name) { return ctx.__vals ? ctx.__vals[name] : undefined; },
    state() { return ctx.__vals ? ctx.__vals.state : undefined; },
    el(id) { return DOC._byId[id] || null; },
    register(id) { return DOC.register(id); },
    dispatchKey(key, extra) {
      const ev = Object.assign({ key: key, repeat: false, preventDefault() { ev._prevented = true; } }, extra || {});
      DOC.dispatch('keydown', ev);
      return ev;
    },
  };
}

module.exports = {
  loadApp, scriptOrderFromIndex, assetsFromSW, cacheVersion,
  readFile, stripComments, topLevelDecls, topLevelFns, ROOT,
};
