import { describe, it, expect } from 'vitest';
import { generateTokensCss } from './build';
import { eurostripPreset } from './tailwind-preset';

describe('generateTokensCss', () => {
  it('emits four [data-theme] blocks (happy)', () => {
    const css = generateTokensCss();
    expect(css).toContain('[data-theme="day"]');
    expect(css).toContain('[data-theme="dusk"]');
    expect(css).toContain('[data-theme="night"]');
    expect(css).toContain('[data-theme="bright"]');
  });

  it('emits semantic CSS variables under each theme block (happy)', () => {
    const css = generateTokensCss();
    expect(css).toMatch(/\[data-theme="day"\]\s*\{[^}]*--color-bg-primary:\s*#f0f0f0/);
    expect(css).toMatch(/\[data-theme="night"\]\s*\{[^}]*--color-fg-primary:\s*#aa0000/);
  });

  it('uses :root for the day default (happy)', () => {
    const css = generateTokensCss();
    expect(css).toMatch(/^:root\s*\{/m);
  });

  it('rejects no themes (invalid path is a compile-time impossibility, but verify shape)', () => {
    const css = generateTokensCss();
    const matches = css.match(/\[data-theme="(day|dusk|night|bright)"\]/g) ?? [];
    expect(matches.length).toBe(4);
  });
});

describe('eurostripPreset', () => {
  it('exposes only `none` and `full` border radii (happy — squared UI rule)', () => {
    const radii = (eurostripPreset.theme?.borderRadius ?? {}) as Record<string, string>;
    expect(Object.keys(radii).sort()).toEqual(['full', 'none']);
    expect(radii.none).toBe('0');
    expect(radii.full).toBe('9999px');
  });

  it('rejects any other radius keys (invalid path — regression check)', () => {
    const radii = (eurostripPreset.theme?.borderRadius ?? {}) as Record<string, string>;
    expect(radii).not.toHaveProperty('sm');
    expect(radii).not.toHaveProperty('md');
    expect(radii).not.toHaveProperty('lg');
  });
});
