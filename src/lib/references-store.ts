// =============================================================================
// Centralized References Store (per-case keyed)
// Single source-of-truth for user-selected KB/practice references across the app.
// Uses React 18 useSyncExternalStore for zero-dependency reactivity.
// =============================================================================

import { useSyncExternalStore, useCallback } from "react";

const SEPARATOR = "\n\n---\n\n";

type Listener = () => void;

/** Internal state: caseId → referencesText */
let _store: Record<string, string> = {};
let _version = 0; // bumped on every mutation for snapshot identity
const _listeners = new Set<Listener>();

function _emit() {
  _version++;
  for (const fn of _listeners) fn();
}

function _subscribe(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function _getSnapshot(): Record<string, string> {
  return _store;
}

// ─── Public API ────────────────────────────────────────────────

/** Get references text for a specific case. Returns "" if none. */
export function getReferencesText(caseId: string): string {
  return _store[caseId] ?? "";
}

/** Replace references text for a specific case. */
export function setReferencesText(caseId: string, text: string): void {
  if ((_store[caseId] ?? "") !== text) {
    _store = { ..._store, [caseId]: text };
    _emit();
  }
}

/** Append a single reference block to a specific case using the standard separator. */
export function appendReferenceBlock(caseId: string, block: string): void {
  if (!block.trim()) return;
  const current = _store[caseId] ?? "";
  const next = current ? current + SEPARATOR + block : block;
  _store = { ..._store, [caseId]: next };
  _emit();
}

/** Clear references for a specific case. */
export function clearReferences(caseId: string): void {
  if (_store[caseId]) {
    const next = { ..._store };
    delete next[caseId];
    _store = next;
    _emit();
  }
}

/** Clear references for ALL cases (e.g. on logout). */
export function clearAllReferences(): void {
  if (Object.keys(_store).length > 0) {
    _store = {};
    _emit();
  }
}

// ─── React hook ────────────────────────────────────────────────

/** Subscribe to the references store for a specific caseId. */
export function useReferencesText(caseId: string | undefined): string {
  const snap = useSyncExternalStore(_subscribe, _getSnapshot, _getSnapshot);
  return caseId ? (snap[caseId] ?? "") : "";
}
