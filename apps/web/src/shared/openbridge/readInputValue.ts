/**
 * `ObcTextInputField`/`ObcNumberInputField` (unlike `ObcTextareaField`)
 * don't dispatch a synthetic `CustomEvent` with a `detail.value` payload —
 * they just let the shadow-DOM `<input>`'s native, composed `input` event
 * bubble out. By the time it reaches this listener (attached to the host
 * by `@lit/react`), the event has been retargeted to the host custom
 * element, whose own `.value` property the component already updated
 * internally before the event bubbled. Read the value off the event's
 * `currentTarget` (the host) rather than `e.detail`, which is `undefined`
 * for this event.
 */
export function readInputValue(e: Event): string {
  return (e.currentTarget as unknown as { value: string }).value;
}
