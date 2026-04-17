import { ARCHETYPE_STYLES } from '../styles/tokens.js';

export function ArchetypeTag({ archetype }) {
  const s = ARCHETYPE_STYLES[archetype] ?? ARCHETYPE_STYLES.classic;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 9999,
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      background: s.bg,
      border: `1px solid ${s.border}`,
      color: s.text,
    }}>
      {s.label}
    </span>
  );
}
