import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Table } from './Table';

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = [
  { id: '1', name: 'Alice' },
  { id: '2', name: 'Bob' },
];

describe('Table', () => {
  it('renders header + body rows (happy)', () => {
    render(
      <Table
        caption="Users"
        columns={[
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
        ]}
        rows={ROWS}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows the empty state when rows=[] (invalid → empty)', () => {
    render(
      <Table
        caption="Empty"
        columns={[{ key: 'id', header: 'ID' }]}
        rows={[]}
        rowKey={(r: Row) => r.id}
        emptyLabel="No data"
      />,
    );
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('handles missing accessor as garbage (garbage)', () => {
    expect(() =>
      render(<Table caption="x" columns={[]} rows={[]} rowKey={() => 'k'} />),
    ).not.toThrow();
  });

  it('uses rounded-none on the table (invariant)', () => {
    render(
      <Table
        caption="x"
        columns={[{ key: 'id', header: 'ID' }]}
        rows={ROWS}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getByRole('table').className).not.toMatch(/rounded-(sm|md|lg)/);
  });
});
