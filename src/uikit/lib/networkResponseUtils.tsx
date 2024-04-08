import { ReactElement } from 'react';

/**
 * Formats the given duration as HH:MM:SS.mmm
 * @param seconds The duration in seconds
 * @param opts Options to customize the formatting
 */
export const formatDurationClock = (
  seconds: number,
  opts: {
    /**
     * True to always include hours, false to never include hours,
     * undefined to include hours based on if there are any and
     * includeLeadingZeroParts
     */
    hours?: boolean;
    minutes?: boolean;
    seconds?: boolean;
    milliseconds?: boolean;
    /**
     * True to always include the largest parts, false or undefined
     * to omit leading zero parts. For example, 00:01:02.345 would
     * become 01:02.345 if this is true
     */
    includeLeadingZeroParts?: boolean;
    /**
     * True to always include leading zeroes on the first part, false
     * or undefined to omit leading zeroes on the first part. For example,
     * 01:02:03.456 would become 1:02:03.456 if this is false or undefined
     */
    includeLeadingZeroOnFirstPart?: boolean;
  }
): ReactElement => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds - hours * 3600) / 60);
  const remainingSeconds = Math.floor(seconds - hours * 3600 - minutes * 60);
  const milliseconds = Math.round((seconds - Math.floor(seconds)) * 1000);

  const includeHours = opts.hours ?? (opts.includeLeadingZeroParts || hours > 0);
  const includeMinutes =
    opts.minutes ?? (includeHours || opts.includeLeadingZeroParts || minutes > 0);
  const includeSeconds =
    opts.seconds ?? (includeMinutes || opts.includeLeadingZeroParts || remainingSeconds > 0);
  const includeMilliseconds = opts.milliseconds ?? milliseconds > 0;

  const parts: string[] = [];

  const formatWithLeading = (value: number) =>
    parts.length !== 0 || opts.includeLeadingZeroParts
      ? value.toString().padStart(2, '0')
      : value.toString();

  if (includeHours) {
    parts.push(formatWithLeading(hours));
  }
  if (includeMinutes) {
    parts.push(formatWithLeading(minutes));
  }
  if (includeSeconds) {
    parts.push(formatWithLeading(remainingSeconds));
  }
  if (parts.length === 0) {
    parts.push('0');
  }
  const result = parts.join(':');
  if (includeMilliseconds) {
    return (
      <>
        {result}.{milliseconds.toString().padStart(3, '0')}
      </>
    );
  }
  return <>{result}</>;
};
