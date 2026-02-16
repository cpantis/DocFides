'use client';

import { useState } from 'react';
import { FileText, Table, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ConfidenceBadge } from './ConfidenceBadge';

interface ExtractionBlock {
  id: string;
  type: string;
  content: string | Record<string, unknown>;
  source: string;
  confidence: number;
  page: number;
  warnings: string[];
}

interface ExtractionPreviewProps {
  blocks: ExtractionBlock[];
  overallConfidence: number;
}

export function ExtractionPreview({ blocks, overallConfidence }: ExtractionPreviewProps) {
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());

  const toggleBlock = (id: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const textBlocks = blocks.filter((b) => b.type === 'text');
  const tableBlocks = blocks.filter((b) => b.type === 'table');

  return (
    <div className="space-y-4">
      {/* Overall confidence */}
      <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
        <span className="text-sm font-medium text-gray-700">Overall Confidence</span>
        <ConfidenceBadge score={overallConfidence} size="md" />
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm text-gray-500">
        <span className="flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" />
          {textBlocks.length} text blocks
        </span>
        <span className="flex items-center gap-1">
          <Table className="h-3.5 w-3.5" />
          {tableBlocks.length} tables
        </span>
      </div>

      {/* Block list */}
      <div className="space-y-2">
        {blocks.map((block) => {
          const isExpanded = expandedBlocks.has(block.id);
          const isTable = block.type === 'table';

          return (
            <div key={block.id} className="rounded-lg border border-gray-200">
              <button
                onClick={() => toggleBlock(block.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}

                {isTable ? (
                  <Table className="h-4 w-4 text-primary-500" />
                ) : (
                  <FileText className="h-4 w-4 text-gray-400" />
                )}

                <span className="flex-1 text-sm font-medium text-gray-700">
                  {isTable ? 'Table' : 'Text'} — Page {block.page}
                </span>

                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                  {block.source}
                </span>

                <ConfidenceBadge score={block.confidence} showLabel={false} />
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3">
                  {block.warnings.length > 0 && (
                    <div className="mb-3 space-y-1">
                      {block.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-amber-600">
                          {w}
                        </p>
                      ))}
                    </div>
                  )}

                  {isTable && typeof block.content === 'object' ? (
                    <TablePreview data={block.content as Record<string, unknown>} />
                  ) : (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                      {typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TablePreview({ data }: { data: Record<string, unknown> }) {
  const headers = (data['headers'] as string[]) ?? [];
  const rows = (data['rows'] as string[][]) ?? [];

  if (headers.length === 0) {
    return <p className="text-xs text-gray-400">Empty table</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50">
            {headers.map((h, i) => (
              <th key={i} className="border border-gray-200 px-2 py-1.5 text-left font-medium text-gray-700">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((row, i) => (
            <tr key={i} className={cn(i % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>
              {row.map((cell, j) => (
                <td key={j} className="border border-gray-200 px-2 py-1 text-gray-600">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length > 10 && (
            <tr>
              <td colSpan={headers.length} className="px-2 py-1 text-center text-gray-400">
                ...and {rows.length - 10} more rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
