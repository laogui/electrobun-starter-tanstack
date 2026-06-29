export function formatFileSize(size: number | undefined): string {
  if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) {
    return 'Unknown size';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'] as const;
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function formatDuration(duration: number | undefined): string | null {
  if (
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return null;
  }

  const totalSeconds = Math.round(duration);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
