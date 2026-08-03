const plugins = new Map();
const windowTypes = new Map();
const menuComponents = new Map();
const textProviders = new Map();
const audioSources = [];

export const VERSION = '5.0.0';

export const registerPlugin = (name, PluginClass) => {
  plugins.set(name, PluginClass);
};

export const getAllPlugins = () => Array.from(plugins.entries());

/**
 * `config` carries {param, className, WindowClass, displayName, paramKeys?}:
 * `param` is the URL parameter name ('bible'), `className` the CSS class
 * ('BibleWindow'), and `WindowClass` a factory or web component class.
 * `loadWindowClass` (an async `() => import(...)`) may replace `WindowClass`
 * to keep the window's code out of the entry bundle.
 */
export const registerWindowType = (config) => {
  const { param, className, WindowClass, loadWindowClass, displayName, paramKeys = {}, init } = config;
  windowTypes.set(param, {
    param,
    className,
    WindowClass,
    loadWindowClass,
    displayName,
    paramKeys,
    init
  });
};

export const getWindowType = (param) => windowTypes.get(param);

export const getWindowTypeByClassName = (className) => {
  for (const [, wt] of windowTypes) {
    if (wt.className === className) {
      return wt;
    }
  }
  return null;
};

export const getAllWindowTypes = () => Array.from(windowTypes.values());

export const registerMenuComponent = (name, ComponentClass) => {
  menuComponents.set(name, ComponentClass);
};

export const getAllMenuComponents = () => Array.from(menuComponents.entries());

export const registerTextProvider = (name, provider) => {
  textProviders.set(name, provider);
};

export const getTextProvider = (name) => textProviders.get(name);

export const registerAudioSource = (source) => {
  audioSources.push(source);
};

export const getAudioSources = () => audioSources;

let appInstance = null;

export const setApp = (app) => {
  appInstance = app;
};

export const getApp = () => appInstance;

const registry = {
  VERSION,
  registerPlugin,
  getAllPlugins,
  registerWindowType,
  getWindowType,
  getWindowTypeByClassName,
  getAllWindowTypes,
  registerMenuComponent,
  getAllMenuComponents,
  registerTextProvider,
  getTextProvider,
  registerAudioSource,
  getAudioSources,
  setApp,
  getApp
};

export default registry;
