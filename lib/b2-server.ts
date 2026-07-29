import "server-only";

const PROJECTS_PREFIX = "projects/";
const VERIFIED_PREFIX = "projects/live-localization-project/";
const AUTHORIZE_URL =
  "https://api.backblazeb2.com/b2api/v4/b2_authorize_account";
const AUTH_CACHE_MILLISECONDS = 30 * 60 * 1000;

type B2Allowed = {
  buckets?: Array<{ id: string; name: string }>;
  capabilities?: string[];
  namePrefix?: string | null;
};

type B2AuthorizationResponse = {
  authorizationToken: string;
  apiInfo: {
    storageApi: {
      allowed: B2Allowed;
      apiUrl: string;
      downloadUrl: string;
    };
  };
};

export type B2File = {
  contentLength: number;
  contentType: string;
  fileName: string;
  uploadTimestamp: number;
};

export type B2Upload = {
  contentLength: number;
  contentSha1: string;
  contentType: string;
  fileId: string;
  fileName: string;
};

type B2Context = {
  apiUrl: string;
  authorizationToken: string;
  bucketId: string;
  bucketName: string;
  capabilities: string[];
  downloadUrl: string;
  namePrefix: string;
};

let cachedAuthorization:
  | { context: B2Context; expiresAt: number }
  | undefined;

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing_${name.toLowerCase()}`);
  }
  return value;
}

function safeProjectObjectKey(key: string): string {
  if (
    !key.startsWith(PROJECTS_PREFIX) ||
    key.length > 1024 ||
    key.includes("..") ||
    key.includes("\\") ||
    key.includes("\0")
  ) {
    throw new Error("b2_object_outside_projects_prefix");
  }
  return key;
}

function safeVerifiedObjectKey(key: string): string {
  if (!key.startsWith(VERIFIED_PREFIX)) {
    throw new Error("b2_object_outside_verified_project");
  }
  return safeProjectObjectKey(key);
}

function basicAuthorization(keyId: string, applicationKey: string): string {
  return `Basic ${btoa(`${keyId}:${applicationKey}`)}`;
}

function encodedFilePath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

async function authorizeB2(force = false): Promise<B2Context> {
  if (
    !force &&
    cachedAuthorization &&
    cachedAuthorization.expiresAt > Date.now()
  ) {
    return cachedAuthorization.context;
  }

  const keyId = requireEnvironment("B2_KEY_ID");
  const applicationKey = requireEnvironment("B2_APP_KEY");
  const bucketName = requireEnvironment("B2_BUCKET");
  const response = await fetch(AUTHORIZE_URL, {
    cache: "no-store",
    headers: {
      Authorization: basicAuthorization(keyId, applicationKey),
    },
  });
  if (!response.ok) {
    throw new Error(`b2_authorization_failed_${response.status}`);
  }

  const payload = (await response.json()) as B2AuthorizationResponse;
  const storage = payload.apiInfo?.storageApi;
  const allowed = storage?.allowed;
  const bucket = allowed?.buckets?.find((item) => item.name === bucketName);
  const capabilities = allowed?.capabilities ?? [];
  const namePrefix = allowed?.namePrefix ?? "";

  if (
    !payload.authorizationToken ||
    !storage?.apiUrl ||
    !storage.downloadUrl ||
    !bucket ||
    !capabilities.includes("readFiles") ||
    (namePrefix && !PROJECTS_PREFIX.startsWith(namePrefix))
  ) {
    throw new Error("b2_authorization_scope_mismatch");
  }

  const context: B2Context = {
    apiUrl: storage.apiUrl,
    authorizationToken: payload.authorizationToken,
    bucketId: bucket.id,
    bucketName,
    capabilities,
    downloadUrl: storage.downloadUrl,
    namePrefix,
  };
  cachedAuthorization = {
    context,
    expiresAt: Date.now() + AUTH_CACHE_MILLISECONDS,
  };
  return context;
}

async function fetchB2Object(
  key: string,
  options: {
    range?: string;
    retryAuthorization?: boolean;
    verifiedOnly?: boolean;
  } = {},
): Promise<Response> {
  const objectKey =
    options.verifiedOnly === false
      ? safeProjectObjectKey(key)
      : safeVerifiedObjectKey(key);
  const context = await authorizeB2();
  const url =
    `${context.downloadUrl}/file/${encodeURIComponent(context.bucketName)}/` +
    encodedFilePath(objectKey);
  const headers = new Headers({
    Authorization: context.authorizationToken,
  });
  if (options.range) headers.set("Range", options.range);

  const response = await fetch(url, {
    cache: "no-store",
    headers,
  });
  if (response.status === 401 && options.retryAuthorization !== false) {
    cachedAuthorization = undefined;
    await authorizeB2(true);
    return fetchB2Object(objectKey, {
      range: options.range,
      retryAuthorization: false,
      verifiedOnly: options.verifiedOnly,
    });
  }
  return response;
}

export async function getB2Json<T>(key: string): Promise<T> {
  return getJsonResponse<T>(await fetchB2Object(key));
}

export async function getB2ProjectJson<T>(key: string): Promise<T> {
  return getJsonResponse<T>(
    await fetchB2Object(key, { verifiedOnly: false }),
  );
}

async function getJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`b2_json_download_failed_${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    throw new Error("b2_json_content_type_invalid");
  }
  return (await response.json()) as T;
}

export async function listB2Files(prefix: string): Promise<B2File[]> {
  return listFiles(safeVerifiedObjectKey(prefix));
}

export async function listB2ProjectFiles(
  prefix: string,
): Promise<B2File[]> {
  return listFiles(safeProjectObjectKey(prefix));
}

async function listFiles(safePrefix: string): Promise<B2File[]> {
  const context = await authorizeB2();
  if (!context.capabilities.includes("listFiles")) return [];

  const response = await fetch(
    `${context.apiUrl}/b2api/v4/b2_list_file_names`,
    {
      body: JSON.stringify({
        bucketId: context.bucketId,
        maxFileCount: 1000,
        prefix: safePrefix,
      }),
      cache: "no-store",
      headers: {
        Authorization: context.authorizationToken,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
  if (!response.ok) return [];
  const payload = (await response.json()) as { files?: B2File[] };
  return Array.isArray(payload.files) ? payload.files : [];
}

function digestHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function uploadUrl(context: B2Context): Promise<{
  authorizationToken: string;
  uploadUrl: string;
}> {
  if (!context.capabilities.includes("writeFiles")) {
    throw new Error("b2_write_capability_missing");
  }
  const response = await fetch(
    `${context.apiUrl}/b2api/v4/b2_get_upload_url`,
    {
      body: JSON.stringify({ bucketId: context.bucketId }),
      cache: "no-store",
      headers: {
        Authorization: context.authorizationToken,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error(`b2_upload_url_failed_${response.status}`);
  }
  const payload = (await response.json()) as {
    authorizationToken?: string;
    uploadUrl?: string;
  };
  if (!payload.authorizationToken || !payload.uploadUrl) {
    throw new Error("b2_upload_url_invalid");
  }
  return {
    authorizationToken: payload.authorizationToken,
    uploadUrl: payload.uploadUrl,
  };
}

export async function putB2ProjectObject(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<B2Upload> {
  const objectKey = safeProjectObjectKey(key);
  const context = await authorizeB2();
  const upload = await uploadUrl(context);
  const sha1 = digestHex(
    await crypto.subtle.digest(
      "SHA-1",
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    ),
  );
  const response = await fetch(upload.uploadUrl, {
    body: bytes,
    headers: {
      Authorization: upload.authorizationToken,
      "Content-Length": String(bytes.byteLength),
      "Content-Type": contentType,
      "X-Bz-Content-Sha1": sha1,
      "X-Bz-File-Name": encodedFilePath(objectKey),
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`b2_upload_failed_${response.status}`);
  }
  const result = (await response.json()) as B2Upload;
  if (
    result.fileName !== objectKey ||
    result.contentLength !== bytes.byteLength ||
    result.contentSha1 !== sha1
  ) {
    throw new Error("b2_upload_verification_failed");
  }
  return result;
}

export async function putB2ProjectJson(
  key: string,
  value: unknown,
): Promise<B2Upload> {
  return putB2ProjectObject(
    key,
    new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`),
    "application/json",
  );
}

export async function proxyB2Object(
  key: string,
  range?: string | null,
): Promise<Response> {
  return proxyResponse(
    await fetchB2Object(key, {
      range: range ?? undefined,
    }),
  );
}

export async function proxyB2ProjectObject(
  key: string,
  range?: string | null,
): Promise<Response> {
  return proxyResponse(
    await fetchB2Object(key, {
      range: range ?? undefined,
      verifiedOnly: false,
    }),
  );
}

function proxyResponse(upstream: Response): Response {
  if (!upstream.ok && upstream.status !== 206) {
    return Response.json(
      { error: "verified_media_unavailable" },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const headers = new Headers();
  for (const name of [
    "accept-ranges",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(upstream.body, {
    headers,
    status: upstream.status,
  });
}
