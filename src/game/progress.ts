export interface CampaignProgress { level0Complete: boolean }
export interface ProgressStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const KEY = 'the-last-ark.progress.v1';
export function loadProgress(storage: ProgressStorage): CampaignProgress {
  try { const data = JSON.parse(storage.getItem(KEY) ?? '{}'); return { level0Complete: data?.version === 1 && data.level0Complete === true }; }
  catch { return { level0Complete: false }; }
}
export function storeProgress(storage: ProgressStorage, progress: CampaignProgress): void {
  try { storage.setItem(KEY, JSON.stringify({ version: 1, level0Complete: progress.level0Complete })); } catch { /* Play remains possible when storage is disabled. */ }
}
