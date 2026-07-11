import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { ObcDropdownButton as ObcDropdownButtonElement } from '@oicl/openbridge-webcomponents/dist/components/dropdown-button/dropdown-button';

/**
 * `ObcDropdownButton` never forwards its host `aria-label` to the native
 * `<select>` it renders inside its shadow DOM (verified against the
 * component's source: `render()` sets no aria attribute on the `<select>`),
 * so the control has no accessible name out of the box. This hook bridges
 * the label in manually so screen readers (and role-based test queries) can
 * find the control.
 *
 * Attach the returned ref to an `ObcDropdownButton` and pass the same
 * `label` as its `aria-label` prop.
 */
export function useDropdownAriaLabel(label: string): RefObject<ObcDropdownButtonElement | null> {
  const ref = useRef<ObcDropdownButtonElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const applyLabel = () => {
      el.shadowRoot?.querySelector('select')?.setAttribute('aria-label', label);
    };
    applyLabel();
    void el.updateComplete?.then(applyLabel);
  });
  return ref;
}
