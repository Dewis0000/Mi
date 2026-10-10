/* StreOps prototype runtime.
   Renders a page template with {{ holes }}, <template data-for> / <template data-if>
   and on* handlers from a Component class (renderVals + setState).
   Re-renders patch the live DOM in place, so CSS transitions keep running. */
(function () {
  'use strict';

  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(patch) {
      if (typeof patch === 'function') patch = patch(this.state, this.props);
      this.state = Object.assign({}, this.state, patch);
      if (this.__schedule) this.__schedule();
    }
    forceUpdate() { if (this.__schedule) this.__schedule(); }
  }
  window.DCLogic = DCLogic;

  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^'.*'$|^".*"$/.test(path)) return path.slice(1, -1);
    const parts = path.split('.');
    let v = scope[parts[0]];
    for (let i = 1; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }

  function interp(str, scope) {
    return str.replace(HOLE, (m, p) => {
      const v = lookup(p, scope);
      return v == null || v === false ? '' : String(v);
    });
  }

  // Builds fresh DOM for one template node into `out`.
  function build(node, scope, out) {
    if (node.nodeType === 3) {
      const t = node.nodeValue;
      out.appendChild(document.createTextNode(t.indexOf('{{') >= 0 ? interp(t, scope) : t));
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.localName === 'template' && node.hasAttribute('data-for')) {
      const list = lookup(node.getAttribute('data-for'), scope) || [];
      const as = node.getAttribute('data-as') || 'item';
      list.forEach((it, i) => {
        const sc = Object.create(scope);
        sc[as] = it;
        sc.$index = i;
        node.content.childNodes.forEach((c) => build(c, sc, out));
      });
      return;
    }
    if (node.localName === 'template' && node.hasAttribute('data-if')) {
      if (lookup(node.getAttribute('data-if'), scope)) {
        node.content.childNodes.forEach((c) => build(c, scope, out));
      }
      return;
    }

    const el = document.createElementNS(node.namespaceURI, node.localName);
    el.__h = {};
    for (const a of Array.from(node.attributes)) {
      const name = a.name;
      const val = a.value;
      if (name.indexOf('hint-') === 0) continue;
      const m = val.match(WHOLE);
      if (m) {
        const v = lookup(m[1], scope);
        if (/^on[a-z]/i.test(name)) { el.__h[name.slice(2).toLowerCase()] = v; continue; }
        if (name === 'value') { el.__value = v; continue; }
        if (v === false || v == null) continue;
        if (v === true) { el.setAttribute(name, name.indexOf('aria-') === 0 ? 'true' : ''); continue; }
        el.setAttribute(name, String(v));
        continue;
      }
      el.setAttribute(name, val.indexOf('{{') >= 0 ? interp(val, scope) : val);
    }
    const kids = node.localName === 'template' ? node.content.childNodes : node.childNodes;
    kids.forEach((c) => build(c, scope, el));
    out.appendChild(el);
  }

  function eventName(el, key) {
    if (key === 'change') {
      const tag = el.localName;
      if (tag === 'select') return 'change';
      if (tag === 'input' || tag === 'textarea') return 'input';
    }
    return key;
  }

  function bind(el) {
    if (!el.__bound) el.__bound = {};
    for (const key of Object.keys(el.__h || {})) {
      const evt = eventName(el, key);
      if (el.__bound[evt]) continue;
      el.__bound[evt] = true;
      el.addEventListener(evt, (ev) => {
        const f = el.__h && el.__h[key];
        if (typeof f === 'function') f(ev);
      });
    }
  }

  function applyValue(el) {
    if (!('__value' in el)) return;
    const v = el.__value == null ? '' : String(el.__value);
    if (el.value !== v) el.value = v;
  }

  function wire(node) {
    if (node.nodeType !== 1) return;
    bind(node);
    node.childNodes.forEach(wire);
    applyValue(node);
  }

  function sameKind(a, b) {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType !== 1) return true;
    return a.localName === b.localName && a.namespaceURI === b.namespaceURI;
  }

  function morphNode(l, f) {
    if (l.nodeType === 3 || l.nodeType === 8) {
      if (l.nodeValue !== f.nodeValue) l.nodeValue = f.nodeValue;
      return;
    }
    for (const a of Array.from(l.attributes)) {
      if (!f.hasAttribute(a.name)) l.removeAttribute(a.name);
    }
    for (const a of Array.from(f.attributes)) {
      if (l.getAttribute(a.name) !== a.value) l.setAttribute(a.name, a.value);
    }
    l.__h = f.__h;
    if ('__value' in f) l.__value = f.__value; else delete l.__value;
    bind(l);
    morphChildren(l, f);
    applyValue(l);
  }

  function morphChildren(liveP, freshP) {
    const fresh = Array.from(freshP.childNodes);
    for (let i = 0; i < fresh.length; i++) {
      const f = fresh[i];
      const l = liveP.childNodes[i];
      if (!l) { liveP.appendChild(f); wire(f); continue; }
      if (sameKind(l, f)) morphNode(l, f);
      else { liveP.replaceChild(f, l); wire(f); }
    }
    while (liveP.childNodes.length > fresh.length) liveP.removeChild(liveP.lastChild);
  }

  window.DCMount = function (Comp) {
    const tpl = document.getElementById('dc');
    const root = document.getElementById('app');
    const inst = new Comp({});
    let pending = false;
    function render() {
      pending = false;
      const vals = inst.renderVals() || {};
      const scratch = document.createElement('div');
      tpl.content.childNodes.forEach((c) => build(c, vals, scratch));
      morphChildren(root, scratch);
    }
    inst.__schedule = () => {
      if (pending) return;
      pending = true;
      Promise.resolve().then(render);
    };
    render();
    if (typeof inst.componentDidMount === 'function') inst.componentDidMount();
  };

  // Прототип без бэкенда: формы не отправляются.
  document.addEventListener('submit', (e) => e.preventDefault());
})();
