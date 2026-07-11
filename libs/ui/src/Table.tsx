import { type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell?: (row: T) => ReactNode;
}

export interface TableProps<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: string;
  className?: string;
}

const TABLE = 'w-full text-sm border-collapse rounded-none';
const HEAD = 'bg-bg-secondary text-fg-secondary text-left';
const TH = 'px-3 py-2 border-b border-default font-medium';
const TD = 'px-3 py-2 border-b border-subtle text-fg-primary';
const EMPTY = 'p-6 text-center text-fg-tertiary';

export function Table<T>({
  caption,
  columns,
  rows,
  rowKey,
  emptyLabel = 'No rows',
  className = '',
}: TableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className={`bg-bg-primary border border-default ${className}`.trim()}>
        <p className={EMPTY}>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <table className={`${TABLE} ${className}`.trim()}>
      <caption className="sr-only">{caption}</caption>
      <thead className={HEAD}>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={TH} scope="col">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} className="hover:bg-bg-secondary">
            {columns.map((c) => (
              <td key={c.key} className={TD}>
                {c.cell ? c.cell(row) : (row as unknown as Record<string, ReactNode>)[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
