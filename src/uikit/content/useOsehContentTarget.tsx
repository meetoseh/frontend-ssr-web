import { ReactElement, isValidElement, useEffect, useMemo, useState } from 'react';
import { OsehContentProps } from './OsehContentProps';
import { ContentFileWebExport, OsehContentTarget } from './OsehContentTarget';
import { HTTP_API_URL } from '../ApiConstants';
import { describeError } from '../components/ErrorBlock';

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
  comparer,
}: OsehContentProps): OsehContentTarget => {
  const [webExport, setWebExport] = useState<ContentFileWebExport | null>(null);
  const [error, setError] = useState<ReactElement | null>(null);

  useEffect(() => {
    let active = true;
    fetchWebExportWrapper();
    return () => {
      active = false;
    };

    async function fetchWebExportWrapper() {
      setError(null);
      if (uid === null || jwt === null) {
        setWebExport(null);
        return;
      }

      try {
        const webExport = await fetchWebExport(uid, jwt, presign, comparer);
        if (!active) {
          return;
        }
        setWebExport(webExport);
      } catch (e) {
        if (!active) {
          return;
        }

        if (isValidElement(e)) {
          setError(e as ReactElement);
          return;
        }
        const err = await describeError(e);
        if (!active) {
          return;
        }
        setError(err);
      }
    }
  }, [uid, jwt, presign, comparer]);

  return useMemo<OsehContentTarget>(() => {
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
      throw new Error('this is impossible: webExport is null, error is neither null nor non-null');
    }

    return {
      state: 'loaded',
      error: null,
      webExport,
      presigned: presign,
      jwt,
    };
  }, [jwt, presign, webExport, error]);
};

/**
 * Fetches the best web export for a content file with the given uid and jwt,
 * presigning as requested.
 */
export const fetchWebExport = async (
  uid: string,
  jwt: string,
  presign: boolean,
  comparer?: (a: ContentFileWebExport, b: ContentFileWebExport) => number,
  signal?: AbortSignal
): Promise<ContentFileWebExport> => {
  const realComparer =
    comparer ?? ((a: ContentFileWebExport, b: ContentFileWebExport) => b.bandwidth - a.bandwidth);

  const response = await fetch(
    `${HTTP_API_URL}/api/1/content_files/${uid}/web.json?${new URLSearchParams({
      presign: presign ? '1' : '0',
    })}`,
    {
      method: 'GET',
      headers: {
        Authorization: `bearer ${jwt}`,
      },
      signal,
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
      format_parameters: any;
    }[];
    duration_seconds: number;
  } = await response.json();

  let bestExport: ContentFileWebExport | null = null;
  for (const exportData of data.exports) {
    if (exportData.format !== 'mp4') {
      continue;
    }

    const option: ContentFileWebExport = {
      url: exportData.url,
      format: exportData.format,
      bandwidth: exportData.bandwidth,
      codecs: exportData.codecs,
      fileSize: exportData.file_size,
      qualityParameters: exportData.quality_parameters,
      formatParameters: exportData.format_parameters,
    };

    if (bestExport === null || realComparer(bestExport, option) > 0) {
      bestExport = option;
    }
  }

  if (bestExport === null) {
    return Promise.reject(
      <>No suitable export found for this audio file. Please contact the site administrator.</>
    );
  }

  return bestExport;
};
