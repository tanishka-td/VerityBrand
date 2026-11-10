import type { ReactNode } from 'react'

export type IconName = 'mark' | 'review' | 'library' | 'arrow' | 'check' | 'alert' | 'clock' | 'spark' | 'external' | 'chevron' | 'close' | 'file' | 'calendar' | 'shield' | 'send' | 'edit' | 'loom' | 'pin' | 'info' | 'quote' | 'seal' | 'plus'

const shapes: Record<IconName, ReactNode> = {
  mark: <><path d="M4 5.5 12 19l8-13.5" /><path d="M8.1 12.4h7.8" /><circle cx="12" cy="12.4" r="1.1" fill="currentColor" stroke="none" /></>,
  review: <><path d="M4.5 5.5h15v13h-15z" /><path d="M8 9h8M8 12h5M8 15h7" /><path d="m15 15 1.7 1.7L20 13.5" /></>,
  library: <><path d="M5 4.5h11a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z" /><path d="M7 17h13M8.5 8h6M8.5 11.5h6" /></>,
  arrow: <><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></>,
  check: <path d="m5 12.5 4.2 4.2L19 7" />,
  alert: <><path d="M12 3.5 21 20H3z" /><path d="M12 9v4.4M12 17h.01" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.3 2" /></>,
  spark: <><path d="m12 3 1.9 5.9L20 11l-6.1 2.1L12 19l-1.9-5.9L4 11l6.1-2.1z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></>,
  external: <><path d="M13 5h6v6M19 5l-9 9" /><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  chevron: <path d="m8 10 4 4 4-4" />,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  file: <><path d="M7 3.5h7l4 4v13H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z" /><path d="M14 3.5v4h4M8.5 12h7M8.5 15h7" /></>,
  calendar: <><rect x="4.5" y="6" width="15" height="14" rx="1.5" /><path d="M8 4v4M16 4v4M4.5 10h15" /></>,
  shield: <><path d="M12 3.5 19 6v5.3c0 4.2-2.8 7.4-7 9.2-4.2-1.8-7-5-7-9.2V6z" /><path d="m9 12.3 2 2 4-4.2" /></>,
  send: <><path d="m4 5 16 7-16 7 3-7z" /><path d="M7 12h13" /></>,
  edit: <><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5z" /><path d="m13.8 6.7 3.5 3.5" /></>,
  loom: <><path d="M5 4v16M19 4v16M5 7h14M5 12h14M5 17h14" /><path d="m8 5 8 14M16 5 8 19" /></>,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  quote: <><path d="M5 6h6v6H7v2a3 3 0 0 1-3 3M14 6h6v6h-4v2a3 3 0 0 1-3 3" /></>,
  seal: <><path d="m12 3 2 2 2.8-.1.8 2.7 2.4 1.4-.9 2.7.9 2.7-2.4 1.4-.8 2.7-2.8-.1-2 2-2-2-2.8.1-.8-2.7L4 14.3l.9-2.7L4 8.9l2.4-1.4.8-2.7L10 5z" /><path d="m9 12 2 2 4-4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
}

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shapes[name]}
    </svg>
  )
}
