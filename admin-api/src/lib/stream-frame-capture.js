// @ts-check

const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { AppError } = require("./app-error");

const CAPTURE_TIMEOUT_MS = 15 * 1000;

function resolveBundledBinary(packageName, fallbackBinary) {
  try {
    const installer = require(packageName);
    if (installer && installer.path) {
      return installer.path;
    }
  } catch (_) {
    // Fall back to the system binary when the optional package is absent.
  }

  return fallbackBinary;
}

const DEFAULT_FFMPEG_PATH = process.env.FFMPEG_PATH || resolveBundledBinary("@ffmpeg-installer/ffmpeg", "ffmpeg");
const DEFAULT_FFPROBE_PATH = process.env.FFPROBE_PATH || resolveBundledBinary("@ffprobe-installer/ffprobe", "ffprobe");

function buildCommandError(binary, args, stderr) {
  return new AppError(
    "media_command_failed",
    stderr || `${binary} 执行失败`,
    502,
    {
      binary,
      args,
      stderr
    }
  );
}

function runCommand(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs || CAPTURE_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      if (timedOut) {
        reject(new AppError("capture_timeout", "抓图超时，请检查摄像头推流是否正常", 504, {
          binary,
          args,
          stderr
        }));
        return;
      }

      if (code !== 0) {
        reject(buildCommandError(binary, args, stderr));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function normalizeSourceUrl(stream = {}) {
  const sourceUrl = String(stream.sourceUrl || "").trim();
  if (!sourceUrl) {
    throw new AppError("missing_stream_url", "当前摄像头未配置主码流地址，无法执行抓图", 409);
  }
  return sourceUrl;
}

function buildCaptureArgs(stream, outputPath) {
  const protocol = String(stream.sourceProtocol || "").trim().toLowerCase();
  const sourceUrl = normalizeSourceUrl(stream);
  const args = ["-hide_banner", "-loglevel", "error", "-y"];

  if (protocol === "rtsp") {
    args.push("-rtsp_transport", "tcp");
  }

  args.push("-i", sourceUrl, "-frames:v", "1", "-q:v", "2", outputPath);
  return args;
}

function buildThumbnailArgs(inputPath, outputPath) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-vf",
    "scale=640:-1",
    "-frames:v",
    "1",
    outputPath
  ];
}

async function probeImageSize(inputPath) {
  try {
    const result = await runCommand(
      DEFAULT_FFPROBE_PATH,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0:s=x",
        inputPath
      ],
      { timeoutMs: 5 * 1000 }
    );
    const [width, height] = result.stdout.trim().split("x").map((value) => Number.parseInt(value, 10));
    return {
      width: Number.isFinite(width) ? width : null,
      height: Number.isFinite(height) ? height : null
    };
  } catch (_) {
    return {
      width: null,
      height: null
    };
  }
}

async function captureFrameToLocalFiles(stream, filePath, thumbnailPath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });

  await runCommand(DEFAULT_FFMPEG_PATH, buildCaptureArgs(stream, filePath));

  try {
    await runCommand(DEFAULT_FFMPEG_PATH, buildThumbnailArgs(filePath, thumbnailPath), {
      timeoutMs: 8 * 1000
    });
  } catch (_) {
    await fs.copyFile(filePath, thumbnailPath);
  }

  const stat = await fs.stat(filePath);
  const size = await probeImageSize(filePath);

  return {
    mimeType: "image/jpeg",
    fileSizeBytes: stat.size,
    imageWidth: size.width,
    imageHeight: size.height
  };
}

module.exports = {
  captureFrameToLocalFiles
};
