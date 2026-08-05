import AppSettings from '../common/AppSettings.js';

const SETTINGS_KEY = 'guided-tour';
const DEMO_LEAD_MS = 520;

export function tourState(controller, done = false) {
  const step = controller.steps[controller.index];
  const target = step ? controller.positioner.resolveTarget(step) : null;
  const box = target?.getBoundingClientRect() ?? null;
  return {
    active: controller.active,
    done,
    index: controller.index,
    total: controller.steps.length,
    id: step?.id ?? null,
    title: step ? controller.refs.title.textContent : null,
    body: step ? controller.refs.body.textContent : null,
    centered: step ? (!target || step.placement === 'center') : false,
    spotlight: box ? {
      left: Math.round(box.left), top: Math.round(box.top),
      width: Math.round(box.width), height: Math.round(box.height)
    } : null
  };
}

export async function leaveStep(controller, step) {
  if (!step) return;
  try {
    await step.exit?.(controller.context.value);
  } catch (error) {
    console.warn(`[tour] exit "${step.id}" failed:`, error);
  }
  controller.context.closeStepWindows(step);
}

export async function playStep(controller, step, token) {
  if (!step?.demo) return;
  await controller.helpers.sleep(controller.helpers.prefersReducedMotion() ? 0 : DEMO_LEAD_MS);
  if (token !== controller.transition) return;
  let following = true;
  const follow = () => {
    if (!following) return;
    controller.positioner.position();
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
  controller.entering = step;
  try {
    await step.demo(controller.context.value);
  } catch (error) {
    console.warn(`[tour] demo "${step.id}" failed:`, error);
  } finally {
    controller.entering = null;
    following = false;
  }
  if (token !== controller.transition) return;
  controller.positioner.raise();
  controller.positioner.position();
}

export async function enterStep(controller, step, token) {
  if (token !== controller.transition) return 'stale';
  controller.entering = step;
  try {
    await step.enter?.(controller.context.value);
  } catch (error) {
    console.warn(`[tour] enter "${step.id}" failed:`, error);
  } finally {
    controller.entering = null;
  }
  if (token !== controller.transition) return 'stale';
  if (step.target && !controller.positioner.resolveTarget(step)) {
    await controller.leave(step);
    return 'skip';
  }
  return 'ok';
}

export async function showStep(controller, step, token) {
  controller.positioner.raise();
  controller.refs.card.classList.remove('tour-busy');
  controller.render();
  await controller.helpers.sleep(controller.helpers.prefersReducedMotion() ? 0 : 40);
  if (token !== controller.transition) return;
  controller.positioner.position();
  await controller.play(step, token);
}

export async function goToStep(controller, target, direction = 1) {
  if (!controller.active || target < 0) return controller.getState();
  const token = ++controller.transition;
  let previous = controller.steps[controller.index];
  let candidate = target;
  while (candidate >= 0 && candidate < controller.steps.length) {
    const step = controller.steps[candidate];
    controller.refs.card.classList.add('tour-busy');
    if (previous && previous !== step) {
      await controller.leave(previous);
      previous = null;
    }
    const entered = await controller.enterStep(step, token);
    if (entered === 'stale') return controller.getState();
    if (entered === 'skip') {
      candidate += direction;
      continue;
    }
    controller.index = candidate;
    await controller.showStep(step, token);
    return controller.getState();
  }
  controller.refs.card.classList.remove('tour-busy');
  await controller.stop();
  return controller.getState(true);
}

export function startTour(controller, options = {}) {
  const { from = 0, reset = true } = options;
  controller.steps = controller.allSteps.filter((step) => step.available?.() !== false);
  if (!controller.steps.length) return Promise.resolve(controller.getState());
  if (reset) controller.context.reset();
  controller.active = true;
  controller.index = -1;
  controller.positioner.reset();
  document.body.classList.add('tour-active');
  controller.positioner.show();
  AppSettings.setValue(SETTINGS_KEY, { seen: true });
  return controller.goTo(Math.min(from, controller.steps.length - 1), 1);
}

export async function stopTour(controller) {
  if (!controller.active) return controller.getState();
  controller.transition++;
  const step = controller.steps[controller.index];
  controller.active = false;
  controller.index = -1;
  controller.helpers.setTourField(null);
  await controller.leave(step);
  controller.positioner.hide();
  document.body.classList.remove('tour-active');
  AppSettings.setValue(SETTINGS_KEY, { seen: true });
  return controller.getState(true);
}
