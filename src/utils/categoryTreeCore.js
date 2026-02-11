const sortByOrder = (a, b) => {
  const ao = a.sort_order ?? 0;
  const bo = b.sort_order ?? 0;
  if (ao !== bo) return ao - bo;
  return String(a.id).localeCompare(String(b.id));
};

export const buildCategoryTree = (flat) => {
  const map = new Map();
  const roots = [];

  (flat || []).forEach((c) => {
    map.set(c.id, { ...c, children: [] });
  });

  map.forEach((c) => {
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id).children.push(c);
    } else {
      roots.push(c);
    }
  });

  const sortRec = (nodes) => {
    nodes.sort(sortByOrder);
    nodes.forEach((n) => {
      if (n.children && n.children.length > 0) sortRec(n.children);
    });
  };

  sortRec(roots);
  return { tree: roots, map };
};

export const reorderByIds = (items, orderedIds) => {
  const byId = new Map((items || []).map((i) => [i.id, i]));
  const result = [];

  (orderedIds || []).forEach((id) => {
    const found = byId.get(id);
    if (found) result.push(found);
    byId.delete(id);
  });

  byId.forEach((v) => result.push(v));
  return result;
};
