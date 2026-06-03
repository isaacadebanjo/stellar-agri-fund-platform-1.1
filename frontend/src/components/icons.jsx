import React from 'react';

// Shared inline SVG icon set. Extracted from App.jsx so the shell stays
// focused on layout/navigation and these are reusable across components.
function IconBase({ children, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

export function IconHome(p)      { return <IconBase {...p}><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></IconBase>; }
export function IconUser(p)      { return <IconBase {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></IconBase>; }
export function IconUsers(p)     { return <IconBase {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-3.5 3.5-5.5 7-5.5s6 2 7 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M22 18c-.7-2-2-3.2-4-3.7"/></IconBase>; }
export function IconLeaf(p)      { return <IconBase {...p}><path d="M5 19c0-9 7-14 16-14-1 9-6 14-14 14"/><path d="M5 19c2-3 5-5 9-6"/></IconBase>; }
export function IconTractor(p)   { return <IconBase {...p}><circle cx="6" cy="17" r="3"/><circle cx="18" cy="18" r="2.5"/><path d="M3 14V8h6l2 4h4V8h4v6"/></IconBase>; }
export function IconArrowDown(p) { return <IconBase {...p}><path d="M12 4v14"/><path d="M6 14l6 6 6-6"/></IconBase>; }
export function IconArrowUp(p)   { return <IconBase {...p}><path d="M12 20V6"/><path d="M6 12l6-6 6 6"/></IconBase>; }
export function IconList(p)      { return <IconBase {...p}><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></IconBase>; }
export function IconShare(p)     { return <IconBase {...p}><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8 15.8 7.2M8.2 13.2l7.6 3.6"/></IconBase>; }
export function IconReport(p)    { return <IconBase {...p}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 14v3M12 10v7M16 7v10"/></IconBase>; }
export function IconRefresh(p)   { return <IconBase {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 4v4h-4"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 20v-4h4"/></IconBase>; }
export function IconMenu(p)      { return <IconBase {...p}><path d="M4 6h16M4 12h16M4 18h16"/></IconBase>; }
export function IconLogout(p)    { return <IconBase {...p}><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H10"/></IconBase>; }
export function IconAudit(p)     { return <IconBase {...p}><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4"/><path d="M8 9h8M8 13h8M8 17h4"/></IconBase>; }
export function IconVault(p)     { return <IconBase {...p}><rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="12" cy="13" r="2.5"/><path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/></IconBase>; }
export function IconWallet(p)     { return <IconBase {...p}><path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1"/><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M16 12.5h.01"/><path d="M21 11h-4a1.5 1.5 0 0 0 0 3h4"/></IconBase>; }
export function IconBell(p)        { return <IconBase {...p}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10.5 19a1.5 1.5 0 0 0 3 0"/></IconBase>; }
