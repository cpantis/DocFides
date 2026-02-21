'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, AlertCircle } from 'lucide-react';
import { useTags, type Tag } from '@/lib/hooks/use-tags';
import { cn } from '@/lib/utils/cn';

const PRESET_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#64748b', // slate
];

export function TagManager() {
  const t = useTranslations('dashboard.tags');
  const tc = useTranslations('common');
  const { tags, isError, mutate } = useTags();
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]!);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newTagName.trim()) return;
    setActionError(null);
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      if (!res.ok) throw new Error();
      setNewTagName('');
      setNewTagColor(PRESET_COLORS[0]!);
      setIsAdding(false);
      mutate();
    } catch {
      setActionError(tc('error'));
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      if (!res.ok) throw new Error();
      setEditingId(null);
      mutate();
    } catch {
      setActionError(tc('error'));
    }
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      mutate();
    } catch {
      setActionError(tc('error'));
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingId(tag._id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{tc('error')}</span>
        <button
          onClick={() => mutate()}
          className="ml-auto text-xs font-medium underline hover:no-underline"
        >
          {tc('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-auto text-gray-400 hover:text-gray-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Tag list */}
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) =>
          editingId === tag._id ? (
            <div
              key={tag._id}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm"
            >
              <ColorPicker
                value={editColor}
                onChange={setEditColor}
                colors={PRESET_COLORS}
              />
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-32 border-b border-gray-300 bg-transparent px-1 text-sm focus:border-primary-500 focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleUpdate(tag._id)}
                autoFocus
              />
              <button
                onClick={() => handleUpdate(tag._id)}
                className="text-green-600 hover:text-green-700"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              key={tag._id}
              className="group flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm transition-colors hover:border-gray-300"
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="text-sm font-medium text-gray-700">
                {tag.name}
              </span>
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => startEdit(tag)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleDelete(tag._id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        )}

        {/* Add new tag */}
        {isAdding ? (
          <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2">
            <ColorPicker
              value={newTagColor}
              onChange={setNewTagColor}
              colors={PRESET_COLORS}
            />
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder={t('namePlaceholder')}
              className="w-32 border-b border-primary-300 bg-transparent px-1 text-sm placeholder-primary-400 focus:border-primary-500 focus:outline-none"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={!newTagName.trim()}
              className="text-primary-600 hover:text-primary-700 disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setIsAdding(false); setNewTagName(''); }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 rounded-full border-2 border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 transition-colors hover:border-primary-400 hover:text-primary-600"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('addTag')}
          </button>
        )}
      </div>

      {tags.length === 0 && !isAdding && (
        <p className="text-sm text-gray-400">{t('noTags')}</p>
      )}
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (color: string) => void;
  colors: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="h-5 w-5 rounded-full border border-gray-300 shadow-sm"
        style={{ backgroundColor: value }}
      />
      {open && (
        <div className="absolute left-0 top-7 z-10 flex gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setOpen(false); }}
              className={cn(
                'h-5 w-5 rounded-full transition-transform hover:scale-110',
                c === value && 'ring-2 ring-primary-500 ring-offset-1'
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
