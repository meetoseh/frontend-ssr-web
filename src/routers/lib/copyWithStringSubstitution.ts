import fs from 'fs';

export const copyWithStringSubstitution = async (
  src: string,
  dst: string,
  toReplace: string,
  replaceWith: string
) => {
  const readHandle = await fs.promises.open(src, 'r');
  const writeHandle = await fs.promises.open(dst, 'w');

  const toReplaceBytes = Buffer.from(toReplace, 'utf8');
  const replaceWithBytes = Buffer.from(replaceWith, 'utf8');

  try {
    const readBuffer = Buffer.alloc(16 * 1024);
    const writeBuffer = Buffer.alloc(16 * 1024);
    const readAmt = 8 * 1024;

    if (toReplaceBytes.length > readAmt) {
      throw new Error('cannot efficiently detect strings longer than read buffer');
    }

    if (replaceWithBytes.length > writeBuffer.length) {
      throw new Error('cannot write strings longer than write buffer');
    }

    let readBufferPos = 0;
    let readBufferLen = 0;

    let writeBufferLen = 0;

    const makeSpaceInWriteBuffer = async (space: number) => {
      if (space > writeBuffer.length) {
        throw new Error(`Cannot make space in write buffer for ${space} bytes`);
      }

      const writesAvailableContiguous = writeBuffer.length - writeBufferLen;
      if (writesAvailableContiguous >= space) {
        return;
      }

      // flush
      await writeHandle.write(writeBuffer.subarray(0, writeBufferLen));
      writeBufferLen = 0;
    };

    while (true) {
      if (readBufferPos + readBufferLen + readAmt > readBuffer.length) {
        // shift read buffer left
        readBuffer.copy(readBuffer, 0, readBufferPos, readBufferPos + readBufferLen);
        readBufferPos = 0;
      }

      const result = await readHandle.read(readBuffer, readBufferPos + readBufferLen, readAmt);
      const requiredToHoldInReadBuffer = result.bytesRead === 0 ? 0 : toReplaceBytes.length;

      readBufferLen += result.bytesRead;
      while (readBufferLen > requiredToHoldInReadBuffer) {
        const readBufferView = readBuffer.subarray(
          readBufferPos,
          readBufferPos + readBufferLen - requiredToHoldInReadBuffer
        );
        const nextMatch = readBufferView.indexOf(toReplaceBytes);
        if (nextMatch === -1) {
          await makeSpaceInWriteBuffer(readBufferView.length);
          readBufferView.copy(writeBuffer, writeBufferLen);
          writeBufferLen += readBufferView.length;
          readBufferPos += readBufferView.length;
          readBufferLen -= readBufferView.length;
          break;
        }

        if (nextMatch > 0) {
          await makeSpaceInWriteBuffer(nextMatch);
          readBufferView.copy(writeBuffer, writeBufferLen, 0, nextMatch);
          writeBufferLen += nextMatch;
          readBufferPos += nextMatch;
          readBufferLen -= nextMatch;
        }

        await makeSpaceInWriteBuffer(replaceWithBytes.length);
        replaceWithBytes.copy(writeBuffer, writeBufferLen);
        writeBufferLen += replaceWithBytes.length;
        readBufferPos += toReplaceBytes.length;
        readBufferLen -= toReplaceBytes.length;
      }

      if (result.bytesRead === 0) {
        break;
      }
    }

    if (writeBufferLen > 0) {
      await writeHandle.write(writeBuffer.subarray(0, writeBufferLen));
    }
  } finally {
    await readHandle.close();
    await writeHandle.close();
  }
};
