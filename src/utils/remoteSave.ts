export type RemoteSaveResult = 'saved' | 'reload-required';

export type RemoteSaveAttemptStatus = 'unchanged' | 'saved' | 'reload-required' | 'failed';

export type RemoteSaveAttempt = {
  status: RemoteSaveAttemptStatus;
  savedJson: string;
  error?: Error;
};

export const persistRemoteSnapshot = async <T>({
  snapshot,
  lastSavedJson,
  save,
}: {
  snapshot: T;
  lastSavedJson: string;
  save: (snapshot: T) => Promise<RemoteSaveResult>;
}): Promise<RemoteSaveAttempt> => {
  const snapshotJson = JSON.stringify(snapshot);

  if (snapshotJson === lastSavedJson) {
    return { status: 'unchanged', savedJson: lastSavedJson };
  }

  try {
    const result = await save(snapshot);
    if (result !== 'saved') {
      return { status: 'reload-required', savedJson: lastSavedJson };
    }

    return { status: 'saved', savedJson: snapshotJson };
  } catch (error) {
    return {
      status: 'failed',
      savedJson: lastSavedJson,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
};
