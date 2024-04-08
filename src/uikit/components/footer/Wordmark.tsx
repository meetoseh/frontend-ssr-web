import { ReactElement } from 'react';
import { SvgRequestedSize, computeSvgSize } from './SvgSize';

const viewbox = { width: 941.22, height: 219.65 };

export type WordmarkProps = {
  size: SvgRequestedSize;
  color: string;
};

/**
 * The wordmark, i.e., the "OSEH" text.
 */
export const Wordmark = ({ size, color }: WordmarkProps): ReactElement => {
  const [cssWidth, cssHeight] = computeSvgSize({ requested: size, viewbox });

  return (
    <svg
      height={cssHeight}
      width={cssWidth}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 941.22 219.65"
      fill={color}>
      <path d="M0,109.82C0,47.02,47.95,0,112.6,0s112.6,46.71,112.6,109.82-48.26,109.82-112.6,109.82S0,172.61,0,109.82Zm209.11,0c0-54.75-41.45-95.28-96.51-95.28S15.78,55.06,15.78,109.82s41.45,95.28,96.82,95.28,96.51-40.52,96.51-95.28Z" />
      <path d="M288.19,190.25l7.11-11.75c14.85,15.47,42.38,27.22,71.46,27.22,43.31,0,62.49-18.87,62.49-42.38,0-64.96-135.18-25.98-135.18-105.79C294.07,26.93,317.58,0,370.79,0c23.82,0,48.57,7.42,65.27,19.49l-5.88,12.68c-17.94-12.37-39.91-18.25-59.39-18.25-42.07,0-60.94,19.49-60.94,43.31,0,64.96,135.18,26.6,135.18,105.18,0,30.62-24.44,57.23-77.95,57.23-32.17,0-63.11-12.06-78.88-29.39h0Z" />
      <rect x="526.38" width="142.65" height="14.23" />
      <rect x="527.66" y="101.01" width="142.65" height="14.23" />
      <rect x="527.66" y="205.4" width="142.65" height="14.23" />
      <path d="M941.22,0V219.63h-15.78V115.15h-144.77v104.48h-15.78V0h15.78V101.03h144.77V0h15.78Z" />
    </svg>
  );
};
