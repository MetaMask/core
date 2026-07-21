export type ArtifactPlatformConfig = {
  checksum: string;
  size?: number;
  url: string;
};

export type ArtifactConfig = {
  platforms: Record<string, ArtifactPlatformConfig | undefined>;
  version?: string;
};

export type InstallDependencies = {
  downloadFile?: (url: string, destination: string) => Promise<void>;
  extractArchive?: (archivePath: string, destination: string) => Promise<void>;
};
