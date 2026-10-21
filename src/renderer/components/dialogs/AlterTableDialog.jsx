import { Alert, Button, Checkbox, Field, Flex, HelperText, Loader, Modal, PlusIcon, Select, Stack, Trash2Icon } from 'xedonium';
import { columnTypesFor } from '../../lib/create.js';

// `alter` is the object returned by useAlterTable.
export default function AlterTableDialog({ alter, active }) {
  const { open, object, rows, tableName, ops, error, busy, statements, close, updateRow, addRow, removeRow, rename, previewSql, submit } = alter;
  if (!object) return null;
  const types = columnTypesFor(active);
  const keys = object.primaryKey || [];

  return (
    <Modal
      open={open}
      onClose={close}
      as="form"
      noValidate
      onSubmit={submit}
      busy={busy}
      maxWidth="max-w-4xl"
      title={`Edit structure · ${object.name}`}
      footer={
        <Flex justify="between" align="center" gap={2} className="w-full">
          <div className="compact-buttons">
            <Button type="button" variant="secondary" disabled={busy || !ops.length} onClick={previewSql}>
              Preview SQL
            </Button>
          </div>
          <Flex gap={2}>
            <Button type="button" variant="flat" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !ops.length}>
              {busy ? (
                <>
                  <Loader variant="spinner" size="sm" label="Applying" /> Applying…
                </>
              ) : ops.length ? (
                `Apply ${ops.length} change${ops.length === 1 ? '' : 's'}`
              ) : (
                'Apply changes'
              )}
            </Button>
          </Flex>
        </Flex>
      }
    >
      <Stack gap={3} className="compact-fields p-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Alert tone="warning">Changes apply to the database as soon as you confirm. Removing a column deletes its data, and this cannot be undone.</Alert>
        <Field label="Table name" value={tableName} onChange={rename} required />
        <Stack gap={2}>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-app-muted">Columns</span>
          {rows.map((row, index) => {
            const label = text => (index === 0 ? text : undefined);
            const options = types.includes(row.type) ? types : [row.type, ...types];
            return (
              <div key={row.id} className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto_auto] items-end gap-2 ${row.removed ? 'opacity-50' : ''}`}>
                <Field
                  label={label('Name')}
                  aria-label={`Column ${index + 1} name`}
                  value={row.name}
                  disabled={row.removed}
                  onChange={value => updateRow(row.id, { name: value })}
                />
                <Select
                  label={label('Type')}
                  aria-label={`Column ${index + 1} type`}
                  value={row.type}
                  disabled={row.removed}
                  onChange={value => updateRow(row.id, { type: value })}
                  options={options.map(type => ({ value: type, label: type }))}
                />
                <Field
                  label={label('Default')}
                  aria-label={`Column ${index + 1} default`}
                  value={row.defaultValue}
                  disabled={row.removed || row.auto}
                  placeholder="None"
                  onChange={value => updateRow(row.id, { defaultValue: value })}
                />
                <Checkbox
                  label="Null"
                  checked={row.nullable}
                  disabled={row.removed || keys.includes(row.original?.name)}
                  onChange={value => updateRow(row.id, { nullable: value })}
                />
                <Button
                  type="button"
                  variant="flat"
                  aria-label={row.removed ? `Keep column ${index + 1}` : `Remove column ${index + 1}`}
                  tooltip={row.removed ? 'Keep this column' : 'Remove this column'}
                  onClick={() => removeRow(row.id)}
                >
                  {row.removed ? 'Undo' : <Trash2Icon />}
                </Button>
              </div>
            );
          })}
          <div className="compact-buttons">
            <Button type="button" variant="secondary" onClick={addRow}>
              <PlusIcon /> Add column
            </Button>
          </div>
          <HelperText>
            Rename a column or table by editing its name. A default is a plain value: a number, true or false, text, or CURRENT_TIMESTAMP on a date or time column; clear it to
            remove the default. Keys and auto-numbering are not changed here.
          </HelperText>
        </Stack>
        {statements && (
          <div className="border border-app-border bg-app-card p-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-app-muted">SQL that will run</div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-xs select-text">{statements.map(sql => `${sql};`).join('\n')}</pre>
          </div>
        )}
      </Stack>
    </Modal>
  );
}
