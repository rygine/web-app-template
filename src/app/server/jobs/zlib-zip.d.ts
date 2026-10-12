// The zip API Node 26.8 added, until @types/node declares it (26.4 does not).
// Augments "node:zlib", which is the primary declaration; "zlib" re-exports it.
declare module "node:zlib" {
  import type { Readable } from "node:stream";

  type ZipData = Buffer | NodeJS.TypedArray | DataView | ArrayBuffer;

  type ZipEntryOptions = {
    comment?: string;
    mode?: number;
    modified?: Date;
    method?: "deflate" | "store" | "zstd";
  };

  type ZipContentOptions = {
    verify?: boolean;
    maxSize?: number;
  };

  class ZipEntry {
    static create(
      filename: string,
      data: ZipData,
      options?: ZipEntryOptions,
    ): Promise<ZipEntry>;
    static createSync(
      filename: string,
      data: ZipData,
      options?: ZipEntryOptions,
    ): ZipEntry;
    static createStream(
      filename: string,
      source: AsyncIterable<Uint8Array>,
      options?: ZipEntryOptions,
    ): ZipEntry;
    static read(buffer: ZipData): IterableIterator<ZipEntry>;

    readonly name: string;
    readonly size: number;
    readonly compressedSize: number;
    readonly compressed: boolean;
    readonly method: number;
    readonly crc32: number;
    readonly isFile: boolean;
    readonly isDirectory: boolean;

    content(options?: ZipContentOptions): Promise<Buffer>;
    contentSync(options?: ZipContentOptions): Buffer;
    contentIterator(options?: ZipContentOptions): AsyncIterableIterator<Buffer>;
  }

  class ZipBuffer {
    constructor(buffer: ZipData);
    readonly size: number;
    has(name: string): boolean;
    get(name: string): ZipEntry;
    entries(): IterableIterator<[string, ZipEntry]>;
    keys(): IterableIterator<string>;
    values(): IterableIterator<ZipEntry>;
  }

  class ZipFile {
    static open(
      filename: string,
      options?: { writable?: boolean },
    ): Promise<ZipFile>;
    readonly size: number;
    has(name: string): Promise<boolean>;
    get(name: string): Promise<ZipEntry>;
    entries(): Promise<IterableIterator<[string, ZipEntry]>>;
    close(): Promise<void>;
  }

  function createZipArchive(
    entries: ZipEntry[],
    options?: { comment?: string },
  ): Promise<Readable>;
}
