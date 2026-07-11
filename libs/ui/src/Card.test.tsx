import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('renders children (happy)', () => {
    render(
      <Card>
        <p>Hello</p>
      </Card>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('exposes role=region with aria-label (happy)', () => {
    render(<Card aria-label="info">x</Card>);
    expect(screen.getByRole('region', { name: 'info' })).toBeInTheDocument();
  });

  it('uses rounded-none (squared UI rule)', () => {
    const { container } = render(<Card>x</Card>);
    expect(container.firstChild as HTMLElement).not.toHaveClass(/rounded-(sm|md|lg|xl)/);
  });

  it('renders without children (invalid path tolerated)', () => {
    expect(() => render(<Card>{null}</Card>)).not.toThrow();
  });

  it('forwards className (happy)', () => {
    const { container } = render(<Card className="extra-class">x</Card>);
    expect((container.firstChild as HTMLElement).className).toContain('extra-class');
  });
});
