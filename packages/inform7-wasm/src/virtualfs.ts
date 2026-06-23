/** A flat map of virtual filesystem paths to file contents. */
export type VirtualFS = Record<string, Uint8Array>;

/**
 * Parse a length-prefixed binary blob into a virtual filesystem.
 *
 * Format: [pathLen:4][path:pathLen][contentLen:4][content:contentLen] repeated
 *
 * This is the raw decompressed data from `internal.data.gz` — the caller is
 * responsible for loading and decompressing the file however their platform
 * requires.
 *
 * @param data  The decompressed binary blob
 * @returns     A flat path→Uint8Array map suitable for `virtualInternal`
 */
export function parseVirtualFS(data: Uint8Array): VirtualFS {
  const files: VirtualFS = {};
  let offset = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  while (offset < data.length) {
    const pathLen = view.getUint32(offset, true);
    offset += 4;
    const contentLen = view.getUint32(offset, true);
    offset += 4;
    const path = new TextDecoder().decode(data.subarray(offset, offset + pathLen));
    offset += pathLen;
    files[`/inform7/Internal${path}`] = data.subarray(offset, offset + contentLen);
    offset += contentLen;
  }

  return files;
}

/**
 * Create a virtual project filesystem.
 *
 * @param source The Inform 7 source text
 * @returns A flat path→Uint8Array map for the project directory
 */
export function createVirtualProject(source: string): VirtualFS {
  const encoder = new TextEncoder();
  return {
    "/story/Source/story.ni": encoder.encode(source),
  };
}
