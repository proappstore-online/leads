import type { ReactNode } from 'react'
export const initPro = () => ({})
export const ProShell = ({ children, renderTopbar }: { children: ReactNode; renderTopbar?: (ctx: Record<string, ReactNode>) => ReactNode }) => (
  <div className="flex min-h-dvh flex-col">
    {/* The same inline sizes as the SDK's own controls, so qa:mobile checks the 44px override. */}
    {renderTopbar?.({ proBadge: null, textSizeToggle: <button type="button" style={{ width: 36, height: 36 }}>Aa</button>, profileMenu: <button type="button" style={{ width: 32, height: 32, display: 'block', padding: 0 }}>Me</button> })}
    {children}
  </div>
)
export const useProAuth = () => ({ user: { id: 'me', name: 'Max Example' }, loading: false })
