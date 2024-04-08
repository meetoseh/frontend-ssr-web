import { ReactElement } from 'react';
import { SvgRequestedSize, computeSvgSize } from './SvgSize';

const viewbox = { width: 87, height: 84 };

export type BrandmarkProps = {
  size: SvgRequestedSize;
  color: string;
};

/**
 * The brandmark, i.e., the two circles overlaid on each other
 */
export const Brandmark = ({ size, color }: BrandmarkProps): ReactElement => {
  const [cssWidth, cssHeight] = computeSvgSize({ requested: size, viewbox });

  return (
    <svg
      height={cssHeight}
      width={cssWidth}
      viewBox="0 0 87 84"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <path
        d="M32.7207 80C48.7504 80 61.745 67.043 61.745 51.0597C61.745 35.0764 48.7504 22.1194 32.7207 22.1194C16.6909 22.1194 3.69629 35.0764 3.69629 51.0597C3.69629 67.043 16.6909 80 32.7207 80Z"
        stroke={color}
        strokeWidth="6.4"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
      <path
        d="M32.1802 51.3177C25.8023 43.4017 23.929 32.773 27.2741 23.1671C30.6638 13.6946 39.0487 6.57917 48.9055 4.57795C64.605 1.42046 79.9478 11.5155 83.1144 27.1696C86.0581 41.6673 77.5839 56.0762 63.4008 60.5233C62.2412 60.8791 61.037 61.1904 59.8328 61.4128"
        stroke={color}
        strokeWidth="6.4"
        strokeMiterlimit="10"
        strokeLinecap="round"
      />
    </svg>
  );
};
