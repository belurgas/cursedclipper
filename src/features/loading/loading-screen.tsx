import { motion } from "framer-motion"

import { Aurora } from "@/shared/react-bits/aurora"
import { ShinyText } from "@/shared/react-bits/shiny-text"

export function LoadingScreen() {
  return (
    <motion.section
      key="loading-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02, filter: "blur(2px)" }}
      transition={{ duration: 0.9, ease: "easeInOut" }}
      className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[#05070a]"
    >
      <div className="absolute inset-0 opacity-85">
        <Aurora
          amplitude={1.05}
          blend={0.56}
          speed={0.75}
          colorStops={["#808a97", "#cfd4db", "#8c97a8"]}
        />
      </div>
      <div className="aurora-falloff absolute inset-0" />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="relative z-10 text-center"
      >
        <p className="mb-3 text-xs tracking-[0.2em] text-zinc-500 uppercase">
          Cursed Clipper
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 md:text-5xl">
          <ShinyText text="Формируем рабочее пространство" speed={3.6} />
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-zinc-400">
          Инициализируем транскрипцию, семантический индекс и таймлайн клипов.
        </p>
      </motion.div>
    </motion.section>
  )
}
