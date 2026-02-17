import { AppShell } from "@/app/app-shell"
import { AppToastProvider } from "@/shared/ui/app-toast-provider"

export function App() {
  return (
    <AppToastProvider>
      <AppShell />
    </AppToastProvider>
  )
}

export default App
