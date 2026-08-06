import AppSettings from '../common/AppSettings.js';
import { PlaceKeeper } from '../common/PlaceKeeper.js';
import { resetWindowLayout } from '../common/settingsReset.js';
import { getConfig } from '../core/config.js';
import { getAllWindowTypes, getApp } from '../core/registry.js';
import { getWindowIcon } from '../core/windowIcons.js';
import { getGuidedTour } from './GuidedTour/GuidedTour.js';
import { promptSettingsReset } from './ResetSettingsButton.js';

const toSlug = (value) => value.replace(/\s+/g, '-').toLowerCase();
const isOn = (setting) => setting.checked === true || setting.checked === 'true';

function registerThemeCommands(palette) {
  const names = ['default', 'shiloh', 'jabbok', 'gethsemane'];
  const labels = { default: 'Normal', shiloh: 'Shiloh', jabbok: 'Jabbok', gethsemane: 'Gethsemane' };
  for (const themeName of names) {
    palette.registerCommand({
      name: `Theme: ${labels[themeName]}`,
      keywords: ['theme', 'color', 'dark', 'light', themeName],
      category: 'theme',
      execute() {
        for (const name of names) document.body.classList.remove(`theme-${name}`);
        document.body.classList.add(`theme-${themeName}`);
        AppSettings.setValue('config-theme', { themeName });
        palette.close();
      }
    });
  }
}

function registerToggleCommands(palette) {
  const config = getConfig();
  const names = config.settingToggleNames ?? [];
  const defaults = config.settingToggleDefaults ?? [];
  for (const [index, name] of names.entries()) {
    const id = name.replace(/\s/gi, '').toLowerCase();
    const fallback = { checked: defaults[index] };
    palette.registerCommand({
      name: `Toggle: ${name}`,
      keywords: ['toggle', 'setting', name.toLowerCase(), id],
      category: 'toggle',
      stayOpen: true,
      state: () => isOn(AppSettings.getValue(id, fallback)) ? 'ON' : 'OFF',
      execute() {
        const checked = !isOn(AppSettings.getValue(id, fallback));
        PlaceKeeper.preservePlace(() => {
          const toggle = document.querySelector(`#config-toggle-${id}`);
          toggle?.classList.toggle('toggle-on', checked);
          const input = toggle?.querySelector('input');
          if (input) input.checked = checked;
          document.body.classList.toggle(`toggle-${id}-on`, checked);
          document.body.classList.toggle(`toggle-${id}-off`, !checked);
        });
        AppSettings.setValue(id, { checked });
        palette.renderItems(palette.filteredItems);
      }
    });
  }
}

function initialWindowData(type, config, app) {
  const firstWindow = app?.windowManager?.getWindows()
    .find((windowComponent) => ['BibleWindow', 'CommentaryWindow'].includes(windowComponent.className));
  const current = firstWindow?.getData() ?? null;
  if (current) {
    return {
      fragmentid: current.fragmentid,
      sectionid: current.sectionid,
      ...(type === 'AudioWindow' ? { _activeBibleTextid: current.textid } : {})
    };
  }
  const fragmentid = config.newWindowFragmentid ?? 'JN1_1';
  return { fragmentid, sectionid: fragmentid.split('_')[0] };
}

function registerWindowCommands(palette) {
  const config = getConfig();
  const types = getAllWindowTypes();
  const disabled = new Set(config.disabledWindowTypes ?? []);
  const ordered = config.windowTypesOrder?.length
    ? config.windowTypesOrder.map((name) => types.find((type) => type.className === name)).filter(Boolean)
    : types;
  for (const windowType of ordered) {
    if (disabled.has(windowType.className)) continue;
    const { className: type, param: label } = windowType;
    palette.registerCommand({
      name: `Add Window: ${label.charAt(0).toUpperCase() + label.slice(1)}`,
      keywords: ['window', 'add', 'open', label, type.toLowerCase()],
      category: 'window',
      icon: getWindowIcon(type) || null,
      execute() {
        const app = getApp();
        const data = { ...(windowType.init ?? {}) };
        if (['BibleWindow', 'CommentaryWindow', 'AudioWindow'].includes(type)) {
          Object.assign(data, initialWindowData(type, config, app));
        }
        PlaceKeeper.preservePlace(() => app?.windowManager?.add(type, data));
        palette.close();
      }
    });
  }
}

function registerFontCommands(palette) {
  const config = getConfig();
  const stacks = Object.keys(config.fontFamilyStacks ?? {});
  for (const stack of stacks) {
    palette.registerCommand({
      name: `Font: ${stack}`,
      keywords: ['font', 'family', 'typeface', stack.toLowerCase()],
      category: 'font',
      execute() {
        PlaceKeeper.preservePlace(() => {
          for (const name of stacks) document.body.classList.remove(`config-font-family-${toSlug(name)}`);
          document.body.classList.add(`config-font-family-${toSlug(stack)}`);
          AppSettings.setValue('config-font-family', { fontName: stack });
        });
        const radio = document.querySelector(`#config-font-family-${toSlug(stack)}-value`);
        if (radio) radio.checked = true;
        palette.close();
      }
    });
  }
  registerFontSizeCommands(palette, config);
}

function registerFontSizeCommands(palette, config) {
  const minimum = config.fontSizeMin ?? 14;
  const maximum = config.fontSizeMax ?? 28;
  const step = config.fontSizeStep ?? 2;
  const fallback = config.fontSizeDefault ?? 18;
  const change = (delta) => {
    const current = AppSettings.getValue('config-font-size', { fontSize: fallback });
    const size = Math.min(maximum, Math.max(minimum, (parseInt(current.fontSize, 10) || fallback) + delta));
    PlaceKeeper.preservePlace(() => {
      for (let value = minimum; value <= maximum; value += step) {
        document.body.classList.remove(`config-font-size-${value}`);
      }
      document.body.classList.add(`config-font-size-${size}`);
      AppSettings.setValue('config-font-size', { fontSize: size });
    });
    const slider = document.querySelector('.settings-slider');
    if (slider) slider.value = size;
  };
  for (const [label, delta, keywords] of [
    ['Increase', step, ['font', 'size', 'bigger', 'larger', 'increase', 'zoom in']],
    ['Decrease', -step, ['font', 'size', 'smaller', 'decrease', 'zoom out']]
  ]) {
    palette.registerCommand({
      name: `Font Size: ${label}`,
      keywords,
      category: 'font',
      execute() {
        change(delta);
        palette.close();
      }
    });
  }
}

function registerActionCommands(palette) {
  const closeThen = (action) => () => {
    palette.close();
    action();
  };
  palette.registerCommand({
    name: 'Toggle Fullscreen', keywords: ['fullscreen', 'full', 'screen', 'maximize'], category: 'action',
    execute() {
      if (document.fullscreenEnabled) {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
      }
      palette.close();
    }
  });
  palette.registerCommand({
    name: 'Guided Tour', keywords: ['tour', 'guide', 'walkthrough', 'tutorial', 'help', 'intro'],
    category: 'action', icon: getWindowIcon('tour'), execute: closeThen(() => getGuidedTour()?.start())
  });
  palette.registerCommand({
    name: 'Focus Search', keywords: ['search', 'find', 'focus', 'input'], category: 'action',
    execute: closeThen(() => document.querySelector('#main-search-input')?.focus())
  });
  palette.registerCommand({
    name: 'Reset Settings', keywords: ['reset', 'settings', 'defaults', 'clear', 'theme', 'font'],
    category: 'action', execute: closeThen(promptSettingsReset)
  });
  palette.registerCommand({
    name: 'Restore Default Windows', keywords: ['restore', 'windows', 'layout', 'defaults'],
    category: 'action', execute: resetWindowLayout
  });
}

export function registerPaletteCommands(palette) {
  registerThemeCommands(palette);
  registerToggleCommands(palette);
  registerWindowCommands(palette);
  registerFontCommands(palette);
  registerActionCommands(palette);
}
