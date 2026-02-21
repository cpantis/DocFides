'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2, GripVertical, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface TableRow {
  cells: string[];
}

export interface TableEditorData {
  headers: string[];
  rows: TableRow[];
}

interface TableEditorProps {
  data: TableEditorData;
  onChange: (data: TableEditorData) => void;
  readOnly?: boolean;
  className?: string;
}

/**
 * Inline table editor for extracted table data.
 * Supports cell editing, row add/remove, and header editing.
 */
export function TableEditor({ data, onChange, readOnly = false, className }: TableEditorProps) {
  const t = useTranslations('project.editor');
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = useCallback((row: number, col: number, value: string) => {
    if (readOnly) return;
    setEditingCell({ row, col });
    setEditValue(value);
  }, [readOnly]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;

    const { row, col } = editingCell;

    if (row === -1) {
      // Editing header
      const newHeaders = [...data.headers];
      newHeaders[col] = editValue;
      onChange({ ...data, headers: newHeaders });
    } else {
      // Editing data cell
      const newRows = data.rows.map((r, i) => {
        if (i !== row) return r;
        const newCells = [...r.cells];
        newCells[col] = editValue;
        return { cells: newCells };
      });
      onChange({ ...data, rows: newRows });
    }

    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, data, onChange]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commitEdit();
      // Move to next cell
      if (editingCell) {
        const nextCol = editingCell.col + 1;
        if (nextCol < data.headers.length) {
          const nextValue = editingCell.row === -1
            ? data.headers[nextCol] ?? ''
            : data.rows[editingCell.row]?.cells[nextCol] ?? '';
          startEdit(editingCell.row, nextCol, nextValue);
        } else if (editingCell.row < data.rows.length - 1) {
          const nextRow = editingCell.row + 1;
          const nextValue = data.rows[nextRow]?.cells[0] ?? '';
          startEdit(nextRow, 0, nextValue);
        }
      }
    }
  }, [commitEdit, cancelEdit, editingCell, data, startEdit]);

  const addRow = useCallback(() => {
    const emptyRow: TableRow = { cells: data.headers.map(() => '') };
    onChange({ ...data, rows: [...data.rows, emptyRow] });
  }, [data, onChange]);

  const removeRow = useCallback((index: number) => {
    onChange({ ...data, rows: data.rows.filter((_, i) => i !== index) });
  }, [data, onChange]);

  const addColumn = useCallback(() => {
    onChange({
      headers: [...data.headers, `Col ${data.headers.length + 1}`],
      rows: data.rows.map((r) => ({ cells: [...r.cells, ''] })),
    });
  }, [data, onChange]);

  const removeColumn = useCallback((colIndex: number) => {
    if (data.headers.length <= 1) return;
    onChange({
      headers: data.headers.filter((_, i) => i !== colIndex),
      rows: data.rows.map((r) => ({
        cells: r.cells.filter((_, i) => i !== colIndex),
      })),
    });
  }, [data, onChange]);

  return (
    <div className={cn('overflow-x-auto rounded-lg border border-gray-200', className)}>
      <table className="w-full text-sm">
        {/* Headers */}
        <thead>
          <tr className="bg-gray-50">
            {!readOnly && (
              <th className="w-8 border-b border-r border-gray-200 px-1" />
            )}
            {data.headers.map((header, colIdx) => (
              <th
                key={colIdx}
                className={cn(
                  'border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700',
                  !readOnly && 'cursor-pointer hover:bg-gray-100'
                )}
                onClick={() => startEdit(-1, colIdx, header)}
              >
                {editingCell?.row === -1 && editingCell?.col === colIdx ? (
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={commitEdit}
                    className="w-full rounded border border-primary-300 px-1 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary-500"
                    autoFocus
                  />
                ) : (
                  <div className="flex items-center justify-between gap-1">
                    <span>{header || '—'}</span>
                    {!readOnly && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeColumn(colIdx); }}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                        title={t('tableRemoveColumn')}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </th>
            ))}
            {!readOnly && (
              <th className="w-8 border-b border-gray-200 px-1">
                <button
                  onClick={addColumn}
                  className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                  title={t('tableAddColumn')}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </th>
            )}
          </tr>
        </thead>

        {/* Data rows */}
        <tbody>
          {data.rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="group hover:bg-gray-50/50">
              {!readOnly && (
                <td className="border-b border-r border-gray-100 px-1 text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    <GripVertical className="h-3 w-3 text-gray-300" />
                    <button
                      onClick={() => removeRow(rowIdx)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                      title={t('tableRemoveRow')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              )}
              {row.cells.map((cell, colIdx) => (
                <td
                  key={colIdx}
                  className={cn(
                    'border-b border-r border-gray-100 px-3 py-1.5 text-gray-600',
                    !readOnly && 'cursor-pointer hover:bg-primary-50/30'
                  )}
                  onClick={() => startEdit(rowIdx, colIdx, cell)}
                >
                  {editingCell?.row === rowIdx && editingCell?.col === colIdx ? (
                    <div className="flex items-center gap-1">
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={commitEdit}
                        className="w-full rounded border border-primary-300 px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                        autoFocus
                      />
                      <button onClick={commitEdit} className="text-green-600">
                        <Check className="h-3 w-3" />
                      </button>
                      <button onClick={cancelEdit} className="text-gray-400">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs">{cell || '—'}</span>
                  )}
                </td>
              ))}
              {!readOnly && <td className="border-b border-gray-100" />}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Add row button */}
      {!readOnly && (
        <button
          onClick={addRow}
          className="flex w-full items-center justify-center gap-1.5 border-t border-gray-100 py-2 text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600"
        >
          <Plus className="h-3 w-3" />
          {t('tableAddRow')}
        </button>
      )}
    </div>
  );
}

/**
 * Parse a text-based table string into TableEditorData.
 * Supports pipe-separated and tab-separated formats.
 */
export function parseTableString(text: string): TableEditorData | null {
  const lines = text.trim().split('\n').filter((l) => l.trim() && !/^[-=+]+$/.test(l.trim()));
  if (lines.length < 2) return null;

  const splitLine = (line: string): string[] => {
    if (line.includes('|')) {
      return line.split('|').map((c) => c.trim()).filter(Boolean);
    }
    if (line.includes('\t')) {
      return line.split('\t').map((c) => c.trim());
    }
    return [line.trim()];
  };

  const allRows = lines.map(splitLine);
  const firstRow = allRows[0];
  if (!firstRow || firstRow.length < 2) return null;

  const colCount = firstRow.length;

  return {
    headers: firstRow,
    rows: allRows.slice(1).map((cells) => ({
      cells: cells.length >= colCount
        ? cells.slice(0, colCount)
        : [...cells, ...Array(colCount - cells.length).fill('')],
    })),
  };
}

/**
 * Serialize TableEditorData back to a text representation.
 */
export function serializeTable(data: TableEditorData): string {
  const lines: string[] = [];
  lines.push(data.headers.join(' | '));
  lines.push(data.headers.map(() => '---').join(' | '));
  for (const row of data.rows) {
    lines.push(row.cells.join(' | '));
  }
  return lines.join('\n');
}
