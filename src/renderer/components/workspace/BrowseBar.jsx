import { useEffect, useState } from 'react';
import { ArrowUpDownIcon, Button, ChevronLeftIcon, ChevronRightIcon, Flex, Input, Select } from 'xedonium';
import { PAGE_SIZES } from '../../lib/browse.js';

// Page / sort / filter controls of a table opened from the sidebar. They rebuild the tab's query and re-run it.
export default function BrowseBar({ browse, columns, language, loading, hasNext, onChange }) {
  const [where, setWhere] = useState(browse.where);
  useEffect(() => setWhere(browse.where), [browse.where]);
  const isCommand = language === 'command';
  const apply = () => {
    if (where !== browse.where) onChange({ where, page: 0 });
  };

  return (
    <Flex gap={2} align="end" wrap className="compact-fields px-2 pt-2">
      <div className="min-w-[14rem] flex-1">
        <Input
          value={where}
          onChange={setWhere}
          onKeyDown={event => {
            if (event.key === 'Enter') apply();
          }}
          onBlur={apply}
          placeholder={isCommand ? 'Filter, e.g. {"status":"active"}' : "Filter (WHERE), e.g. status = 'active'"}
          aria-label={isCommand ? 'Filter' : 'WHERE filter'}
        />
      </div>
      <div className="w-44">
        <Select
          value={browse.orderBy}
          onChange={value => onChange({ orderBy: value, page: 0 })}
          aria-label="Sort by"
          options={[{ value: '', label: 'No sorting' }, ...columns.map(column => ({ value: column, label: `Sort: ${column}` }))]}
        />
      </div>
      <span className="compact-buttons">
        <Button
          variant="secondary"
          tooltip={browse.orderDir === 'desc' ? 'Descending' : 'Ascending'}
          aria-label="Toggle sort direction"
          disabled={!browse.orderBy}
          onClick={() => onChange({ orderDir: browse.orderDir === 'desc' ? 'asc' : 'desc', page: 0 })}
        >
          <ArrowUpDownIcon /> {browse.orderDir === 'desc' ? 'Desc' : 'Asc'}
        </Button>
      </span>
      <div className="w-28">
        <Select
          value={String(browse.pageSize)}
          onChange={value => onChange({ pageSize: Number(value), page: 0 })}
          aria-label="Rows per page"
          options={PAGE_SIZES.map(size => ({ value: String(size), label: `${size} rows` }))}
        />
      </div>
      <Flex gap={1} align="center" className="compact-buttons">
        <Button variant="secondary" tooltip="Previous page" aria-label="Previous page" disabled={loading || browse.page === 0} onClick={() => onChange({ page: browse.page - 1 })}>
          <ChevronLeftIcon />
        </Button>
        <span className="min-w-[4.5rem] text-center text-xs text-app-muted">Page {browse.page + 1}</span>
        <Button variant="secondary" tooltip="Next page" aria-label="Next page" disabled={loading || !hasNext} onClick={() => onChange({ page: browse.page + 1 })}>
          <ChevronRightIcon />
        </Button>
      </Flex>
    </Flex>
  );
}
