// Server-side paging, sorting and filtering for a table (or collection) opened from the sidebar. The browse state is
// turned into a normal query, which stays visible and editable in the editor; editing it by hand leaves browse mode.

export const DEFAULT_BROWSE = { page: 0, pageSize: 100, orderBy: '', orderDir: 'asc', where: '' };
export const PAGE_SIZES = [50, 100, 250, 500];

const isRestSupabase = active => active?.type === 'supabase' && !active.connectionString;

export function canBrowse(active, object) {
  if (!active || !object) return false;
  if (active.type === 'mongodb' || active.type === 'firestore') return object.type === 'collection';
  if (isRestSupabase(active)) return object.type === 'table';
  if (['mysql', 'postgres', 'supabase'].includes(active.type)) return object.type === 'table' || object.type === 'view';
  return false;
}

// Builds the query for one page. It asks for one extra row so the UI can tell whether a next page exists.
export function buildBrowseQuery(active, object, state) {
  const { page, pageSize, orderBy, orderDir, where } = state;
  const dir = orderDir === 'desc' ? 'DESC' : 'ASC';
  if (active.type === 'firestore') {
    const filter = where.trim();
    return `read ${object.name}${filter ? ` WHERE ${filter}` : ''}${orderBy ? ` ORDER BY ${orderBy} ${dir}` : ''} LIMIT ${pageSize + 1}${page ? ` OFFSET ${page * pageSize}` : ''}`;
  }
  if (isRestSupabase(active)) {
    const filter = where.trim();
    return `REST: ${object.name}${filter ? ` WHERE ${filter}` : ''}${orderBy ? ` ORDER BY ${orderBy} ${dir}` : ''} LIMIT ${pageSize + 1}${page ? ` OFFSET ${page * pageSize}` : ''}`;
  }
  if (active.type === 'mongodb') {
    const filter = where.trim();
    return `find ${object.name}${filter ? ` ${filter}` : ''}${orderBy ? ` SORT ${JSON.stringify({ [orderBy]: dir === 'DESC' ? -1 : 1 })}` : ''}${page ? ` SKIP ${page * pageSize}` : ''} LIMIT ${pageSize + 1}`;
  }
  const quote = active.type === 'mysql' ? value => `\`${String(value).replace(/`/g, '``')}\`` : value => `"${String(value).replace(/"/g, '""')}"`;
  const table = `${object.schema ? `${quote(object.schema)}.` : ''}${quote(object.name)}`;
  const filter = where.trim().replace(/;+\s*$/, '');
  return `SELECT * FROM ${table}${filter ? ` WHERE ${filter}` : ''}${orderBy ? ` ORDER BY ${quote(orderBy)} ${dir}` : ''} LIMIT ${pageSize + 1} OFFSET ${page * pageSize};`;
}
