import { Button, Chip, Flex, HelperText, Modal, Stack } from 'xedonium';

const Heading = ({ children }) => <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-app-muted">{children}</h3>;

// Columns, primary key and indexes of the opened table (read by describe when the table was opened).
export default function StructureDialog({ open, onClose, object }) {
  const info = object?.columnInfo || [];
  const keys = new Set(object?.primaryKey || []);
  const indexes = object?.indexes || [];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Structure of ${object?.name || ''}`}
      maxWidth="max-w-3xl"
      footer={
        <Flex justify="end">
          <Button onClick={onClose}>Close</Button>
        </Flex>
      }
    >
      <Stack gap={4} className="p-5">
        <div>
          <Heading>Columns ({info.length})</Heading>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-app-muted">
                <th className="pr-3 font-medium">Name</th>
                <th className="pr-3 font-medium">Type</th>
                <th className="font-medium">Nullable</th>
              </tr>
            </thead>
            <tbody>
              {info.map(c => (
                <tr key={c.name} className="border-t border-app-border">
                  <td className="py-1 pr-3 font-mono">
                    {c.name} {keys.has(c.name) && <Chip>PK</Chip>}
                  </td>
                  <td className="pr-3 font-mono">{c.type}</td>
                  <td>{c.nullable ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <Heading>Indexes ({indexes.length})</Heading>
          {indexes.length ? (
            <ul className="space-y-1 text-sm">
              {indexes.map(i => (
                <li key={i.name}>
                  <span className="font-mono font-semibold">{i.name}</span>
                  {i.unique && (
                    <>
                      {' '}
                      <Chip>unique</Chip>
                    </>
                  )}
                  <div className="break-all font-mono text-xs text-app-muted">{i.definition || (i.columns || []).join(', ')}</div>
                </li>
              ))}
            </ul>
          ) : (
            <HelperText>No indexes reported.</HelperText>
          )}
        </div>
      </Stack>
    </Modal>
  );
}
