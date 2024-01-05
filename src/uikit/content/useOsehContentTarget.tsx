import { ReactElement, useCallback, useEffect } from 'react';
import { OsehContentProps } from './OsehContentProps';
import { ContentFileWebExport, OsehContentTarget } from './OsehContentTarget';
import { HTTP_API_URL } from '../ApiConstants';
import { describeError } from '../components/ErrorBlock';
import { ValueWithCallbacks, useWritableValueWithCallbacks } from '../lib/Callbacks';
import { setVWC } from '../lib/setVWC';
import { useMappedValuesWithCallbacks } from '../hooks/useMappedValuesWithCallbacks';

/**
 * A hook for getting the target to download for an Oseh content file. On the
 * web simple mp4s are used and hence this downloads a json file in a custom
 * format which lists all the available targets, then selects one. On native
 * apps the m3u8 format is used which comes with bandwidth selection and hence
 * this is essentially a no-op.
 */
export const useOsehContentTarget = ({
  uid,
  jwt,
  presign = true,
}: OsehContentProps): ValueWithCallbacks<OsehContentTarget> => {
  const webExportVWC = useWritableValueWithCallbacks<ContentFileWebExport | null>(() => null);
  const errorVWC = useWritableValueWithCallbacks<ReactElement | null>(() => null);

  useEffect(() => {
    if (window === undefined) {
      return;
    }

    let active = true;
    fetchWebExportWrapper();
    return () => {
      active = false;
    };

    async function fetchWebExportWrapper() {
      setVWC(errorVWC, null);
      if (uid === null || jwt === null) {
        setVWC(webExportVWC, null);
        return;
      }

      try {
        const webExport = await fetchWebExport(uid, jwt, presign);
        if (!active) {
          return;
        }
        setVWC(webExportVWC, webExport);
      } catch (e) {
        setVWC(errorVWC, e as ReactElement);
      }
    }
  }, [uid, jwt, presign]);

  return useMappedValuesWithCallbacks(
    [webExportVWC, errorVWC],
    useCallback(() => {
      const webExport = webExportVWC.get();
      const error = errorVWC.get();
      if (jwt === null || (webExport === null && error === null)) {
        return {
          state: 'loading',
          error: null,
          webExport: null,
          presigned: null,
          jwt: null,
        };
      }

      if (error !== null) {
        return {
          state: 'failed',
          error,
          webExport: null,
          presigned: null,
          jwt: null,
        };
      }

      if (webExport === null) {
        throw new Error(
          'this is impossible: webExport is null, error is neither null nor non-null'
        );
      }

      return {
        state: 'loaded',
        error: null,
        webExport,
        presigned: presign,
        jwt,
      };
    }, [jwt, presign, webExportVWC, errorVWC])
  );
};

/**
 * Fetches the best web export for a content file with the given uid and jwt,
 * presigning as requested.
 *
 * If this rejects, the rejection will be a ReactElement describing the error.
 */
export const fetchWebExport = async (
  uid: string,
  jwt: string,
  presign: boolean
): Promise<ContentFileWebExport> => {
  try {
    const response = await fetch(
      `${HTTP_API_URL}/api/1/content_files/${uid}/web.json?${new URLSearchParams({
        presign: presign ? '1' : '0',
      })}`,
      {
        method: 'GET',
        headers: {
          Authorization: `bearer ${jwt}`,
        },
      }
    );
    if (!response.ok) {
      throw response;
    }
    const data: {
      exports: {
        url: string;
        format: string;
        bandwidth: number;
        codecs: string[];
        file_size: number;
        quality_parameters: any;
      }[];
      duration_seconds: number;
    } = await response.json();

    let bestExport: ContentFileWebExport | null = null;
    let bestBandwidth = 0;
    for (const exportData of data.exports) {
      if (exportData.format !== 'mp4') {
        continue;
      }
      if (exportData.bandwidth > bestBandwidth) {
        bestExport = {
          url: exportData.url,
          format: exportData.format,
          bandwidth: exportData.bandwidth,
          codecs: exportData.codecs as Array<'aac'>,
          fileSize: exportData.file_size,
          qualityParameters: exportData.quality_parameters,
        };
        bestBandwidth = exportData.bandwidth;
      }
    }

    if (bestExport === null) {
      throw (
        <>No suitable export found for this audio file. Please contact the site administrator.</>
      );
    }

    return bestExport;
  } catch (e) {
    throw await describeError(e);
  }
};
