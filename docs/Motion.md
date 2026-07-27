# Motion

One vocabulary for everything that moves. Tokens live in
[`browserbible/css/variables.css`](../browserbible/css/variables.css), the shared
rules in [`browserbible/css/motion.css`](../browserbible/css/motion.css), which
loads before the component stylesheets so a component can override it.

## Tokens

| Token | Value | Use |
|-------|-------|-----|
| `--duration-fast` | 0.15s | state feedback the pointer causes: hover, press, toggle |
| `--duration-normal` | 0.22s | something arriving, leaving, or moving to a new place |
| `--duration-slow` | 0.32s | travel across a large distance |
| `--ease-out` | `cubic-bezier(0.22, 0.61, 0.36, 1)` | anything entering or exiting; decelerates into place |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | a small overshoot for something settling somewhere final |

Both curves were already in the app, driving window reorder. They are now tokens
so the rest of the UI can use the same two.

## Rules

- Anything entering or leaving fades, and moves a little while it does.
- Movement is small: a few pixels, or two percent of a scale.
- Never animate a property that triggers layout, unless the element has no
  children and no siblings depending on it. The tour's spotlight is the one
  exception, and it is a single empty div.
- Press feedback is a slight shrink, never a colour flash.
- Never fade an element that is carrying a scrim. The guided tour dims the page
  with the spotlight's own `box-shadow`, so fading the spotlight takes the
  overlay off the whole page and reads as a flash of white. Fade what is on the
  overlay, not the overlay itself. `e2e/guided-tour.spec.js` samples the overlay
  every frame of a run and fails if the dim ever drops, counting a frame painted
  with the layer out of the render tree as no dim at all.
- `prefers-reduced-motion` is honoured globally by the guard at the foot of
  `windows.css`, which zeroes every duration with `!important`. Anything that
  needs more than a zero duration to behave (an animation with a delay, say)
  switches itself off in its own reduced-motion block.

## Where it is applied

| Part | Motion |
|------|--------|
| Every popover: main menu, version chooser, passage navigator, version info, settings, search options, media popup | Fade with a 2% scale up, on open and on close, the backdrop fading with it |
| A new panel | Fade with a 1% scale up |
| A new window tab | Fade and scale, on the spring curve, so the pair reads as one movement |
| Search and reference suggestions | Fade and drop in under the box that produced them |
| Command palette | Backdrop fades, panel scales up |
| Icon controls in the window chrome and top bar | Shrink to 92% while pressed |
| Guided tour spotlight | Travels to its next subject on the ease-out curve, with the dim held on throughout |
| Guided tour card | Follows the spotlight on the spring curve, arriving a beat later |
| Guided tour text | Each step's words rise into place, title and body staggered |

### Popovers get this for free

Every menu and dialog in the app is a native popover, so a single rule in
`motion.css` covers all of them, present and future. Two details make it work:

- `transition-behavior: allow-discrete` on `display` and `overlay` keeps the
  element rendered, and in the top layer, long enough to fade back out. Without
  it a popover vanishes on close with no exit.
- `@starting-style` supplies the from-state, because on the frame a popover opens
  it has no previous state to transition from.
- `::backdrop` gets its own fade. A popover's `opacity` does not apply to its
  backdrop, so without one the scrim behind Settings or the version info dialog
  would snap on and off while the panel fades.

A component stylesheet that redeclares `transition` on a control listed in
motion.css wins the whole shorthand and drops the shared motion with it. Append
`scale var(--duration-fast) var(--ease-out)` to keep the press feedback.
`e2e/motion.spec.js` reads the computed `transition-property` of every pressable
control and fails if one of them has lost `scale`.

The movement is `scale`, not `translate`, for two reasons. The version chooser and
the version info dialog already use `translate` to centre themselves, and window
dragging drives `translate` from JavaScript, so scale is the property that can
never collide with either.

## The guided tour as the reference

The [guided tour](Guided-Tour.md) is where this is most visible, and it is worth
reading `guidedtour.css` for two techniques the rest of the UI can reuse.

**Re-triggering an animation.** A CSS animation plays once per element. To replay
it, remove the class, read a layout property to force a frame, then add it back:

```js
card.classList.remove('tour-step-in');
card.offsetWidth;                  // commit the removal
card.classList.add('tour-step-in');
```

**Giving a transition something to start from.** An element that was just
inserted, or that has come back from `display: none`, has no previous computed
value, so its first move jumps. Set the old value with transitions switched off,
force a frame, then set the new one:

```js
card.classList.add('tour-placing');   // transition: none
card.style.left = `${previous.left}px`;
card.offsetWidth;
card.classList.remove('tour-placing');
card.style.left = `${next.left}px`;   // now it travels
```

The tour needs this because it lifts its own layer above app popovers by hiding
and re-showing it, which takes the spotlight and card out of the render tree. It
only does so when a popover has actually opened since the last lift, tracked by a
capture-phase `toggle` listener, so a step that leaves an already-open menu alone
never disturbs the overlay.
