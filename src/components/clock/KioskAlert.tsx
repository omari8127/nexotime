import { motion } from 'framer-motion'
import { TriangleAlert } from 'lucide-react'

/**
 * A mistake at the kiosk (unknown code, wrong PIN…): large, with an icon and a short shake so it is
 * noticed from a step away. It replaces small text and corner toasts that people did not see.
 */
export function KioskAlert({ message, shakeKey }: { message: string; shakeKey?: number | string }) {
  return (
    <motion.div
      key={shakeKey}
      role="alert"
      initial={{ x: 0, opacity: 0.6 }}
      animate={{ x: [0, -8, 8, -5, 5, 0], opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex w-full items-center gap-3.5 rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3.5 text-left"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white shadow-md shadow-rose-500/30">
        <TriangleAlert className="h-6 w-6" strokeWidth={2.4} />
      </span>
      <p className="text-base font-semibold leading-snug text-rose-900 md:text-lg">{message}</p>
    </motion.div>
  )
}
