export const createSerialTaskQueue = () => {
  let tail: Promise<void> = Promise.resolve();

  return <T>(task: () => Promise<T>): Promise<T> => {
    const operation = tail.then(task);
    tail = operation.then(() => undefined, () => undefined);
    return operation;
  };
};
