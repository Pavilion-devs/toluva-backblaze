import "server-only";

const REQUIRED_PREFIX = "projects/live-localization-project/";
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

function safeObjectKey(key: string): string {
  if (
    !key.startsWith(REQUIRED_PREFIX) ||
    key.includes("..") ||
    key.includes("\\")
  ) {
    throw new Error("b2_object_outside_verified_project");
  }
  return key;
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
    (namePrefix && !REQUIRED_PREFIX.startsWith(namePrefix))
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
  options: { range?: string; retryAuthorization?: boolean } = {},
): Promise<Response> {
  const objectKey = safeObjectKey(key);
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
    });
  }
  return response;
}

export async function getB2Json<T>(key: string): Promise<T> {
  const response = await fetchB2Object(key);
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
  const safePrefix = safeObjectKey(prefix);
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

export async function proxyB2Object(
  key: string,
  range?: string | null,
): Promise<Response> {
  const upstream = await fetchB2Object(key, {
    range: range ?? undefined,
  });
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
