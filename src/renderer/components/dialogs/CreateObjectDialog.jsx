import { Alert, Button, Checkbox, Field, Flex, HelperText, Loader, Modal, PlusIcon, Select, Stack, TextArea, Trash2Icon } from 'xedonium';
import { KIND_LABEL, columnTypesFor } from '../../lib/create.js';

const TITLES = { database: 'New database', schema: 'New schema', table: 'New table', collection: 'New collection' };

// `create` is the object returned by useCreateObject; `schemas` are the schemas a new table can go into.
export default function CreateObjectDialog({ create, active, schemas = [] }) {
  const { open, values, error, busy, statements, previewSql, close, update, updateColumn, addColumn, removeColumn, submit } = create;
  if (!values) return null;
  const { kind } = values;
  const mongo = active?.type === 'mongodb';
  const firestore = active?.type === 'firestore';
  const types = columnTypesFor(active);

  return (
    <Modal
      open={open}
      onClose={close}
      as="form"
      noValidate
      onSubmit={submit}
      busy={busy}
      maxWidth={kind === 'table' ? 'max-w-3xl' : 'max-w-lg'}
      title={`${TITLES[kind]}${active ? ` · ${active.name}` : ''}`}
      footer={
        <Flex justify="between" align="center" gap={2} className="w-full">
          <div className="compact-buttons">
            {!mongo && !firestore && (
              <Button type="button" variant="secondary" disabled={busy} onClick={previewSql}>
                Preview SQL
              </Button>
            )}
          </div>
          <Flex gap={2}>
            <Button type="button" variant="flat" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader variant="spinner" size="sm" label="Creating" /> Creating…
                </>
              ) : (
                'Create'
              )}
            </Button>
          </Flex>
        </Flex>
      }
    >
      <Stack gap={3} className="compact-fields p-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label={`${KIND_LABEL[kind][0].toUpperCase()}${KIND_LABEL[kind].slice(1)} name`} value={values.name} onChange={value => update('name', value)} required autoFocus />

        {kind === 'database' && mongo && (
          <Field
            label="First collection"
            value={values.collection}
            onChange={value => update('collection', value)}
            helperText="MongoDB keeps a database only once it holds a collection."
            required
          />
        )}

        {kind === 'collection' && firestore && (
          <>
            <HelperText>Firestore has no empty collections. The collection is created together with its first document.</HelperText>
            <Field label="Document ID (optional)" value={values.documentId} onChange={value => update('documentId', value)} placeholder="Generated automatically when empty" />
            <div className="[&_textarea]:font-mono [&_textarea]:text-xs">
              <TextArea label="First document (JSON)" rows={8} spellCheck={false} value={values.documentText} onChange={value => update('documentText', value)} />
            </div>
          </>
        )}

        {kind === 'table' && (
          <>
            {!!schemas.length && (
              <Select
                label="Schema"
                value={values.schema}
                placeholder="Default"
                onChange={value => update('schema', value)}
                options={[{ value: '', label: 'Default' }, ...schemas.map(schema => ({ value: schema, label: schema }))]}
              />
            )}
            <Stack gap={2}>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-app-muted">Columns</span>
              {values.columns.map((column, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto_auto_auto_auto] items-end gap-2">
                  <Field
                    label={index === 0 ? 'Name' : undefined}
                    aria-label={`Column ${index + 1} name`}
                    value={column.name}
                    onChange={value => updateColumn(index, { name: value })}
                  />
                  <Select
                    label={index === 0 ? 'Type' : undefined}
                    aria-label={`Column ${index + 1} type`}
                    value={column.type}
                    onChange={value => updateColumn(index, { type: value })}
                    options={(types.includes(column.type) ? types : [column.type, ...types]).map(type => ({ value: type, label: type }))}
                  />
                  <Field
                    label={index === 0 ? 'Default' : undefined}
                    aria-label={`Column ${index + 1} default`}
                    value={column.autoIncrement ? '' : column.defaultValue || ''}
                    disabled={column.autoIncrement}
                    placeholder="None"
                    onChange={value => updateColumn(index, { defaultValue: value })}
                  />
                  <Checkbox label="Key" checked={column.primaryKey} onChange={value => updateColumn(index, { primaryKey: value, nullable: value ? false : column.nullable })} />
                  <Checkbox
                    label="Null"
                    checked={column.nullable && !column.primaryKey}
                    disabled={column.primaryKey}
                    onChange={value => updateColumn(index, { nullable: value })}
                  />
                  <Checkbox label="Auto" checked={column.autoIncrement} onChange={value => updateColumn(index, { autoIncrement: value })} />
                  <Button
                    type="button"
                    variant="flat"
                    aria-label={`Remove column ${index + 1}`}
                    tooltip="Remove column"
                    disabled={values.columns.length === 1}
                    onClick={() => removeColumn(index)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              <div className="compact-buttons">
                <Button type="button" variant="secondary" onClick={addColumn}>
                  <PlusIcon /> Add column
                </Button>
              </div>
              <HelperText>
                Key marks the primary key. Auto numbers the column for you and needs an integer type. A default is a plain value: a number, true or false, text, or
                CURRENT_TIMESTAMP on a date or time column.
              </HelperText>
            </Stack>
          </>
        )}
        {statements && (
          <div className="border border-app-border bg-app-card p-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-app-muted">SQL that will run</div>
            <pre className="max-h-48 overflow-auto select-text whitespace-pre-wrap break-all font-mono text-xs">{statements.map(sql => `${sql};`).join('\n')}</pre>
          </div>
        )}
      </Stack>
    </Modal>
  );
}
