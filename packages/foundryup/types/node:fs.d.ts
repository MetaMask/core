declare module 'fs' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Dirent {
    parentPath: string;
  }
}
