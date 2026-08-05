import { Reference } from '../bible/BibleReference.js';
import { TextNavigation } from '../common/TextNavigation.js';
import { getApp } from '../core/registry.js';
import { getWindowIcon } from '../core/windowIcons.js';
import { elem } from '../lib/helpers.esm.js';
import { registerPaletteCommands } from './CommandPaletteCommands.js';

/** Global command palette controller (Ctrl/Cmd+K). */
export class CommandPalette {
  constructor() {
    this.commands = [];
    this.selectedIndex = 0;
    this.filteredItems = [];
    this.isOpen = false;
    this.buildUi();
    this.attachEvents();
    registerPaletteCommands(this);
  }

  buildUi() {
    this.input = elem('input', {
      className: 'command-palette-input', type: 'text',
      placeholder: 'Type a command or Bible reference...', autocomplete: 'off'
    });
    this.results = elem('div', { className: 'command-palette-results' });
    this.backdrop = elem('div', { className: 'command-palette-backdrop' },
      elem('div', { className: 'command-palette' },
        elem('div', { className: 'command-palette-header' }, this.input,
          elem('kbd', { className: 'command-palette-shortcut', textContent: 'Esc' })),
        this.results));
    document.body.appendChild(this.backdrop);
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.input.value = '';
    this.selectedIndex = 0;
    this.backdrop.classList.add('open');
    this.renderHelp();
    requestAnimationFrame(() => this.input.focus());
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.backdrop.classList.remove('open');
    this.input.value = '';
    this.filteredItems = [];
  }

  renderHelp() {
    this.results.replaceChildren(elem('div', {
      className: 'command-palette-help',
      innerHTML: 'Type a Bible reference to navigate (e.g. <kbd>John 3</kbd>)<br>'
        + 'Type <kbd>&gt;</kbd> to search commands (e.g. <kbd>&gt; theme</kbd>)'
    }));
  }

  renderItems(items) {
    if (items.length === 0) {
      this.results.replaceChildren(elem('div', {
        className: 'command-palette-help', textContent: 'No results found'
      }));
      return;
    }
    this.results.replaceChildren(...items.map((item, index) => elem('div', {
      className: `command-palette-item${index === this.selectedIndex ? ' selected' : ''}`,
      dataset: { index }
    },
    item.icon ? elem('span', { className: 'command-palette-item-icon', innerHTML: item.icon }) : null,
    elem('span', { className: 'command-palette-item-label', textContent: item.name }),
    item.state ? elem('span', { className: 'command-palette-item-state', textContent: item.state() }) : null,
    item.category ? elem('span', { className: 'command-palette-item-category', textContent: item.category }) : null)));
  }

  updateSelection(index) {
    if (this.filteredItems.length === 0) return;
    if (index < 0) index = this.filteredItems.length - 1;
    if (index >= this.filteredItems.length) index = 0;
    this.selectedIndex = index;
    const rows = this.results.querySelectorAll('.command-palette-item');
    rows.forEach((row, rowIndex) => row.classList.toggle('selected', rowIndex === index));
    rows[index]?.scrollIntoView({ block: 'nearest' });
  }

  registerCommand(command) {
    this.commands.push(command);
  }

  filterCommands(query) {
    const lowerQuery = query.toLowerCase();
    return this.commands.filter((command) => command.name.toLowerCase().includes(lowerQuery)
      || command.keywords?.some((keyword) => keyword.includes(lowerQuery)));
  }

  getNavigationItems(query) {
    const reference = new Reference(query);
    if (!reference.isValid?.()) return [];
    return [{
      name: `Go to ${reference.toString()}`,
      category: 'navigate',
      icon: getWindowIcon('BibleWindow'),
      execute: () => {
        const app = getApp();
        const sectionid = reference.toSection();
        const windows = app?.windowManager?.getWindows()
          ?.filter((windowComponent) => windowComponent.className === 'BibleWindow') || [];
        if (windows.length) {
          TextNavigation.locationChange(sectionid);
          for (const windowComponent of windows) windowComponent.controller?.scroller?.load('text', sectionid);
        }
        this.close();
      }
    }];
  }

  handleInput() {
    const value = this.input.value;
    if (!value) {
      this.filteredItems = [];
      this.selectedIndex = 0;
      this.renderHelp();
      return;
    }
    if (value.startsWith('>')) {
      const query = value.slice(1).trim();
      this.filteredItems = query ? this.filterCommands(query) : [...this.commands];
    } else {
      this.filteredItems = this.getNavigationItems(value);
    }
    this.selectedIndex = 0;
    this.renderItems(this.filteredItems);
  }

  executeSelected() {
    this.filteredItems[this.selectedIndex]?.execute();
  }

  handleInputKeydown(event) {
    const actions = {
      Escape: () => this.close(),
      ArrowDown: () => this.updateSelection(this.selectedIndex + 1),
      ArrowUp: () => this.updateSelection(this.selectedIndex - 1),
      Enter: () => this.executeSelected()
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  attachEvents() {
    this.input.addEventListener('input', () => this.handleInput());
    this.input.addEventListener('keydown', (event) => this.handleInputKeydown(event));
    this.backdrop.addEventListener('mousedown', (event) => {
      if (event.target === this.backdrop) this.close();
    });
    this.results.addEventListener('click', (event) => this.handleResultEvent(event, true));
    this.results.addEventListener('mousemove', (event) => this.handleResultEvent(event, false));
    document.addEventListener('keydown', (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      if (this.isOpen) this.close();
      else this.open();
    });
  }

  handleResultEvent(event, execute) {
    const row = event.target.closest('.command-palette-item');
    if (!row) return;
    const index = parseInt(row.dataset.index, 10);
    if (execute) {
      this.selectedIndex = index;
      this.executeSelected();
    } else {
      this.updateSelection(index);
    }
  }
}
