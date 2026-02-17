import { BellIcon, LogOutIcon, ShieldCheckIcon, UserCircle2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type AccountViewProps = {
  onLogout: () => void
}

export function AccountView({ onLogout }: AccountViewProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="glass-panel border-white/12 bg-white/3 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <UserCircle2Icon className="size-4 text-zinc-300" />
            Профиль аккаунта
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/24 p-3">
            <p className="text-sm font-medium text-zinc-100">Kali Forge</p>
            <p className="mt-0.5 text-xs text-zinc-400">Руководитель креативных операций</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge className="bg-zinc-100/12 text-zinc-200">Профессиональный</Badge>
              <Badge variant="outline" className="border-white/20 text-zinc-300">
                Команда: 7
              </Badge>
            </div>
          </div>

          <div className="grid gap-2 text-sm">
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-zinc-400">Эл. почта</p>
              <p className="text-zinc-200">kali@clipforge.ai</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-zinc-400">Часовой пояс</p>
              <p className="text-zinc-200">Europe/Moscow</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-white/12 bg-white/3 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <ShieldCheckIcon className="size-4 text-zinc-300" />
            Настройки и безопасность
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-black/24 p-3">
            <p className="text-sm text-zinc-100">Двухфакторная защита</p>
            <p className="mt-1 text-xs text-zinc-400">Включена. Последняя проверка: сегодня.</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/24 p-3">
            <p className="text-sm text-zinc-100">Уведомления</p>
            <p className="mt-1 text-xs text-zinc-400">
              Получать оповещения о новых релизах ИИ-инструментов.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 border-white/15 bg-transparent text-zinc-200 hover:bg-white/10"
            >
              <BellIcon className="size-3.5" />
              Управлять уведомлениями
            </Button>
          </div>

          <Button
            className="w-full bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
            onClick={onLogout}
          >
            <LogOutIcon className="size-4" />
            Выйти из аккаунта
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
