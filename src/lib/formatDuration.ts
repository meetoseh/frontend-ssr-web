/**
 * Formats the given duration in milliseconds to a human-readable string.
 */
export const formatDuration = (ms: number): string => {
  if (ms > 1000 * 60 * 60) {
    const hours = Math.floor(ms / 1000 / 60 / 60);
    const minutes = Math.floor(ms / 1000 / 60) % 60;
    return `${hours}h ${minutes}m`;
  }

  if (ms > 60 * 1000) {
    const minutes = Math.floor(ms / 1000 / 60) % 60;
    const seconds = Math.floor(ms / 1000) % 60;
    return `${minutes}m ${seconds}s`;
  }

  if (ms > 1000) {
    return (ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 }) + 's';
  }

  return ms.toLocaleString(undefined, { maximumFractionDigits: 3 }) + 'ms';
};
