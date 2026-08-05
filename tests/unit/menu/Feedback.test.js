import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({ windows: [] }));

vi.mock('@ui/MovableWindow.js', () => ({
  MovableWindow: function MovableWindow(width, height, titleText) {
    let visible = false;
    const controller = {
      body: document.createElement('div'),
      title: document.createElement('span'),
      closeButton: document.createElement('button'),
      container: document.createElement('div'),
      show: vi.fn(() => { visible = true; return controller; }),
      hide: vi.fn(() => { visible = false; return controller; }),
      size: vi.fn(() => controller),
      isVisible: vi.fn(() => visible),
      initial: { width, height, titleText }
    };
    controller.container.append(controller.title, controller.closeButton, controller.body);
    document.body.append(controller.container);
    fixtures.windows.push(controller);
    return controller;
  }
}));

import { Feedback } from '@menu/Feedback.js';
import { getConfig, updateConfig } from '@core/config.js';

const original = {
  enableFeedback: getConfig().enableFeedback,
  feedbackUrl: getConfig().feedbackUrl,
  baseContentUrl: getConfig().baseContentUrl
};

function installMenu() {
  document.body.innerHTML = `
    <div id="main-menu-features"></div>
    <div id="main-menu-dropdown"></div>`;
  document.querySelector('#main-menu-dropdown').hidePopover = vi.fn();
}

function fields() {
  return {
    name: document.querySelector('#feedback-from'),
    email: document.querySelector('#feedback-email'),
    subject: document.querySelector('#feedback-subject'),
    comments: document.querySelector('#feedback-comment'),
    send: document.querySelector('#feedback-submit'),
    message: document.querySelector('.feedback-message'),
    overlay: document.querySelector('.modal-overlay')
  };
}

beforeEach(() => {
  fixtures.windows.length = 0;
  installMenu();
  updateConfig({
    enableFeedback: true,
    feedbackUrl: 'feedback/send',
    baseContentUrl: 'https://content.test/'
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  updateConfig(original);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Feedback', () => {
  it('does not install when the feature or endpoint is disabled', () => {
    updateConfig({ enableFeedback: false });
    expect(Feedback()).toBeUndefined();
    updateConfig({ enableFeedback: true, feedbackUrl: '' });
    expect(Feedback()).toBeUndefined();
    expect(document.querySelector('#main-menu-features').children).toHaveLength(0);
  });

  it('builds and toggles the feedback modal', () => {
    const button = Feedback();
    const win = fixtures.windows[0];
    const { message, overlay } = fields();
    expect(button.parentElement.id).toBe('main-menu-features');
    expect(win.initial).toEqual({ width: 500, height: 300, titleText: 'menu.labels.feedback' });

    button.click();
    expect(win.show).toHaveBeenCalled();
    expect(win.size).toHaveBeenCalledWith(500, 300);
    expect(overlay.style.display).toBe('');
    expect(message.style.display).toBe('none');
    expect(document.querySelector('#main-menu-dropdown').hidePopover).toHaveBeenCalled();

    button.click();
    expect(win.hide).toHaveBeenCalled();
    expect(overlay.style.display).toBe('none');

    button.click();
    overlay.click();
    win.closeButton.click();
    expect(win.hide).toHaveBeenCalledTimes(3);
  });

  it('marks every empty or invalid field without submitting', () => {
    Feedback();
    const { name, email, comments, send } = fields();
    send.click();
    expect(name.classList.contains('invalid')).toBe(true);
    expect(email.classList.contains('invalid')).toBe(true);
    expect(comments.classList.contains('invalid')).toBe(true);
    expect(fetch).not.toHaveBeenCalled();

    name.value = 'Ada';
    email.value = 'not-an-email';
    comments.value = 'Hello';
    send.click();
    expect(name.classList.contains('invalid')).toBe(false);
    expect(email.classList.contains('invalid')).toBe(true);
    expect(comments.classList.contains('invalid')).toBe(false);
  });

  it('submits valid feedback, shows thanks, and closes after a delay', async () => {
    vi.useFakeTimers();
    const button = Feedback();
    const win = fixtures.windows[0];
    button.click();
    const { name, email, subject, comments, send, message, overlay } = fields();
    name.value = 'Ada Lovelace';
    email.value = 'ada@example.test';
    subject.value = subject.options[1].value;
    comments.value = 'A useful report';
    send.click();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());

    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain('https://content.test/feedback/send?');
    expect(url).toContain('name=Ada+Lovelace');
    expect(url).toContain('email=ada%40example.test');
    expect(options).toEqual({ method: 'GET', mode: 'cors' });
    expect(message.style.display).toBe('');
    expect(name.style.display).toBe('none');

    await vi.advanceTimersByTimeAsync(500);
    expect(win.hide).toHaveBeenCalled();
    expect(overlay.style.display).toBe('none');
  });

  it('logs submission failures and leaves the form visible', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetch.mockRejectedValueOnce(new Error('offline'));
    Feedback();
    const { name, email, comments, send, message } = fields();
    name.value = 'Ada';
    email.value = 'ada@example.test';
    comments.value = 'Report';
    send.click();

    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('Feedback error:', expect.any(Error)));
    expect(message.style.display).toBe('none');
    expect(name.style.display).toBe('');
  });
});
