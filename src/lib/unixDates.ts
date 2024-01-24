type UnixDate = number;
type UnixMilliseconds = number;
type TimeZone = string;

/**
 * Converts from a given unix time, specified as milliseconds since the unix
 * epoch, to a unix date, specified as the number of days that have elapsed
 * since the unix epoch in the given timezone.
 *
 * Specifically, a unix date is defined such that if you convert the value
 * into a date, and then find midnight in that date in UTC in seconds since the
 * unix epoch, then divide by 86400 and floor, you will get the unix date.
 *
 * So, e.g., Jan 1st, 1970 has unix date 0, Jan 2nd, 1970 has unix date 1, etc.
 *
 * Note that converting a unix time in milliseconds to a date is the part that
 * requires a timezone, not the date to unix date conversion.
 *
 * @param unixTime
 * @param param1
 */
export const unixTimestampToUnixDate = (
  unixTime: UnixMilliseconds,
  { tz }: { tz: TimeZone }
): UnixDate => {
  const asNaiveDate = new Date(unixTime);
  const asDateString = asNaiveDate.toLocaleDateString('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const [monthNumericStr, dayNumericStr, yearNumericStr] = asDateString.split('/');
  const month1To12 = parseInt(monthNumericStr, 10);
  const day1To31 = parseInt(dayNumericStr, 10);
  const year = parseInt(yearNumericStr, 10);

  const midnightThatDate: UnixMilliseconds = Date.UTC(year, month1To12 - 1, day1To31);
  const res = midnightThatDate / 86_400_000;
  if (!Number.isInteger(res)) {
    console.warn(
      `Unix millis ${unixTime} converted to non-integer unix date ${res}; result may be incorrect`
    );
    return Math.floor(res);
  }
  return res;
};
