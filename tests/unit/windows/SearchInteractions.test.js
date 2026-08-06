import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  app: null,
  offset: vi.fn(() => ({ top: 200 }))
}));

vi.mock('@core/registry.js', () => ({ getApp: () => fixtures.app }));
vi.mock('@lib/helpers.esm.js', () => ({ offset: fixtures.offset }));

import {
  handleResultClick,
  handleVisualBarClick,
  handleVisualBarMouseover
} from '@windows/SearchInteractions.js';

function component() {
  return {
    config: { newBibleWindowVersion: 'ENGWEB' },
    state: { textInfo: { lang: 'eng' } },
    refs: {
      topVisual: { offsetWidth: 300 },
      topVisualLabel: document.createElement('div'),
      resultsBlock: document.createElement('div'),
      main: { scrollTop: 0 }
    },
    trigger: vi.fn()
  };
}

function row(fragmentid = 'JN3_16') {
  const el = document.createElement('div');
  el.dataset.fragmentid = fragmentid;
  return el;
}

function bar({ id = 'GN', count = '12', left = 20 } = {}) {
  const el = document.createElement('div');
  if (id != null) el.dataset.id = id;
  if (count != null) el.dataset.count = count;
  Object.defineProperty(el, 'offsetLeft', { value: left });
  return el;
}

describe('SearchInteractions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.app = null;
    fixtures.offset.mockReturnValue({ top: 200 });
  });

  it('opens a configured Bible window when no Bible window exists', () => {
    const add = vi.fn();
    fixtures.app = { windowManager: { getWindows: () => [], add } };
    const view = component();
    handleResultClick(view, row());
    expect(add).toHaveBeenCalledWith('BibleWindow', {
      textid: 'ENGWEB', fragmentid: 'JN3_16', sectionid: 'JN3'
    });
    expect(view.trigger).not.toHaveBeenCalled();
  });

  it('broadcasts navigation when a Bible window already exists', () => {
    fixtures.app = { windowManager: { getWindows: () => [
      { className: 'NotesWindow' }, { className: 'BibleWindow' }
    ] } };
    const view = component();
    const target = row('GN1_2');
    handleResultClick(view, target);
    expect(view.trigger).toHaveBeenCalledWith('globalmessage', {
      type: 'globalmessage', target: view,
      data: {
        messagetype: 'nav', type: 'bible',
        locationInfo: { fragmentid: 'GN1_2', sectionid: 'GN1', offset: 0 }
      }
    });
  });

  it('tolerates a missing app while attempting to open a Bible window', () => {
    const view = component();
    expect(() => handleResultClick(view, row())).not.toThrow();
    expect(view.trigger).not.toHaveBeenCalled();
  });

  it('ignores absent and incomplete visual bars', () => {
    const view = component();
    handleVisualBarMouseover(view, null);
    handleVisualBarMouseover(view, bar({ count: null }));
    handleVisualBarMouseover(view, bar({ id: null }));
    handleVisualBarMouseover(view, bar({ id: 'NO_SUCH_BOOK' }));
    expect(view.refs.topVisualLabel.style.display).toBe('');
  });

  it('labels a known book in the current language', () => {
    const view = component();
    handleVisualBarMouseover(view, bar({ id: 'GN', count: '12', left: 20 }));
    expect(view.refs.topVisualLabel.textContent).toContain('12');
    expect(view.refs.topVisualLabel.style.left).toBe('20px');
    expect(view.refs.topVisualLabel.style.display).toBe('block');
  });

  it('falls back to English or the book code and constrains both edges', () => {
    const view = component();
    view.state.textInfo.lang = 'missing';
    Object.defineProperty(view.refs.topVisualLabel, 'offsetWidth', { value: 80 });
    handleVisualBarMouseover(view, bar({ id: 'GN', left: 280 }));
    expect(view.refs.topVisualLabel.style.left).toBe('215px');

    view.refs.topVisual.offsetWidth = 40;
    handleVisualBarMouseover(view, bar({ id: 'GN', left: -10 }));
    expect(view.refs.topVisualLabel.style.left).toBe('5px');
  });

  it('scrolls to a matching book header and ignores missing inputs', () => {
    const view = component();
    const header = document.createElement('div');
    header.className = 'search-result-book-header divisionid-GN';
    Object.defineProperty(header, 'offsetHeight', { value: 30 });
    view.refs.resultsBlock.appendChild(header);
    handleVisualBarClick(view, bar({ id: 'GN' }));
    expect(view.refs.main.scrollTop).toBe(120);
    expect(fixtures.offset).toHaveBeenCalledWith(header);

    view.refs.main.scrollTop = 0;
    handleVisualBarClick(view, null);
    handleVisualBarClick(view, bar({ id: 'EX' }));
    expect(view.refs.main.scrollTop).toBe(0);
  });
});
