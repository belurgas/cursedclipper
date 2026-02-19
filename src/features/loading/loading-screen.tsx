import { motion } from "framer-motion"
import { useTranslation } from "react-i18next"

import { ShinyText } from "@/shared/react-bits/shiny-text"

export function LoadingScreen() {
  const { t } = useTranslation()
  return (
    <section
      className="relative isolate flex h-full min-h-0 items-center justify-center overflow-hidden bg-[#05070a]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(188,201,220,0.08),transparent_34%),radial-gradient(circle_at_82%_16%,rgba(156,171,195,0.08),transparent_30%),linear-gradient(180deg,rgba(7,9,13,1),rgba(5,7,10,1))]" />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-[8%] -top-[22%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(208,219,236,0.28)_0%,rgba(208,219,236,0.1)_34%,transparent_72%)] blur-[74px]"
        animate={{
          x: [0, 74, -24, 0],
          y: [0, 36, -14, 0],
          scale: [1, 1.14, 0.94, 1],
          opacity: [0.34, 0.55, 0.28, 0.34],
        }}
        transition={{
          duration: 14,
          repeat: Infinity,
          repeatType: "mirror",
          ease: "easeInOut",
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-[10%] -top-[24%] h-[390px] w-[390px] rounded-full bg-[radial-gradient(circle,rgba(176,191,214,0.24)_0%,rgba(176,191,214,0.09)_36%,transparent_74%)] blur-[72px]"
        animate={{
          x: [0, -66, 18, 0],
          y: [0, 42, -18, 0],
          scale: [1, 1.1, 0.95, 1],
          opacity: [0.26, 0.46, 0.24, 0.26],
        }}
        transition={{
          duration: 16,
          repeat: Infinity,
          repeatType: "mirror",
          ease: "easeInOut",
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-14%] bottom-[-26%] h-[360px] bg-[radial-gradient(ellipse_at_center,rgba(124,141,170,0.2)_0%,rgba(124,141,170,0.08)_42%,transparent_72%)] blur-[70px]"
        animate={{
          y: [0, -26, 0],
          scaleX: [1, 1.06, 1],
          opacity: [0.22, 0.36, 0.22],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_24%,rgba(225,233,245,0.06)_50%,transparent_76%)]"
        animate={{ x: ["-32%", "26%", "-32%"], opacity: [0.16, 0.32, 0.16] }}
        transition={{
          duration: 11.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <div className="relative z-10 text-center">
        <p className="mb-3 text-xs tracking-[0.2em] text-zinc-500 uppercase">
          Cursed Clipper
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 md:text-5xl">
          <ShinyText text={t("loading.workspaceInitTitle")} speed={3.6} />
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-zinc-400">
          {t("loading.workspaceInitDescription")}
        </p>
      </div>
    </section>
  )
}
