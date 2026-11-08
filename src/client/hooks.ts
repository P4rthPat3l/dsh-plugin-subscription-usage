import { useEffect, useState } from 'react'

/** The current time, re-read every `intervalMs`, so countdowns advance without a fetch. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => { setNow(Date.now()) }, intervalMs)
    return () => { clearInterval(timer) }
  }, [intervalMs])
  return now
}
