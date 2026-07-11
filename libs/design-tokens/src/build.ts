import { colors, type ThemeName } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FLATTEN_DELIMITER = '-';

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}${FLATTEN_DELIMITER}${k}` : k;
    if (typeof v === 'object' && v !== null) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

function themeBlock(selector: string, theme: ThemeName): string {
  const flat = flatten(colors[theme] as unknown as Record<string, unknown>, 'color');
  const lines = Object.entries(flat).map(([k, v]) => `  --${k}: ${v};`);
  return `${selector} {\n${lines.join('\n')}\n}\n`;
}

function staticBlock(): string {
  const fontSize = flatten(typography.fontSize as unknown as Record<string, unknown>, 'fs');
  const fontWeight = flatten(typography.fontWeight as unknown as Record<string, unknown>, 'fw');
  const lineHeight = flatten(typography.lineHeight as unknown as Record<string, unknown>, 'lh');
  const space = flatten(spacing as unknown as Record<string, unknown>, 'space');
  const ff = `  --ff-sans: ${typography.fontFamily.sans};\n  --ff-mono: ${typography.fontFamily.mono};`;
  const fsLines = Object.entries(fontSize)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n');
  const fwLines = Object.entries(fontWeight)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n');
  const lhLines = Object.entries(lineHeight)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n');
  const spLines = Object.entries(space)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n');
  return `:root {\n${ff}\n${fsLines}\n${fwLines}\n${lhLines}\n${spLines}\n}\n`;
}

export function generateTokensCss(): string {
  const blocks: string[] = [];
  blocks.push(staticBlock());
  blocks.push(themeBlock(':root', 'day'));
  blocks.push(themeBlock('[data-theme="day"]', 'day'));
  blocks.push(themeBlock('[data-theme="dusk"]', 'dusk'));
  blocks.push(themeBlock('[data-theme="night"]', 'night'));
  blocks.push(themeBlock('[data-theme="bright"]', 'bright'));
  return blocks.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const css = generateTokensCss();
  const out = resolve(import.meta.dirname, 'tokens.css');
  writeFileSync(out, css, 'utf8');
  console.log(`wrote ${out} (${css.length} bytes)`);
}
