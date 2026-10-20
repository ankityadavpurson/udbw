import tokenizeQuery from '../lib/tokenize.js';

// Engine help text. Text between backticks is code and gets the editor's syntax colours; the leading "… mode" is the accent.
export default function HelpText({ text, language }) {
  const parts = text.split('`');
  return (
    <p className="max-w-sm text-xs leading-6">
      {parts.map((part, i) => {
        if (i % 2 === 0) {
          const mode = i === 0 ? /^(\w+ mode)(.*)$/s.exec(part) : null;
          return mode ? (
            <span key={i}>
              <strong className="font-semibold text-[#aa77fd]">{mode[1]}</strong>
              {mode[2]}
            </span>
          ) : (
            <span key={i}>{part}</span>
          );
        }
        const segments = tokenizeQuery(part, language)[0] || [];
        return (
          <code key={i} className="rounded bg-app-bg px-1 py-0.5 font-mono text-[11px]">
            {segments.map((segment, j) => (
              <span key={j} style={segment.kind ? { color: `var(--xd-tok-${segment.kind})` } : undefined}>
                {segment.text}
              </span>
            ))}
          </code>
        );
      })}
    </p>
  );
}
