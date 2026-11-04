import { cpSync } from "node:fs";

export function copyNodeModules(source, destination) {
  cpSync(source, destination, {
    recursive: true,
    // Preserve relative .bin symlinks so commands resolve packages from the copied tree.
    verbatimSymlinks: true,
  });
}
