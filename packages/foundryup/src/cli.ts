import { exit } from "node:process";
import { downloadAndInstallFoundryBinaries } from "./";

downloadAndInstallFoundryBinaries().catch((error) => {
    console.error('Error:', error);
    exit(1);
});