import { motion } from "framer-motion"
import { BellIcon } from "lucide-react"

import type { NewsItem } from "@/app/types"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type FeedViewProps = {
  title: string
  description: string
  items: NewsItem[]
}

export function FeedView({ title, description, items }: FeedViewProps) {
  return (
    <Card className="glass-panel border-white/12 bg-white/3 backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-base text-zinc-100">{title}</CardTitle>
        <p className="text-sm text-zinc-400">{description}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, index) => (
          <motion.article
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: index * 0.04 }}
            className="rounded-xl border border-white/10 bg-black/24 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <Badge variant="outline" className="border-white/20 text-zinc-300">
                {item.label}
              </Badge>
              <span className="text-[11px] text-zinc-500">{item.timestamp}</span>
            </div>
            <p className="text-sm leading-relaxed text-zinc-200">{item.title}</p>
          </motion.article>
        ))}

        {items.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/24 p-6 text-center text-sm text-zinc-500">
            <BellIcon className="mx-auto mb-2 size-4" />
            Пока нет записей.
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
