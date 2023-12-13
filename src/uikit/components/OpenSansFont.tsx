import * as React from 'react';

const srcWoff2ByWeight: Record<number, string> = {
  300: 'https://fonts.gstatic.com/s/opensans/v35/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsiH0B4gaVI.woff2',
  400: 'https://fonts.gstatic.com/s/opensans/v35/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0B4gaVI.woff2',
  500: 'https://fonts.gstatic.com/s/opensans/v35/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjr0B4gaVI.woff2',
  600: 'https://fonts.gstatic.com/s/opensans/v35/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsgH1x4gaVI.woff2',
  700: 'https://fonts.gstatic.com/s/opensans/v35/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsg-1x4gaVI.woff2',
};

const italicSrcWoff2ByWeight: Record<number, string> = {
  300: 'https://fonts.gstatic.com/s/opensans/v35/memQYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWq8tWZ0Pw86hd0Rk5hkWVAewA.woff2',
  400: 'https://fonts.gstatic.com/s/opensans/v35/memQYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWq8tWZ0Pw86hd0Rk8ZkWVAewA.woff2',
  500: 'https://fonts.gstatic.com/s/opensans/v35/memQYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWq8tWZ0Pw86hd0Rk_RkWVAewA.woff2',
  600: 'https://fonts.gstatic.com/s/opensans/v35/memQYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWq8tWZ0Pw86hd0RkxhjWVAewA.woff2',
  700: 'https://fonts.gstatic.com/s/opensans/v35/memQYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWq8tWZ0Pw86hd0RkyFjWVAewA.woff2',
};

/**
 * Constructs the appropriate style tag to include the Open Sans font in
 * an email. This is used over the Font built-in in order to avoid
 * setting the default font weight and to support multiple weights.
 */
export const OpenSansFont = ({
  weights,
  italicWeights,
}: {
  weights: number[];
  italicWeights?: number[];
}) => {
  const fontFaces = weights.map((weight) => {
    return `
    @font-face {
      font-family: 'Open Sans';
      font-style: normal;
      font-weight: ${weight};
      mso-font-alt: 'Arial';
      font-stretch: 100%;
      font-display: swap;
      src: url(${srcWoff2ByWeight[weight]}) format('woff2');
    }
    `;
  });

  if (italicWeights) {
    fontFaces.push(
      ...italicWeights.map((weight) => {
        return `
        @font-face {
          font-family: 'Open Sans';
          font-style: italic;
          font-weight: ${weight};
          mso-font-alt: 'Arial';
          font-stretch: 100%;
          font-display: swap;
          src: url(${italicSrcWoff2ByWeight[weight]}) format('woff2');
        }
        `;
      })
    );
  }

  const defaultFontFamily = `
  * {
    font-family: 'Open Sans', -apple-system, -webkit-system-font, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  }
  `;

  const style = `${fontFaces.join('\n')}\n${defaultFontFamily}`;

  return <style dangerouslySetInnerHTML={{ __html: style }} />;
};
