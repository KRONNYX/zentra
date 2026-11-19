import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function errorMessage(err: unknown, fallback = "Something went wrong.") {
  return err instanceof Error && err.message ? err.message : fallback
}
