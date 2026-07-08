var FFmpegUtil = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // dist/esm/index.js
  var index_exports = {};
  __export(index_exports, {
    downloadWithProgress: () => downloadWithProgress,
    fetchFile: () => fetchFile,
    importScript: () => importScript,
    toBlobURL: () => toBlobURL
  });

  // dist/esm/errors.js
  var ERROR_RESPONSE_BODY_READER = new Error("failed to get response body reader");
  var ERROR_INCOMPLETED_DOWNLOAD = new Error("failed to complete download");

  // dist/esm/const.js
  var HeaderContentLength = "Content-Length";

  // dist/esm/index.js
  var readFromBlobOrFile = (blob) => new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.onload = () => {
      const { result } = fileReader;
      if (result instanceof ArrayBuffer) {
        resolve(new Uint8Array(result));
      } else {
        resolve(new Uint8Array());
      }
    };
    fileReader.onerror = (event) => {
      reject(Error(`File could not be read! Code=${event?.target?.error?.code || -1}`));
    };
    fileReader.readAsArrayBuffer(blob);
  });
  var fetchFile = async (file) => {
    let data;
    if (typeof file === "string") {
      if (/data:_data\/([a-zA-Z]*);base64,([^"]*)/.test(file)) {
        data = atob(file.split(",")[1]).split("").map((c) => c.charCodeAt(0));
      } else {
        data = await (await fetch(file)).arrayBuffer();
      }
    } else if (file instanceof URL) {
      data = await (await fetch(file)).arrayBuffer();
    } else if (file instanceof File || file instanceof Blob) {
      data = await readFromBlobOrFile(file);
    } else {
      return new Uint8Array();
    }
    return new Uint8Array(data);
  };
  var importScript = async (url) => new Promise((resolve) => {
    const script = document.createElement("script");
    const eventHandler = () => {
      script.removeEventListener("load", eventHandler);
      resolve();
    };
    script.src = url;
    script.type = "text/javascript";
    script.addEventListener("load", eventHandler);
    document.getElementsByTagName("head")[0].appendChild(script);
  });
  var downloadWithProgress = async (url, cb) => {
    const resp = await fetch(url);
    let buf;
    try {
      const total = parseInt(resp.headers.get(HeaderContentLength) || "-1");
      const reader = resp.body?.getReader();
      if (!reader)
        throw ERROR_RESPONSE_BODY_READER;
      const chunks = [];
      let received = 0;
      for (; ; ) {
        const { done, value } = await reader.read();
        const delta = value ? value.length : 0;
        if (done) {
          if (total != -1 && total !== received)
            throw ERROR_INCOMPLETED_DOWNLOAD;
          cb && cb({ url, total, received, delta, done });
          break;
        }
        chunks.push(value);
        received += delta;
        cb && cb({ url, total, received, delta, done });
      }
      const data = new Uint8Array(received);
      let position = 0;
      for (const chunk of chunks) {
        data.set(chunk, position);
        position += chunk.length;
      }
      buf = data.buffer;
    } catch (e) {
      console.log(`failed to send download progress event: `, e);
      buf = await resp.arrayBuffer();
      cb && cb({
        url,
        total: buf.byteLength,
        received: buf.byteLength,
        delta: 0,
        done: true
      });
    }
    return buf;
  };
  var toBlobURL = async (url, mimeType, progress = false, cb) => {
    const buf = progress ? await downloadWithProgress(url, cb) : await (await fetch(url)).arrayBuffer();
    const blob = new Blob([buf], { type: mimeType });
    return URL.createObjectURL(blob);
  };
  return __toCommonJS(index_exports);
})();
