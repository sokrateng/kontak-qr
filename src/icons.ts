const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const icons = {
  card: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h4M7 14h7"/><circle cx="17" cy="11" r="1.4"/>'),
  wifi: svg('<path d="M3.5 9.5a12 12 0 0 1 17 0M6.5 12.8a7.6 7.6 0 0 1 11 0M9.5 16a3.2 3.2 0 0 1 5 0"/><circle cx="12" cy="19" r=".9"/>'),
  people: svg('<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/><path d="M15.5 6.4a3 3 0 0 1 0 5.4M17.5 14.6c1.8.5 3 1.9 3.3 4"/>'),
  more: svg('<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>'),
  grip: svg('<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  eyeOff: svg('<path d="M3 3l18 18M10.6 6a8.8 8.8 0 0 1 1.4-.1c6 0 9.5 6.1 9.5 6.1a16 16 0 0 1-3 3.7M6.6 7.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.200-1M9.900 9.900a3 3 0 0 0 4.200 4.200"/>'),
  share: svg('<path d="M12 15V4M8 7.5 12 3.500 16 7.500M5 12v6.500A1.500 1.500 0 0 0 6.500 20h11a1.500 1.500 0 0 0 1.500-1.500V12"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
} as const
