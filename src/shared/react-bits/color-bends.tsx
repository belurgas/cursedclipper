import { motion } from "framer-motion"

type ColorBendsProps = {
  rotation?: number
  autoRotate?: number
  speed?: number
  scale?: number
  className?: string
}

const toDuration = (speed: number) => Math.max(10, 22 / Math.max(speed, 0.15))

export function ColorBends({
  rotation = 68,
  autoRotate = -4,
  speed = 0.61,
  scale = 3.1,
  className,
}: ColorBendsProps) {
  const duration = toDuration(speed)

  return (
    <div
      className={className}
      style={{ transform: `rotate(${rotation}deg) scale(${scale})`, transformOrigin: "50% 50%" }}
    >
      <motion.div
        className="absolute inset-[-28%] rounded-[42%] bg-[radial-gradient(circle,rgba(222,230,242,0.16)_0%,rgba(138,151,176,0.12)_38%,rgba(12,15,20,0)_74%)] blur-3xl"
        animate={{
          rotate: [0, autoRotate * 5, 0],
          x: [0, 16, -12, 0],
          y: [0, -12, 14, 0],
        }}
        transition={{ duration, ease: "easeInOut", repeat: Infinity }}
      />
      <motion.div
        className="absolute inset-[-34%] rounded-[46%] bg-[radial-gradient(circle,rgba(198,210,226,0.14)_0%,rgba(99,112,136,0.12)_36%,rgba(10,12,16,0)_72%)] blur-[72px]"
        animate={{
          rotate: [0, autoRotate * -7, 0],
          x: [0, -20, 10, 0],
          y: [0, 14, -10, 0],
        }}
        transition={{ duration: duration * 1.08, ease: "easeInOut", repeat: Infinity }}
      />
      <motion.div
        className="absolute inset-[-38%] rounded-[50%] bg-[radial-gradient(circle,rgba(232,238,248,0.14)_0%,rgba(122,136,162,0.1)_40%,rgba(8,10,14,0)_76%)] blur-[86px]"
        animate={{
          rotate: [0, autoRotate * 4, 0],
          x: [0, 8, -8, 0],
          y: [0, 10, -12, 0],
        }}
        transition={{ duration: duration * 0.92, ease: "easeInOut", repeat: Infinity }}
      />
    </div>
  )
}
