import type { ReactNode } from 'react'
export const initPro = () => ({})
export const ProShell = ({ children, renderTopbar }: { children: ReactNode; renderTopbar?: (ctx: Record<string, ReactNode>) => ReactNode }) => (
  <div className="flex min-h-dvh flex-col">
    {renderTopbar?.({ proBadge: null, textSizeToggle: <button type="button">Aa</button>, profileMenu: <button type="button">Me</button> })}
    {children}
  </div>
)
export const useProAuth = () => ({ user: { id: 'me', name: 'Max Example' }, loading: false })
