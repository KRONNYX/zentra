"use client";

const activeBarStorageKey = "zentra.activeBarId";
export const activeBarChangedEvent = "zentra-active-bar-changed";

export function getSelectedBarId() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(activeBarStorageKey) ?? "";
}

export function setSelectedBarId(barId: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (barId) {
    window.localStorage.setItem(activeBarStorageKey, barId);
  } else {
    window.localStorage.removeItem(activeBarStorageKey);
  }

  window.dispatchEvent(new CustomEvent(activeBarChangedEvent, { detail: barId }));
}
