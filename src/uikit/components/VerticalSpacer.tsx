import { ReactElement } from 'react';

/**
 * A basic vertical spacer. Uses padding instead of just height to
 * avoid being compressed in some situations.
 */
export const VerticalSpacer = ({
  height,
  maxHeight,
  flexBasis,
  flexGrow,
}: {
  height: number;
  maxHeight?: number;
  flexBasis?: number;
  flexGrow?: number;
}): ReactElement =>
  height === 0 && flexGrow === undefined ? (
    <></>
  ) : (
    <div
      style={{
        height: `${height}px`,
        paddingTop: `${height}px`,
        ...(maxHeight !== undefined ? { maxHeight: `${maxHeight}px` } : {}),
        ...(flexGrow !== undefined ? { flexGrow: `${flexGrow}` } : {}),
        ...(flexBasis !== undefined ? { flexBasis: `${flexBasis}px` } : {}),
      }}
    />
  );
