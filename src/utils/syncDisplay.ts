// A queued debounce is not proof that the current calendar has been saved.
// Make the UI reflect unsaved edits immediately, regardless of the save timer.
export type RemoteSyncStatus = 'saved' | 'saving' | 'offline' | 'failed' | 'reload-required';

export const getDisplayedSyncStatus = (
  status: RemoteSyncStatus,
  hasPendingLocalChanges: boolean,
): RemoteSyncStatus | 'pending' =>
  status === 'saved' && hasPendingLocalChanges ? 'pending' : status;
