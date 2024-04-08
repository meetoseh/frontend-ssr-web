declare module 'simple-zstd' {
  export function ZSTDCompress(level: number): Transform;
  export function ZSTDDecompress(): Transform;
}
