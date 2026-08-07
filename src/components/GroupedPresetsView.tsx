import React, { useState, useMemo } from 'react';
import { Folder, FolderPlus, Edit2, Trash2, ChevronDown, ChevronRight, Layers, Tag, Grid, List, Sparkles } from 'lucide-react';
import { Patch, Multi } from '../types';

interface GroupedPresetsViewProps {
  type: 'PATCHES' | 'MULTIS';
  patches: Patch[];
  multis: Multi[];
  activePatchId: string | null;
  activeMultiId: string | null;
  searchQuery: string;
  onSelectPatch: (patch: Patch) => void;
  onSelectMulti: (multi: Multi) => void;
  onRenamePatch: (id: string, name: string) => void;
  onDeletePatch: (id: string) => void;
  onRenameMulti: (id: string, name: string) => void;
  onDeleteMulti: (id: string) => void;
  onUpdatePatchGroup: (patchId: string, groupName: string | undefined) => void;
  onUpdateMultiGroup: (multiId: string, groupName: string | undefined) => void;
  onAutoCategorizeAll?: () => void;
  showCustomPrompt: (title: string, message: string, defaultValue: string, onConfirm: (val: string) => void) => void;
}

export const GroupedPresetsView: React.FC<GroupedPresetsViewProps> = ({
  type,
  patches,
  multis,
  activePatchId,
  activeMultiId,
  searchQuery,
  onSelectPatch,
  onSelectMulti,
  onRenamePatch,
  onDeletePatch,
  onRenameMulti,
  onDeleteMulti,
  onUpdatePatchGroup,
  onUpdateMultiGroup,
  onAutoCategorizeAll,
  showCustomPrompt,
}) => {
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');
  const [isGroupedView, setIsGroupedView] = useState<boolean>(true);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const items = type === 'PATCHES' ? patches : multis;

  // Extract all distinct groups
  const allGroups = useMemo(() => {
    const groupsSet = new Set<string>();
    items.forEach(item => {
      if (item.group && item.group.trim()) {
        groupsSet.add(item.group.trim());
      }
    });
    return Array.from(groupsSet).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Group items into dictionary
  const groupedItems = useMemo(() => {
    const map: Record<string, (Patch | Multi)[]> = {};
    const searchLower = searchQuery.toLowerCase();

    items.forEach(item => {
      if (searchLower && !item.name.toLowerCase().includes(searchLower)) {
        return;
      }

      const g = item.group && item.group.trim() ? item.group.trim() : 'Uncategorized';

      if (selectedGroupFilter !== 'ALL') {
        if (selectedGroupFilter === 'UNCATEGORIZED' && g !== 'Uncategorized') return;
        if (selectedGroupFilter !== 'UNCATEGORIZED' && g !== selectedGroupFilter) return;
      }

      if (!map[g]) map[g] = [];
      map[g].push(item);
    });

    return map;
  }, [items, searchQuery, selectedGroupFilter]);

  const toggleGroupExpand = (groupName: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: prev[groupName] === undefined ? false : !prev[groupName],
    }));
  };

  const handleCreateGroup = () => {
    showCustomPrompt(
      'CREATE NEW GROUP / FOLDER',
      'ENTER NEW GROUP NAME (e.g. Basses, Pads, Setlist 1):',
      'New Group',
      (groupName) => {
        const trimmed = groupName.trim();
        if (trimmed) {
          setSelectedGroupFilter(trimmed);
        }
      }
    );
  };

  const handleRenameGroup = (oldGroup: string) => {
    showCustomPrompt(
      'RENAME GROUP / FOLDER',
      `RENAME GROUP "${oldGroup.toUpperCase()}" TO:`,
      oldGroup,
      (newName) => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldGroup) return;

        if (type === 'PATCHES') {
          patches.forEach(p => {
            if (p.group === oldGroup) {
              onUpdatePatchGroup(p.id, trimmed);
            }
          });
        } else {
          multis.forEach(m => {
            if (m.group === oldGroup) {
              onUpdateMultiGroup(m.id, trimmed);
            }
          });
        }

        if (selectedGroupFilter === oldGroup) {
          setSelectedGroupFilter(trimmed);
        }
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* Header controls: Groups Filter Pills + View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-950/80 border border-zinc-800">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 max-w-full">
          <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mr-1 flex items-center gap-1">
            <Tag size={10} /> Groups:
          </span>

          <button
            onClick={() => setSelectedGroupFilter('ALL')}
            className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-all border ${
              selectedGroupFilter === 'ALL'
                ? 'bg-orange-600 text-white border-orange-500'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All ({items.length})
          </button>

          <button
            onClick={() => setSelectedGroupFilter('UNCATEGORIZED')}
            className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-all border ${
              selectedGroupFilter === 'UNCATEGORIZED'
                ? 'bg-orange-600 text-white border-orange-500'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Uncategorized
          </button>

          {allGroups.map(g => (
            <button
              key={g}
              onClick={() => setSelectedGroupFilter(g)}
              className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-all border flex items-center gap-1 ${
                selectedGroupFilter === g
                  ? 'bg-orange-600 text-white border-orange-500'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white'
              }`}
            >
              <Folder size={10} />
              {g}
            </button>
          ))}

          <button
            onClick={handleCreateGroup}
            className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-all border bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700 text-orange-400 flex items-center gap-1 ml-1"
            title="Create new Group"
          >
            <FolderPlus size={11} /> + New Group
          </button>

          {onAutoCategorizeAll && (
            <button
              onClick={onAutoCategorizeAll}
              className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider transition-all border bg-orange-950/40 hover:bg-orange-900/60 border-orange-700/60 text-orange-300 flex items-center gap-1 ml-1"
              title="Auto-Categorize all patches based on sound characteristics and naming"
            >
              <Sparkles size={11} className="text-orange-400 animate-pulse" /> Auto-Categorize All
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setIsGroupedView(true)}
            className={`p-1.5 border text-[9px] font-bold uppercase transition-all flex items-center gap-1 ${
              isGroupedView ? 'bg-orange-500/20 text-orange-400 border-orange-500/50' : 'bg-zinc-900 text-zinc-500 border-zinc-800'
            }`}
            title="Grouped Folder View"
          >
            <List size={12} /> Folders
          </button>
          <button
            onClick={() => setIsGroupedView(false)}
            className={`p-1.5 border text-[9px] font-bold uppercase transition-all flex items-center gap-1 ${
              !isGroupedView ? 'bg-orange-500/20 text-orange-400 border-orange-500/50' : 'bg-zinc-900 text-zinc-500 border-zinc-800'
            }`}
            title="Flat Grid View"
          >
            <Grid size={12} /> Grid
          </button>
        </div>
      </div>

      {/* Main Presets Display */}
      {Object.keys(groupedItems).length === 0 ? (
        <div className="py-12 text-center bg-zinc-900/50 border border-dashed border-zinc-800 text-zinc-500 uppercase tracking-widest text-[10px] font-bold">
          No matching {type.toLowerCase()} found in this group
        </div>
      ) : isGroupedView ? (
        <div className="space-y-4">
          {Object.entries(groupedItems).map(([groupName, groupListRaw]) => {
            const groupList = groupListRaw as (Patch | Multi)[];
            const isCollapsed = expandedGroups[groupName] === false;

            return (
              <div key={groupName} className="border border-zinc-800 bg-zinc-950/60 overflow-hidden">
                <div
                  className="bg-zinc-900/80 px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between cursor-pointer hover:bg-zinc-800/60 transition-colors"
                  onClick={() => toggleGroupExpand(groupName)}
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronRight size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-orange-500" />}
                    <Folder size={14} className="text-orange-500" />
                    <span className="font-bold text-xs uppercase tracking-wider text-zinc-200">{groupName}</span>
                    <span className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 border border-zinc-700/50">
                      {groupList.length} {type === 'PATCHES' ? 'Patch' : 'Multi'}{groupList.length > 1 ? 'es' : ''}
                    </span>
                  </div>

                  {groupName !== 'Uncategorized' && (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleRenameGroup(groupName)}
                        className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Rename Group"
                      >
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {!isCollapsed && (
                  <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                    {groupList.map(item => (
                      <PresetCard
                        key={item.id}
                        type={type}
                        item={item}
                        allGroups={allGroups}
                        isActive={type === 'PATCHES' ? activePatchId === item.id : activeMultiId === item.id}
                        onSelect={() => (type === 'PATCHES' ? onSelectPatch(item as Patch) : onSelectMulti(item as Multi))}
                        onRename={() => (type === 'PATCHES' ? onRenamePatch(item.id, item.name) : onRenameMulti(item.id, item.name))}
                        onDelete={() => (type === 'PATCHES' ? onDeletePatch(item.id) : onDeleteMulti(item.id))}
                        onUpdateGroup={(g) => (type === 'PATCHES' ? onUpdatePatchGroup(item.id, g) : onUpdateMultiGroup(item.id, g))}
                        showCustomPrompt={showCustomPrompt}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {(Object.values(groupedItems).flat() as (Patch | Multi)[]).map(item => (
            <PresetCard
              key={item.id}
              type={type}
              item={item}
              allGroups={allGroups}
              isActive={type === 'PATCHES' ? activePatchId === item.id : activeMultiId === item.id}
              onSelect={() => (type === 'PATCHES' ? onSelectPatch(item as Patch) : onSelectMulti(item as Multi))}
              onRename={() => (type === 'PATCHES' ? onRenamePatch(item.id, item.name) : onRenameMulti(item.id, item.name))}
              onDelete={() => (type === 'PATCHES' ? onDeletePatch(item.id) : onDeleteMulti(item.id))}
              onUpdateGroup={(g) => (type === 'PATCHES' ? onUpdatePatchGroup(item.id, g) : onUpdateMultiGroup(item.id, g))}
              showCustomPrompt={showCustomPrompt}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface PresetCardProps {
  type: 'PATCHES' | 'MULTIS';
  item: Patch | Multi;
  allGroups: string[];
  isActive: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onUpdateGroup: (groupName: string | undefined) => void;
  showCustomPrompt: (title: string, message: string, defaultValue: string, onConfirm: (val: string) => void) => void;
}

const PresetCard: React.FC<PresetCardProps> = ({
  type,
  item,
  allGroups,
  isActive,
  onSelect,
  onRename,
  onDelete,
  onUpdateGroup,
  showCustomPrompt,
}) => {
  return (
    <div
      className={`p-3 border transition-all cursor-pointer flex flex-col justify-between gap-2.5 group ${
        isActive
          ? 'bg-orange-600/10 border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.1)]'
          : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600'
      }`}
      onClick={onSelect}
    >
      <div className="flex justify-between items-center">
        <span className="text-zinc-500 font-mono text-[9px]">
          {type === 'PATCHES' ? 'P' : 'M'}-{item.id.slice(-4)}
        </span>
        <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
          <button
            onClick={onRename}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 text-zinc-400 hover:text-white rounded-none transition-all"
            title="Rename"
          >
            <Edit2 size={11} />
          </button>
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-red-500 rounded-none transition-all"
            title="Delete"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase truncate leading-none py-0.5 text-zinc-100">
          {item.name}
        </h3>
        {type === 'MULTIS' && 'slots' in item && (
          <div className="flex items-center gap-1 text-zinc-500 text-[8px] font-bold uppercase tracking-widest mt-1">
            <Layers size={9} />
            <span>
              {item.slots.length} Part{item.slots.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Group Selector Dropdown */}
      <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between" onClick={e => e.stopPropagation()}>
        <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-500 truncate">
          Group:
        </span>
        <select
          value={item.group || ''}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '__NEW__') {
              showCustomPrompt(
                'NEW GROUP',
                'ENTER GROUP NAME:',
                'New Group',
                (newG) => {
                  if (newG.trim()) onUpdateGroup(newG.trim());
                }
              );
            } else {
              onUpdateGroup(val || undefined);
            }
          }}
          className="bg-black border border-zinc-800 text-[8px] font-bold uppercase text-orange-400 p-0.5 focus:border-orange-500 outline-none max-w-[110px] truncate"
        >
          <option value="">(None)</option>
          {allGroups.map(g => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option value="__NEW__">+ Create New...</option>
        </select>
      </div>
    </div>
  );
};
