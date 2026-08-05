import { getWindowTypeByClassName } from './registry.js';

function createWebComponent(managedWindow, ElementClass, data) {
  const tagName = ElementClass._tagName;
  const controller = tagName && customElements.get(tagName)
    ? document.createElement(tagName)
    : new ElementClass();
  controller.parentInfo = { node: managedWindow.node, tab: managedWindow.tab };
  controller.windowId = managedWindow.id;
  controller.initData = data || {};
  controller.setAttribute('window-id', managedWindow.id);
  controller.setAttribute('init-data', JSON.stringify(data || {}));
  managedWindow.node.appendChild(controller);
  return controller;
}

function forwardControllerEvents(managedWindow) {
  if (!managedWindow.controller?.on) return;
  managedWindow.controller.on('settingschange', (event) => managedWindow.trigger('settingschange', event));
  managedWindow.controller.on('globalmessage', (event) => {
    event.id = managedWindow.id;
    managedWindow.trigger('globalmessage', event);
  });
}

function attachController(managedWindow, WindowClass, data) {
  if (managedWindow._closed) return;
  managedWindow.controller = WindowClass.prototype instanceof HTMLElement
    ? createWebComponent(managedWindow, WindowClass, data)
    : WindowClass(managedWindow.id, managedWindow, data);
  forwardControllerEvents(managedWindow);
  const queued = managedWindow._pendingMessages;
  managedWindow._pendingMessages = null;
  for (const event of queued) managedWindow.controller?.trigger?.('message', event);
}

export function loadManagedWindowController(managedWindow, className, data) {
  const type = getWindowTypeByClassName(className);
  if (type?.WindowClass) {
    attachController(managedWindow, type.WindowClass, data);
    return Promise.resolve(managedWindow);
  }
  if (type?.loadWindowClass) {
    return type.loadWindowClass().then((WindowClass) => {
      type.WindowClass = WindowClass;
      attachController(managedWindow, WindowClass, data);
      setTimeout(() => managedWindow.manager.app?.resize?.(), 10);
      return managedWindow;
    }).catch((error) => {
      console.error(`Failed to load window "${className}"`, error);
      return managedWindow;
    });
  }
  console.error(`Window type "${className}" not found`);
  return Promise.resolve(managedWindow);
}
