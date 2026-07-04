import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";

function openZip(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zipfile) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(zipfile);
    });
  });
}

function openEntryStream(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, readStream) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(readStream);
    });
  });
}

function createUploadError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isSymlink(entry) {
  const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
  return mode === 0o120000;
}

function validateEntryName(entryName) {
  if (!entryName || entryName.includes("\0")) {
    throw createUploadError("Zip 內含無效檔名");
  }
  if (entryName.includes("\\")) {
    throw createUploadError("Zip 內不能使用 Windows 路徑分隔符");
  }
  if (entryName.startsWith("/") || /^[a-zA-Z]:\//.test(entryName)) {
    throw createUploadError("Zip 內不能包含絕對路徑");
  }

  const normalized = path.posix.normalize(entryName);
  if (normalized === "." || normalized.startsWith("../") || normalized === "..") {
    throw createUploadError("Zip 內不能包含跳出目錄的路徑");
  }
  return normalized.replace(/\/$/, "");
}

function safeDestination(root, relativeName) {
  const destination = path.resolve(root, relativeName);
  const normalizedRoot = path.resolve(root);
  if (destination !== normalizedRoot && !destination.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw createUploadError("Zip 解壓路徑不安全");
  }
  return destination;
}

export async function extractStaticSiteZip(buffer, destination, limits) {
  if (!buffer?.length) {
    throw createUploadError("請上傳 zip 檔案");
  }

  await fs.promises.rm(destination, { recursive: true, force: true });
  await fs.promises.mkdir(destination, { recursive: true });

  let zipfile;
  let fileCount = 0;
  let totalBytes = 0;
  let hasRootIndex = false;

  try {
    zipfile = await openZip(buffer);

    await new Promise((resolve, reject) => {
      let settled = false;

      function fail(error) {
        if (settled) {
          return;
        }
        settled = true;
        zipfile.close();
        reject(error);
      }

      async function processEntry(entry) {
        try {
          if (isSymlink(entry)) {
            throw createUploadError("Zip 內不能包含 symbolic link");
          }

          const isDirectory = entry.fileName.endsWith("/");
          const normalizedName = validateEntryName(entry.fileName);

          if (isDirectory) {
            await fs.promises.mkdir(safeDestination(destination, normalizedName), { recursive: true });
            return;
          }

          fileCount += 1;
          totalBytes += entry.uncompressedSize;

          if (fileCount > limits.maxZipEntries) {
            throw createUploadError(`檔案數量超過限制 ${limits.maxZipEntries}`);
          }
          if (totalBytes > limits.maxUnzippedBytes) {
            throw createUploadError("解壓後檔案大小超過限制");
          }
          if (normalizedName === "index.html") {
            hasRootIndex = true;
          }

          const target = safeDestination(destination, normalizedName);
          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          const readStream = await openEntryStream(zipfile, entry);
          await pipeline(readStream, fs.createWriteStream(target, { flags: "wx" }));
        } catch (error) {
          fail(error);
        }
      }

      zipfile.on("entry", (entry) => {
        processEntry(entry).then(() => {
          if (!settled) {
            zipfile.readEntry();
          }
        });
      });

      zipfile.on("end", () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      });

      zipfile.on("error", fail);
      zipfile.readEntry();
    });

    if (!hasRootIndex) {
      throw createUploadError("靜態網站 zip 根目錄必須包含 index.html");
    }

    return { fileCount, totalBytes };
  } catch (error) {
    await fs.promises.rm(destination, { recursive: true, force: true });
    if (error.status) {
      throw error;
    }
    throw createUploadError("Zip 檔案無法解析或已損壞");
  } finally {
    zipfile?.close();
  }
}
