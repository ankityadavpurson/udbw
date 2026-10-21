import {
  Button,
  CodeIcon,
  Flex,
  FolderIcon,
  HelperText,
  InfoCircleIcon,
  Input,
  ListIcon,
  Loader,
  Menu,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  Select,
  Stack,
  TableIcon,
  Tree
} from 'xedonium';

const typeLabel = type => ({ table: 'Tables', view: 'Views', sequence: 'Sequences', function: 'Functions', collection: 'Collections' })[type] || type;
const TYPE_ORDER = ['table', 'view', 'collection', 'sequence', 'function'];
const typeIcon = type => (type === 'collection' ? <FolderIcon /> : type === 'function' ? <CodeIcon /> : type === 'sequence' ? <ListIcon /> : <TableIcon />);
const objectKey = item => `obj:${item.schema || ''}.${item.name}`;

// `tree` is the object returned by useObjectTree.
export default function ObjectBrowser({ active, isConnected, connecting, tree, selectedObject, onOpen, createItems = [], onInfo }) {
  if (connecting)
    return (
      <div className="p-4">
        <Loader variant="inline" size="sm" label="Connecting…" />
      </div>
    );
  if (!active || !isConnected) return <HelperText className="p-4">Connect to browse databases and objects.</HelperText>;
  const { objectTree, treeLoading, currentDatabase, currentSchema, objectSearch, setObjectSearch, loadObjectTree, changeDatabase, changeSchema } = tree;

  const objects = (objectTree?.objects || []).filter(item => item.name.toLowerCase().includes(objectSearch.trim().toLowerCase()));
  const objectTypes = [...new Set(objects.map(item => item.type || 'object'))].sort((a, b) => (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99));
  const lookup = new Map();
  const nodes = objectTypes.map(type => {
    const items = objects.filter(item => (item.type || 'object') === type);
    return {
      key: `group:${type}`,
      label: (
        <span className="font-semibold">
          {typeLabel(type)} <span className="text-app-muted">({items.length})</span>
        </span>
      ),
      children: items.map(item => {
        const key = objectKey(item);
        lookup.set(key, item);
        return {
          key,
          label: (
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{typeIcon(type)}</span>
              <span className="truncate">{item.signature || item.name}</span>
              {item.columns?.length ? (
                <span className="ml-auto shrink-0 text-[11px] text-app-muted">{item.columns.length} cols</span>
              ) : item.metadata && item.type !== 'collection' ? (
                <span className="ml-auto shrink-0 text-[11px] text-app-muted">{item.metadata}</span>
              ) : null}
            </span>
          )
        };
      })
    };
  });

  return (
    <Stack gap={2} className="compact-fields p-2">
      <Flex justify="between" align="center">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-app-muted">Database objects</span>
        <Flex gap={1} className="compact-buttons compact-icons">
          {!!createItems.length && <Menu label="New object" variant="flat" placement="bottom-end" trigger={<PlusIcon />} items={createItems} />}
          {onInfo && (
            <Button variant="flat" tooltip="Database info: size, character set, object counts" aria-label="Database info" onClick={onInfo}>
              <InfoCircleIcon className="h-4 w-4" />
            </Button>
          )}
          <Button variant="flat" tooltip="Refresh objects" aria-label="Refresh objects" disabled={treeLoading} onClick={() => loadObjectTree()}>
            <RefreshIcon />
          </Button>
        </Flex>
      </Flex>
      {!!objectTree?.databases?.length && (
        <Select
          label="Database"
          disabled={treeLoading}
          value={currentDatabase || objectTree.databases[0]}
          onChange={changeDatabase}
          options={objectTree.databases.map(db => ({ value: db, label: db }))}
        />
      )}
      {!!objectTree?.schemas?.length && (
        <Select
          label="Schema"
          disabled={treeLoading}
          value={currentSchema}
          placeholder="All schemas"
          onChange={changeSchema}
          options={[{ value: '', label: 'All schemas' }, ...objectTree.schemas.map(schema => ({ value: schema, label: schema }))]}
        />
      )}
      {!!objectTree?.objects?.length && (
        <Input
          value={objectSearch}
          onChange={setObjectSearch}
          placeholder="Search objects…"
          aria-label="Search database objects"
          startAdornment={<SearchIcon className="h-4 w-4" />}
        />
      )}
      {treeLoading && <Loader variant="inline" size="sm" label="Loading objects…" />}
      {!treeLoading && objectTree?.message && <HelperText>{objectTree.message}</HelperText>}
      {!treeLoading && !objectTree?.message && !objects.length && <HelperText>{objectSearch ? 'No objects match this search.' : 'No databases or objects available.'}</HelperText>}
      {!treeLoading && !!nodes.length && (
        <Tree
          key={`${currentDatabase}|${currentSchema}|${objectTree?.objects?.length}|${objectSearch}`}
          label="Database objects"
          nodes={nodes}
          defaultExpanded={nodes.filter(n => n.key !== 'group:function' && n.key !== 'group:sequence').map(n => n.key)}
          selected={selectedObject ? objectKey(selectedObject) : undefined}
          onSelect={key => {
            const item = lookup.get(key);
            if (item) onOpen(item);
          }}
        />
      )}
    </Stack>
  );
}
