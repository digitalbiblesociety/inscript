import { PlaceKeeper } from '../../common/PlaceKeeper.js';
import { getApp } from '../../core/registry.js';

export class GuidedTourContext {
  constructor(controller, helpers) {
    this.controller = controller;
    this.memory = new Map();
    this.addedWindowIds = new Map();
    this.value = {
      $: helpers.$,
      sleep: helpers.sleep,
      waitFor: helpers.waitFor,
      click: helpers.click,
      typeInto: helpers.typeInto,
      dragBy: helpers.dragBy,
      remember: (key, value) => this.memory.set(key, value),
      recall: (key) => this.memory.get(key),
      addWindow: (className, data) => this.addWindow(className, data),
      trackNewWindows: (action) => this.trackNewWindows(action)
    };
  }

  owningStep() {
    return this.controller.entering ?? this.controller.steps[this.controller.index] ?? null;
  }

  seedWindowData(className, data, manager) {
    const seed = { ...data };
    if (!['BibleWindow', 'CommentaryWindow', 'AudioWindow'].includes(className)) return seed;
    const anchor = manager.getWindows()
      .find((windowComponent) => ['BibleWindow', 'CommentaryWindow'].includes(windowComponent.className));
    const current = anchor?.getData() ?? null;
    const fragmentid = current?.fragmentid ?? this.controller.config.newWindowFragmentid ?? 'JN1_1';
    seed.fragmentid = fragmentid;
    seed.sectionid = current?.sectionid ?? fragmentid.split('_')[0];
    if (className === 'AudioWindow' && current?.textid) seed._activeBibleTextid = current.textid;
    return seed;
  }

  recordWindow(step, id) {
    if (!step) return;
    const owned = this.addedWindowIds.get(step.id) ?? [];
    owned.push(id);
    this.addedWindowIds.set(step.id, owned);
  }

  async addWindow(className, data = {}) {
    const manager = getApp()?.windowManager;
    if (!manager) return null;
    const existing = manager.getWindows().find((windowComponent) => windowComponent.className === className);
    if (existing) return existing;
    const seed = this.seedWindowData(className, data, manager);
    let added = null;
    PlaceKeeper.preservePlace(() => { added = manager.add(className, seed); });
    if (!added) return null;
    this.recordWindow(this.owningStep(), added.id);
    if (added.ready) await added.ready;
    await this.controller.helpers.waitFor(() => document.querySelector(`.window.${className}`));
    return added;
  }

  async trackNewWindows(action) {
    const manager = getApp()?.windowManager;
    const before = new Set(manager?.getWindows().map((windowComponent) => windowComponent.id) ?? []);
    await action();
    const step = this.owningStep();
    if (!manager || !step) return;
    for (const windowComponent of manager.getWindows()) {
      if (!before.has(windowComponent.id)) this.recordWindow(step, windowComponent.id);
    }
  }

  closeStepWindows(step) {
    const owned = this.addedWindowIds.get(step.id);
    if (!owned) return;
    const manager = getApp()?.windowManager;
    PlaceKeeper.preservePlace(() => {
      for (const id of owned) manager?.remove(id);
    });
    this.addedWindowIds.delete(step.id);
  }

  reset() {
    this.memory.clear();
    this.addedWindowIds.clear();
  }
}
