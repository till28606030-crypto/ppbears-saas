import sys

path = 'src/pages/seller/products-v2/ProductEditor/index.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

target = """                                                    return (
                                                      <label
                                                        key={group.id}
                                                        className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all ${isChecked ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-gray-200 hover:border-blue-300'}`}
                                                      >
                                                        <input
                                                          type="checkbox"
                                                          checked={isChecked}
                                                          onChange={(e) => {
                                                            const currentLinked = draft?.specs?.linked_option_groups || [];
                                                            const newLinked = e.target.checked
                                                              ? [...currentLinked, group.id]
                                                              : currentLinked.filter(id => id !== group.id);
                                                            updateSpecs({ linked_option_groups: newLinked });
                                                          }}
                                                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 mt-1"
                                                        />
                                                        <div className="flex-1">
                                                          <div className="text-sm font-bold text-gray-800">{group.name}</div>
                                                          {group.ui_config?.note && (
                                                            <div className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded w-fit mt-1">
                                                              {group.ui_config.note}
                                                            </div>
                                                          )}
                                                          {group.price_modifier !== 0 && (
                                                            <div className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded w-fit mt-1">
                                                              加價: {group.price_modifier > 0 ? '+' : ''}{group.price_modifier} 元
                                                            </div>
                                                          )}
                                                        </div>
                                                      </label>
                                                    );"""

replacement = """                                                    const groupItems = optionItems.filter((i: any) => i.parentId === group.id);
                                                    const linkedItemsMap = draft?.specs?.linked_option_items || {};
                                                    const currentlyLinkedItems = group.id in linkedItemsMap ? linkedItemsMap[group.id] : groupItems.map((i: any) => i.id);

                                                    return (
                                                      <div
                                                        key={group.id}
                                                        className={`flex flex-col border rounded-xl overflow-hidden transition-all ${isChecked ? 'bg-white border-blue-300 shadow-sm' : 'bg-white border-gray-200 hover:border-blue-300'}`}
                                                      >
                                                        {/* Target Label Header */}
                                                        <label className={`flex items-center gap-3 p-3 cursor-pointer ${isChecked ? 'bg-blue-50/50' : ''}`}>
                                                          <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                              const currentLinked = draft?.specs?.linked_option_groups || [];
                                                              const newLinked = e.target.checked
                                                                ? [...currentLinked, group.id]
                                                                : currentLinked.filter(id => id !== group.id);
                                                              updateSpecs({ linked_option_groups: newLinked });
                                                            }}
                                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 mt-1"
                                                          />
                                                          <div className="flex-1">
                                                            <div className="text-sm font-bold text-gray-800">{group.name}</div>
                                                            {group.ui_config?.note && (
                                                              <div className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded w-fit mt-1">
                                                                {group.ui_config.note}
                                                              </div>
                                                            )}
                                                            {group.price_modifier !== 0 && (
                                                              <div className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded w-fit mt-1">
                                                                加價: {group.price_modifier > 0 ? '+' : ''}{group.price_modifier} 元
                                                              </div>
                                                            )}
                                                          </div>
                                                        </label>

                                                        {/* Target Child Items Selector */}
                                                        {isChecked && groupItems.length > 0 && (
                                                          <div className="p-3 bg-white border-t border-blue-100">
                                                            <div className="flex items-center justify-between mb-2">
                                                              <span className="text-xs font-bold text-gray-700">可用的顏色/子項 ({groupItems.length})</span>
                                                              <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                  e.preventDefault();
                                                                  e.stopPropagation();
                                                                  const isAllSelected = currentlyLinkedItems.length === groupItems.length;
                                                                  const newMap = { ...linkedItemsMap };
                                                                  if (isAllSelected) {
                                                                    newMap[group.id] = []; 
                                                                  } else {
                                                                    newMap[group.id] = groupItems.map((i: any) => i.id); 
                                                                  }
                                                                  // Clean duplicates just in case
                                                                  updateSpecs({ linked_option_items: newMap });
                                                                }}
                                                                className="text-[10px] font-medium text-blue-600 hover:text-blue-800 px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                                                              >
                                                                {currentlyLinkedItems.length === groupItems.length ? '全部取消' : '全選'}
                                                              </button>
                                                            </div>
                                                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                                              {groupItems.map((item: any) => {
                                                                const isItemSelected = currentlyLinkedItems.includes(item.id);
                                                                return (
                                                                  <label key={item.id} className={`flex items-center gap-2 p-1.5 border rounded cursor-pointer text-xs transition-colors ${isItemSelected ? 'bg-blue-50/50 border-blue-200 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-60 hover:opacity-100 hover:border-gray-300'}`}>
                                                                    <input
                                                                      type="checkbox"
                                                                      checked={isItemSelected}
                                                                      onChange={(e) => {
                                                                        const newMap = { ...linkedItemsMap };
                                                                        if (e.target.checked) {
                                                                          const currentForGrp = newMap[group.id] || groupItems.map((i: any) => i.id);
                                                                          newMap[group.id] = list(set([...currentForGrp, item.id])); // Handled in JS below
                                                                        }
                                                                      }}
                                                                      className="hidden" // Will be handled better below
                                                                    />
                                                                  </label>
                                                                );
                                                              })}
                                                            </div>
                                                          </div>
                                                        )}
                                                      </div>
                                                    );"""

# The python target block had template literals, we need to make sure we don't mess it up!
# Let me fix the JS inside the replacement text manually since Python list(set(...)) won't run in JS!

replacement = """                                                    const groupItems = optionItems.filter((i: any) => i.parentId === group.id);
                                                    const linkedItemsMap = draft?.specs?.linked_option_items || {};
                                                    const currentlyLinkedItems = group.id in linkedItemsMap ? linkedItemsMap[group.id] : groupItems.map((i: any) => i.id);

                                                    return (
                                                      <div
                                                        key={group.id}
                                                        className={`flex flex-col border rounded-xl overflow-hidden transition-all ${isChecked ? 'bg-white border-blue-300 shadow-sm' : 'bg-white border-gray-200 hover:border-blue-300'}`}
                                                      >
                                                        {/* Target Label Header */}
                                                        <label className={`flex items-center gap-3 p-3 cursor-pointer ${isChecked ? 'bg-blue-50/50' : ''}`}>
                                                          <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                              const currentLinked = draft?.specs?.linked_option_groups || [];
                                                              const newLinked = e.target.checked
                                                                ? [...currentLinked, group.id]
                                                                : currentLinked.filter(id => id !== group.id);
                                                              updateSpecs({ linked_option_groups: newLinked });
                                                            }}
                                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 mt-1"
                                                          />
                                                          <div className="flex-1">
                                                            <div className="text-sm font-bold text-gray-800">{group.name}</div>
                                                            {group.ui_config?.note && (
                                                              <div className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded w-fit mt-1">
                                                                {group.ui_config.note}
                                                              </div>
                                                            )}
                                                            {group.price_modifier !== 0 && (
                                                              <div className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded w-fit mt-1">
                                                                加價: {group.price_modifier > 0 ? '+' : ''}{group.price_modifier} 元
                                                              </div>
                                                            )}
                                                          </div>
                                                        </label>

                                                        {/* Target Child Items Selector */}
                                                        {isChecked && groupItems.length > 0 && (
                                                          <div className="p-3 bg-white border-t border-blue-100">
                                                            <div className="flex items-center justify-between mb-2">
                                                              <span className="text-xs font-bold text-gray-700">可用的顏色/子項 ({groupItems.length})</span>
                                                              <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                  e.preventDefault();
                                                                  e.stopPropagation();
                                                                  const isAllSelected = currentlyLinkedItems.length === groupItems.length;
                                                                  const newMap = { ...linkedItemsMap };
                                                                  if (isAllSelected) {
                                                                    newMap[group.id] = []; 
                                                                  } else {
                                                                    newMap[group.id] = groupItems.map((i: any) => i.id); 
                                                                  }
                                                                  updateSpecs({ linked_option_items: newMap });
                                                                }}
                                                                className="text-[10px] font-medium text-blue-600 hover:text-blue-800 px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                                                              >
                                                                {currentlyLinkedItems.length === groupItems.length ? '全部取消' : '全選'}
                                                              </button>
                                                            </div>
                                                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                                              {groupItems.map((item: any) => {
                                                                const isItemSelected = currentlyLinkedItems.includes(item.id);
                                                                return (
                                                                  <label key={item.id} className={`flex items-center gap-2 p-1.5 border rounded cursor-pointer text-xs transition-colors ${isItemSelected ? 'bg-blue-50/50 border-blue-200 shadow-sm' : 'bg-gray-50 border-gray-200 opacity-60 hover:opacity-100 hover:border-gray-300'}`}>
                                                                    <input
                                                                      type="checkbox"
                                                                      checked={isItemSelected}
                                                                      onChange={(e) => {
                                                                        const newMap = { ...linkedItemsMap };
                                                                        if (e.target.checked) {
                                                                           newMap[group.id] = Array.from(new Set([...currentlyLinkedItems, item.id]));
                                                                        } else {
                                                                           newMap[group.id] = currentlyLinkedItems.filter((id: string) => id !== item.id);
                                                                        }
                                                                        updateSpecs({ linked_option_items: newMap });
                                                                      }}
                                                                      className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-1 focus:ring-blue-500 shrink-0"
                                                                    />
                                                                    <span className={`truncate ${isItemSelected ? 'text-gray-800 font-medium' : 'text-gray-500'}`} title={item.name}>
                                                                      {item.name}
                                                                    </span>
                                                                  </label>
                                                                );
                                                              })}
                                                            </div>
                                                          </div>
                                                        )}
                                                      </div>
                                                    );"""

# Just a simple literal replacement regardless of CRLF vs LF differences
content_normalized = content.replace('\\r\\n', '\\n')
target_normalized = target.replace('\\r\\n', '\\n')

if target_normalized in content_normalized:
    new_content = content_normalized.replace(target_normalized, replacement)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("SUCCESS")
else:
    print("TARGET NOT FOUND. Will attempt flexible match")
    # try to strip trailing whitespace lines
    lines_content = [l.rstrip() for l in content_normalized.split('\\n')]
    target_lines = [l.rstrip() for l in target_normalized.split('\\n')]
    
    # Simple sliding window
    for i in range(len(lines_content) - len(target_lines) + 1):
        if lines_content[i:i+len(target_lines)] == target_lines:
            lines_content = lines_content[:i] + replacement.split('\\n') + lines_content[i+len(target_lines):]
            with open(path, 'w', encoding='utf-8') as f:
                f.write('\\n'.join(lines_content))
            print("SUCCESS VIA LINES MATCH")
            sys.exit(0)
    print("FAILED")
