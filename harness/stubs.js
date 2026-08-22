/*
 * PATGo Scan — harness/stubs.js
 * (c) 2026 Peter Birchley. All rights reserved.
 *
 * Just enough browser to let the app's files load and run under Node.
 *
 * ⚠ A STUB THAT IS TOO THIN IS WORSE THAN NO TEST. If an element stub is
 * missing a property the app reads, the code under test bails out BEFORE it
 * reaches the assertion — and the assertion passes green having tested nothing.
 * That is the single most common way a suite lies. When adding a stub, ask what
 * the real code touches, not what makes the error go away.
 */

function makeClassList() {
  const set = new Set();
  return {
    _set: set,
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    toggle: (c, on) => { if (on === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else if (on) set.add(c); else set.delete(c); },
  };
}

function makeEl(tag, id) {
  const el = {
    tagName: String(tag || 'DIV').toUpperCase(),
    nodeType: 1,
    id: id || '',
    value: '',
    textContent: '',
    _html: '',
    style: { cssText: '' },
    files: [],
    children: [],
    classList: makeClassList(),
    _listeners: {},
    offsetWidth: 10,
    isContentEditable: false,
    setAttribute(k, v) { this['_attr_' + k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this, '_attr_' + k) ? this['_attr_' + k] : null; },
    removeAttribute(k) { delete this['_attr_' + k]; },
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener() {},
    dispatch(type, ev) { (this._listeners[type] || []).forEach(fn => fn(ev)); },
    // ⚠ V3: THESE REGISTER BY id, AND THAT IS NOT TIDINESS. Before, only
    // DOC.register() put anything in _byId, so document.getElementById() could
    // not see a node the app had genuinely appended. sheetIsOpen() reads the
    // backdrop by id and therefore returned false with a sheet plainly open —
    // which meant resetApp()'s sheet teardown never fired, _closeSheet() never
    // removed anything, and the sheet tests passed only because openSheetEl()
    // reads the LAST child of body and each new sheet piled on top of the last.
    // Green throughout, testing a document that could never exist in a browser.
    appendChild(c) {
      this.children.push(c);
      c.parentNode = this;
      if (c.id) DOC._byId[c.id] = c;
      return c;
    },
    removeChild(c) {
      this.children = this.children.filter(x => x !== c);
      if (c.id && DOC._byId[c.id] === c) delete DOC._byId[c.id];
      c.parentNode = null;
      return c;
    },
    // ⚠ RETURNS A STUB, NOT null. The sheet builders do
    // sheet.querySelector('#x').onclick = … immediately after setting innerHTML.
    // Returning null there throws inside the builder, the group aborts, and the
    // assertion that mattered never runs. The stub is cached per selector so
    // that two lookups of the same id are the same node, which is what lets a
    // test click a sheet button it looked up earlier.
    //
    // ⚠ V10 — WITH ONE EXCEPTION, AND IT IS THERE BECAUSE THE BLANKET RULE HID
    // A REAL CRASH. Mutation M174 removed the `if (locScan)` guard around a
    // button that V10 makes conditional; in a browser that is an immediate
    // TypeError inside the sheet builder, leaving a half-wired edit sheet with
    // no Save and no Cancel. The suite stayed green, because this stub
    // manufactured the button that was not there. A stub that cannot fail the
    // way the browser fails is a stub that certifies broken code.
    //
    // So: an `#id` selector looked up on a node whose innerHTML HAS been set
    // and does NOT contain that id returns null, exactly as the browser would.
    // Everything else keeps the permissive behaviour above — the exception is
    // narrow on purpose, because the permissiveness is load-bearing for every
    // builder that queries before the test has set any HTML at all.
    querySelector(sel) {
      if (sel.charAt(0) === '#' && sel.indexOf(' ') === -1 &&
          this._html && this._html.indexOf('id="' + sel.slice(1) + '"') === -1) {
        return null;
      }
      this._q = this._q || {};
      if (!this._q[sel]) {
        const child = makeEl(sel.indexOf('input') !== -1 ? 'input' : 'button');
        child.parentNode = this;
        child._sel = sel;
        this._q[sel] = child;
      }
      return this._q[sel];
    },
    querySelectorAll(sel) {
      this._qa = this._qa || {};
      if (!this._qa[sel]) this._qa[sel] = [];
      return this._qa[sel];
    },
    closest(sel) {
      // Only the shapes the app actually uses: '[data-action]' and '.class'.
      let node = this;
      while (node) {
        if (sel.charAt(0) === '[') {
          const k = sel.slice(1, -1);
          if (node.getAttribute && node.getAttribute(k) !== null) return node;
        } else if (sel.charAt(0) === '.') {
          if (node.classList && node.classList.contains(sel.slice(1))) return node;
        }
        node = node.parentNode;
      }
      return null;
    },
    focus() { DOC.activeElement = this; },
    select() { this._selected = true; },
    click() { this.dispatch('click', { target: this }); },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = String(v); },
    configurable: true,
  });
  return el;
}

// V3. A stand-in for window.visualViewport. `keyboard(h)` shrinks it the way
// iOS does — the LAYOUT viewport (innerHeight) is deliberately left alone,
// because that discrepancy IS the bug the sheets have to survive.
function makeVisualViewport() {
  return {
    offsetTop: 0, offsetLeft: 0, width: 390, height: 844,
    _listeners: {},
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      this._listeners[type] = (this._listeners[type] || []).filter(f => f !== fn);
    },
    _count(type) { return (this._listeners[type] || []).length; },
    _fire(type) { (this._listeners[type] || []).slice().forEach(fn => fn()); },
    keyboard(h) { this.height = 844 - h; this._fire('resize'); },
    reset() { this.offsetTop = 0; this.offsetLeft = 0; this.width = 390; this.height = 844; },
  };
}

const DOC = {
  _byId: {},
  activeElement: null,
  body: makeEl('body'),
  documentElement: makeEl('html'),
  _listeners: {},
  getElementById(id) { return DOC._byId[id] || null; },
  createElement(tag) { return makeEl(tag); },
  addEventListener(type, fn) { (DOC._listeners[type] = DOC._listeners[type] || []).push(fn); },
  removeEventListener() {},
  // Dispatch through the REAL surface the browser uses. ⚠ At least one
  // assertion per listener-based feature must go through here rather than
  // calling the handler directly — a handler that is never wired up passes
  // every direct-call test in the suite.
  dispatch(type, ev) { (DOC._listeners[type] || []).forEach(fn => fn(ev)); },
  _bySelector() { return null; },
  _allBySelector() { return []; },
  register(id) { const el = makeEl('input', id); DOC._byId[id] = el; return el; },
  reset() { DOC._byId = {}; DOC.activeElement = null; DOC._listeners = {}; DOC.body = makeEl('body'); },
};

const STORE = {};
const LOCAL_STORAGE = {
  _data: STORE,
  getItem(k) { return Object.prototype.hasOwnProperty.call(STORE, k) ? STORE[k] : null; },
  setItem(k, v) { STORE[k] = String(v); },
  removeItem(k) { delete STORE[k]; },
  clear() { Object.keys(STORE).forEach(k => delete STORE[k]); },
  key(i) { return Object.keys(STORE)[i]; },
  get length() { return Object.keys(STORE).length; },
};

function makeContext() {
  DOC.reset();
  LOCAL_STORAGE.clear();
  const ctx = {
    document: DOC,
    localStorage: LOCAL_STORAGE,
    navigator: { userAgent: 'harness', vibrate: () => true, clipboard: { writeText: () => Promise.resolve() } },
    console: console,
    innerWidth: 390, innerHeight: 844,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    // V3. The sheets size themselves from this, so a bystander object would let
    // every keyboard assertion pass on a build that never read it. It records
    // its own listeners so a test can prove the sheet re-syncs on a keyboard
    // event rather than only on open — the failure mode being guarded is a
    // sheet that is positioned once and then abandoned when the keyboard moves.
    visualViewport: makeVisualViewport(),
    location: { href: '', reload() {} },
    scrollTo() {},
    AudioContext: null,
    addEventListener() {},
    setTimeout: (fn) => { return 0; },        // timers never fire in the harness
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { try { fn(); } catch (e) {} return 0; },
    Blob: function (parts) { this.parts = parts; },
    File: function (parts, name) { this.parts = parts; this.name = name; },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    FileReader: function () {},
    Date: Date, Math: Math, JSON: JSON, Set: Set, Array: Array, Object: Object,
    String: String, Number: Number, Boolean: Boolean, isFinite: isFinite,
    parseInt: parseInt, parseFloat: parseFloat, RegExp: RegExp, Error: Error,
    Promise: Promise, encodeURIComponent: encodeURIComponent,
  };
  // ⚠ window MUST BE THE GLOBAL OBJECT ITSELF, not a separate object beside it.
  // In a browser `window === globalThis`, which is why bootIntegrityOK() can
  // read a top-level `function` back off `window[name]`. Pointing window at a
  // bystander object made every probe report missing and the guard fail on a
  // perfectly healthy build — which then skipped the whole boot tail, so
  // initScanner() never ran and a dozen scanner assertions "passed" by testing
  // nothing at all. Exactly the hollow-pass shape the skill warns about.
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;
  return ctx;
}

module.exports = { makeContext, makeEl, DOC, LOCAL_STORAGE };
