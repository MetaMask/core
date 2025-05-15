declare module 'fs' {
  interface Dirent {
    parentPath: string;
  }
}