"use strict";

/* Browser history for the app router. It stores route data only; rendering stays in app.js. */
const Nav = (() => {
  const MARKER = "dirtpickle";
  let render = null;
  let locked = false;
  let listening = false;

  const stateFor = (name, params) => ({ app: MARKER, name, params: { ...params } });
  const isAppState = state => state && state.app === MARKER && state.name;

  function onPopState(event) {
    if (locked) {
      history.forward();
      return;
    }
    if (isAppState(event.state) && render) render(event.state.name, event.state.params || {});
  }

  function start(renderer) {
    render = renderer;
    if (!isAppState(history.state)) history.replaceState(stateFor("home", {}), "", location.href);
    if (!listening) {
      window.addEventListener("popstate", onPopState);
      listening = true;
    }
  }

  function push(name, params = {}) {
    history.pushState(stateFor(name, params), "", location.href);
  }

  function replace(name, params = {}) {
    history.replaceState(stateFor(name, params), "", location.href);
  }

  function lock(name = "pin", params = {}) {
    locked = true;
    replace(name, params);
  }

  function unlock() {
    locked = false;
  }

  return { start, push, replace, lock, unlock };
})();
