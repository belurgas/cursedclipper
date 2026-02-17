export const workspaceMotion = {
  page: { duration: 0.36, ease: "easeOut" as const },
  modeSwitch: { duration: 0.24, ease: "easeOut" as const },
  contextSwitch: { duration: 0.22, ease: "easeOut" as const },
  railSpring: { type: "spring" as const, stiffness: 360, damping: 30 },
}
