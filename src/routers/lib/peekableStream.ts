/**
 * Indicates there is not enough data for the requested operation.
 */
export class BufferUnderflowError extends Error {
  constructor() {
    super('buffer underflow');
  }
}

export type PeekableScanner = (
  buf: Buffer,
  isEof: boolean
) => number | null | { minOverlapOnNext: number };

/**
 * A basic synchronous stream, except that callers can peek at data without
 * consuming it from the stream, such that the data will be returned in a future
 * call to read().
 *
 * This is essentially a thin wrapper around a buffer in most cases, as for
 * parsing it's almost always better to parse logical blocks in memory in order,
 * e.g., one file at a time (if there are multiple files). The overhead from using
 * promises for parsing would exceed the actual parsing time in most cases, as
 * parsing will very, very often go 1 byte at a time.
 */
export interface PeekableStream {
  /**
   * Reads up to the given number of bytes, advances the stream by the same
   * amount, and returns them. If there are fewer than the given number of
   * bytes remaining, then the remaining bytes are returned. If the end has
   * already been read, returns an empty buffer.
   *
   * This is guarranteed to returned `maxSize` bytes if there are at least
   * `maxSize` bytes remaining.
   *
   * @param maxSize The maximum number of bytes to read
   * @returns The bytes read
   */
  read: (maxSize: number) => Buffer;

  /**
   * Reads exactly the given number of bytes and returns them. If there are
   * fewer than the given number of bytes remaining, throws an error.
   *
   * @param size The number of bytes to read
   * @returns The bytes read
   * @throws BufferUnderflowError if there are fewer than `size` bytes remaining
   */
  readExactly: (size: number) => Buffer;

  /**
   * Skips exactly the given number of bytes. If there are fewer than the given
   * number of bytes remaining, throws an error.
   *
   * @param size The number of bytes to skip
   * @throws BufferUnderflowError if there are fewer than `size` bytes remaining
   */
  advance: (size: number) => void;

  /**
   * Reads up to the given number of bytes and returns them, without advancing
   * the stream. If there are fewer than the given number of bytes remaining,
   * then the remaining bytes are returned. If the end has already been peeked,
   * returns an empty buffer.
   *
   * Calling peek multiple times in a row with the same value leads to the same
   * result.
   *
   * This is guarranteed to returned `maxSize` bytes if there are at least
   * `maxSize` bytes remaining.
   *
   * @param maxSize The maximum number of bytes to read
   * @returns The bytes read
   */
  peek: (maxSize: number) => Buffer;

  /**
   * Reads exactly the given number of bytes and returns them, without advancing
   * the stream. If there are fewer than the given number of bytes remaining,
   * throws an error.
   *
   * Calling peekExactly multiple times in a row with the same value leads to
   * the same result.
   *
   * @param size The number of bytes to read
   * @returns The bytes read
   * @throws BufferUnderflowError if there are fewer than `size` bytes remaining
   */
  peekExactly: (size: number) => Buffer;

  /**
   * Invokes scanner with the next bytes in the stream, and returns the number
   * returned.
   *
   * This does not guarrantee that scanner will receive all of the remaining
   * bytes. It will indicate if it did via the `isEof` parameter. If `isEof`
   * is true, then the scanner must return a number. Otherwise, the
   * scanner may return null to indicate that it needs more data to complete
   * the scan. In that case, the scanner will be invoked again, this time
   * starting where the previous invocation left off.
   *
   * The scanner result is interpreted as an offset from the current position,
   * and the result from `scan` is the total offset from where the stream is
   * at. The scanner may return the special value `-1` to indicate that it
   * did not find what it was looking for, in which case this will also
   * return `-1`.
   *
   * If the scanner was on a boundary between two reads, then the scanner
   * can return an object with a `minOverlapOnNext` property. This is only
   * allowed if `isEof` is false. In this case, the scanner will be invoked
   * again, but rather than starting at the first byte after what it
   * just received, it will start at that position minus `minOverlapOnNext`.
   * `minOverlapOnNext` cannot exceed the size of the buffer recieved.
   *
   * @param scanner The scanner to invoke
   * @param offset If specified, the scan begins at this offset from the
   *   current position. The result will have this value added to it (unless
   *   the result is -1).
   * @returns The total offset from the start of the stream, or -1 if the
   *   item was not found.
   */
  scan: (scanner: PeekableScanner, offset?: number) => number;

  /**
   * How many bytes are remaining to be read.
   */
  get remaining(): number;

  /**
   * How many bytes have been read from the initial data source.
   */
  tell(): number;
}

/**
 * A peekable stream backed by a buffer. This is the common case for
 * peekable streams, though synchronous file-io is also a reasonable
 * implementation in specific cases.
 */
export class BufferPeekableStream implements PeekableStream {
  private readonly buffer: Buffer;
  private offset: number;

  constructor(buffer: Buffer, initialOffset: number = 0) {
    if (initialOffset > buffer.byteLength) {
      throw new Error('initial offset is beyond the end of the buffer');
    }

    this.buffer = buffer;
    this.offset = initialOffset;
  }

  get remaining() {
    return this.buffer.length - this.offset;
  }

  tell() {
    return this.offset;
  }

  read(maxSize: number): Buffer {
    const size = Math.min(maxSize, this.remaining);
    const result = this.buffer.subarray(this.offset, this.offset + size);
    this.offset += size;
    return result;
  }

  readExactly(size: number): Buffer {
    if (this.remaining < size) {
      throw new BufferUnderflowError();
    }
    const result = this.buffer.subarray(this.offset, this.offset + size);
    this.offset += size;
    return result;
  }

  advance(size: number): void {
    if (size < 0) {
      throw new Error('size must be non-negative');
    }
    if (this.remaining < size) {
      throw new BufferUnderflowError();
    }
    this.offset += size;
  }

  peek(maxSize: number): Buffer {
    const size = Math.min(maxSize, this.remaining);
    return this.buffer.subarray(this.offset, this.offset + size);
  }

  peekExactly(size: number): Buffer {
    if (this.remaining < size) {
      throw new BufferUnderflowError();
    }
    return this.buffer.subarray(this.offset, this.offset + size);
  }

  scan(scanner: PeekableScanner, offset: number = 0): number {
    const result = scanner(this.buffer.subarray(this.offset + offset), true);
    if (typeof result !== 'number') {
      throw new Error('scanner must return a number if isEof is true');
    }
    if (result === -1) {
      return -1;
    }
    return result + offset;
  }
}
